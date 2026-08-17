from datetime import datetime
from decimal import Decimal
from typing import Optional, List
import json

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, func

from app.models.fin_movimentacao_model import MovimentacaoFinanceira
from app.models.fin_categoria_model import CategoriaFinanceira, GrupoCategoria
from app.models.servico_model import ManutencaoAssistencia
from app.models.condominio_model import Condominio
from app.models.orcamento_model import Orcamento
from app.models.nota_fiscal_model import NotaFiscal
from app.models.ordem_servico_model import OrdemServico
from app.repositories.fin_movimentacao_repository import FinMovimentacaoRepository
from app.repositories.fin_saldo_inicial_repository import FinSaldoInicialRepository
from app.schemas.fin_movimentacao_schema import (
    MovimentacaoCreate, MovimentacaoUpdate,
    MovimentacaoResponse, DashboardFinanceiroResponse, SincronizarInterResponse,
    ServicoVinculadoResponse, OrcamentoVinculadoResponse,
    OsFornecedorReferenciaResponse,
)
from app.schemas.fin_saldo_inicial_schema import SaldoInicialUpsert, SaldoInicialResponse


class FinMovimentacaoService:

    @staticmethod
    def _montar_response(obj: MovimentacaoFinanceira) -> MovimentacaoResponse:
        r = MovimentacaoResponse.model_validate(obj)
        r.banco_nome = obj.banco.nome if obj.banco else None
        r.banco_origem_nome = obj.banco_origem.nome if obj.banco_origem else None
        r.fornecedor_nome = obj.fornecedor.nome if obj.fornecedor else None
        r.servicos_vinculados = [
            ServicoVinculadoResponse(
                id=s.id,
                tipo=s.tipo.value if hasattr(s.tipo, "value") else s.tipo,
                numero_os=s.numero_os,
                data_servico=s.data_servico,
                descricao=s.descricao,
                condominio_nome=s.condominio.nome if s.condominio else None,
                numero_nota=s.nota_fiscal.numero_nota if s.nota_fiscal else None,
            )
            for s in obj.servicos
        ]
        r.orcamentos_vinculados = [
            OrcamentoVinculadoResponse(
                id=o.id,
                auvo_public_id=o.auvo_public_id,
                customer_name=o.customer_name,
                net_total_value=o.net_total_value,
                request_date=o.request_date,
            )
            for o in obj.orcamentos
        ]
        r.os_fornecedor_vinculadas = [
            OsFornecedorReferenciaResponse(
                id=o.id,
                task_id=o.task_id,
                task_date=o.task_date,
                report=o.report,
                orientation=o.orientation,
            )
            for o in obj.os_fornecedor
        ]
        return r

    @staticmethod
    def _sync_vinculos(db: Session, obj: MovimentacaoFinanceira, servico_ids, orcamento_ids, os_fornecedor_ids) -> None:
        """Substitui o conjunto de servicos/orcamentos/OS-fornecedor vinculados pelos
        ids recebidos (lista vazia desvincula tudo; None/omitido nao mexe no vinculo atual)."""
        if servico_ids is not None:
            obj.servicos = db.query(ManutencaoAssistencia).filter(ManutencaoAssistencia.id.in_(servico_ids)).all() if servico_ids else []
        if orcamento_ids is not None:
            obj.orcamentos = db.query(Orcamento).filter(Orcamento.id.in_(orcamento_ids)).all() if orcamento_ids else []
        if os_fornecedor_ids is not None:
            obj.os_fornecedor = db.query(OrdemServico).filter(OrdemServico.id.in_(os_fornecedor_ids)).all() if os_fornecedor_ids else []
        db.commit()
        db.refresh(obj)

    @staticmethod
    def buscar_servicos(db: Session, q: Optional[str] = None, condominio_id: Optional[int] = None, limit: int = 20) -> List[ServicoVinculadoResponse]:
        from app.models.condominio_model import Condominio
        query = (
            db.query(ManutencaoAssistencia, NotaFiscal)
            .outerjoin(Condominio, ManutencaoAssistencia.condominio_id == Condominio.id)
            .outerjoin(NotaFiscal, ManutencaoAssistencia.nota_fiscal_id == NotaFiscal.id)
        )
        if condominio_id is not None:
            query = query.filter(ManutencaoAssistencia.condominio_id == condominio_id)
        if q:
            filtros = [ManutencaoAssistencia.numero_os.ilike(f"%{q}%"), Condominio.nome.ilike(f"%{q}%")]
            query = query.filter(or_(*filtros))
        resultados = (
            query.order_by(ManutencaoAssistencia.data_servico.desc())
            .limit(limit)
            .all()
        )
        return [
            ServicoVinculadoResponse(
                id=s.id,
                tipo=s.tipo.value if hasattr(s.tipo, "value") else s.tipo,
                numero_os=s.numero_os,
                data_servico=s.data_servico,
                descricao=s.descricao,
                condominio_nome=s.condominio.nome if s.condominio else None,
                numero_nota=nota.numero_nota if nota else None,
            )
            for s, nota in resultados
        ]

    @staticmethod
    def buscar_orcamentos(db: Session, q: Optional[str] = None, limit: int = 20) -> List[OrcamentoVinculadoResponse]:
        query = db.query(Orcamento)
        if q:
            filtros = [Orcamento.customer_name.ilike(f"%{q}%")]
            if q.isdigit():
                filtros.append(Orcamento.auvo_public_id == int(q))
            query = query.filter(or_(*filtros))
        resultados = (
            query.order_by(Orcamento.request_date.desc())
            .limit(limit)
            .all()
        )
        return [
            OrcamentoVinculadoResponse(
                id=o.id,
                auvo_public_id=o.auvo_public_id,
                customer_name=o.customer_name,
                net_total_value=o.net_total_value,
                request_date=o.request_date,
            )
            for o in resultados
        ]

    @staticmethod
    def buscar_os_fornecedor_referencia(db: Session, fornecedor_id: int) -> List[OsFornecedorReferenciaResponse]:
        """Busca ordens de serviço do Auvo do tipo 'Material - Fornecedores' do
        condomínio/fornecedor selecionado (usado como referência na tela Nova Saída)."""
        fornecedor = db.query(Condominio).filter(Condominio.id == fornecedor_id).first()
        if not fornecedor or not fornecedor.auvo_id:
            return []
        ordens = (
            db.query(OrdemServico)
            .filter(
                OrdemServico.customer_id == fornecedor.auvo_id,
                OrdemServico.task_type_description.like("Material - Fornecedores%"),
            )
            .order_by(OrdemServico.task_date.desc())
            .limit(20)
            .all()
        )
        return [
            OsFornecedorReferenciaResponse(
                id=o.id,
                task_id=o.task_id,
                task_date=o.task_date,
                report=o.report,
                orientation=o.orientation,
            )
            for o in ordens
        ]

    @staticmethod
    def listar(db: Session, mes=None, ano=None, tipo=None, grupo=None,
               categoria_id=None, origem=None, status=None, recibo_id=None,
               sem_servico_vinculado=None) -> List[MovimentacaoResponse]:
        movs = FinMovimentacaoRepository.listar(
            db, mes=mes, ano=ano, tipo=tipo, grupo=grupo,
            categoria_id=categoria_id, origem=origem, status=status, recibo_id=recibo_id,
            sem_servico_vinculado=sem_servico_vinculado,
        )
        return [FinMovimentacaoService._montar_response(m) for m in movs]

    @staticmethod
    def _resolver_categoria_por_fornecedor(db: Session, fornecedor_id: int) -> int:
        """Resolve/cria a categoria financeira do grupo FORNECEDOR com o mesmo
        nome do fornecedor escolhido. Retorna o id da categoria (criada
        automaticamente por trás se ainda não existir)."""
        fornecedor = db.query(Condominio).filter(Condominio.id == fornecedor_id).first()
        if not fornecedor or not fornecedor.nome:
            raise Exception("Fornecedor não encontrado.")
        nome = fornecedor.nome.strip()
        categoria = (
            db.query(CategoriaFinanceira)
            .filter(CategoriaFinanceira.grupo == GrupoCategoria.FORNECEDOR.value)
            .filter(func.lower(CategoriaFinanceira.nome) == nome.lower())
            .first()
        )
        if categoria:
            return categoria.id
        ultima_ordem = (
            db.query(func.max(CategoriaFinanceira.ordem))
            .filter(CategoriaFinanceira.grupo == GrupoCategoria.FORNECEDOR.value)
            .scalar()
        )
        nova = CategoriaFinanceira(
            nome=nome,
            grupo=GrupoCategoria.FORNECEDOR.value,
            tipo="SAIDA",
            ordem=(ultima_ordem or 0) + 1,
        )
        db.add(nova)
        db.commit()
        db.refresh(nova)
        return nova.id

    @staticmethod
    def criar(db: Session, req: MovimentacaoCreate) -> MovimentacaoResponse:
        dados = req.model_dump(exclude={"servico_ids", "orcamento_ids", "os_fornecedor_ids"})
        if dados.get("fornecedor_id") is not None and dados.get("categoria_id") is None:
            dados["categoria_id"] = FinMovimentacaoService._resolver_categoria_por_fornecedor(db, dados["fornecedor_id"])
        obj = FinMovimentacaoRepository.create(db, dados)
        FinMovimentacaoService._sync_vinculos(db, obj, req.servico_ids, req.orcamento_ids, req.os_fornecedor_ids)
        return FinMovimentacaoService._montar_response(obj)

    @staticmethod
    def atualizar(db: Session, id: int, req: MovimentacaoUpdate) -> MovimentacaoResponse:
        obj = FinMovimentacaoRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Movimentação não encontrada.")
        dados = {k: v for k, v in req.model_dump(exclude={"servico_ids", "orcamento_ids", "os_fornecedor_ids"}).items() if v is not None}
        if req.fornecedor_id is not None and req.categoria_id is None:
            dados["categoria_id"] = FinMovimentacaoService._resolver_categoria_por_fornecedor(db, req.fornecedor_id)
        obj = FinMovimentacaoRepository.update(db, obj, dados)
        FinMovimentacaoService._sync_vinculos(db, obj, req.servico_ids, req.orcamento_ids, req.os_fornecedor_ids)
        return FinMovimentacaoService._montar_response(obj)

    @staticmethod
    def validar(db: Session, id: int) -> MovimentacaoResponse:
        obj = FinMovimentacaoRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Movimentação não encontrada.")
        obj = FinMovimentacaoRepository.update(db, obj, {"status": "VALIDADO"})
        return MovimentacaoResponse.model_validate(obj)

    @staticmethod
    def deletar(db: Session, id: int):
        from app.routers.auditoria_router import registrar_exclusao
        obj = FinMovimentacaoRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Movimentação não encontrada.")
        dados = {
            "id": obj.id, "data": str(obj.data), "descricao": obj.descricao,
            "valor": str(obj.valor), "tipo": obj.tipo, "origem": obj.origem,
        }
        registrar_exclusao(db, "fin_movimentacao", id, dados)
        FinMovimentacaoRepository.update(db, obj, {"deletado_em": datetime.utcnow()})

    @staticmethod
    def _calcular_totais_mes(db: Session, mes: int, ano: int) -> dict:
        movs = FinMovimentacaoRepository.listar_por_periodo(db, mes, ano)
        entradas = Decimal(0)
        por_grupo: dict[str, Decimal] = {
            GrupoCategoria.RECEITA: Decimal(0),
            GrupoCategoria.FORNECEDOR: Decimal(0),
            GrupoCategoria.DESPESA: Decimal(0),
        }
        for m in movs:
            v = Decimal(str(m.valor))
            if m.tipo == "ENTRADA":
                entradas += v
                por_grupo[GrupoCategoria.RECEITA] += v
            else:
                if m.categoria and m.categoria.grupo == GrupoCategoria.FORNECEDOR:
                    por_grupo[GrupoCategoria.FORNECEDOR] += v
                else:
                    por_grupo[GrupoCategoria.DESPESA] += v
        saidas = por_grupo[GrupoCategoria.FORNECEDOR] + por_grupo[GrupoCategoria.DESPESA]
        saldo_ini_obj = FinSaldoInicialRepository.get(db, ano, mes)
        saldo_ini = Decimal(str(saldo_ini_obj.valor)) if saldo_ini_obj else Decimal(0)
        saldo_mes = saldo_ini + entradas - saidas
        return {
            "saldo_inicial": saldo_ini,
            "entradas": entradas,
            "fornecedores": por_grupo[GrupoCategoria.FORNECEDOR],
            "despesas": por_grupo[GrupoCategoria.DESPESA],
            "saidas": saidas,
            "saldo_mes": saldo_mes,
            "por_grupo": {k.value if hasattr(k, "value") else k: float(v) for k, v in por_grupo.items()},
        }

    @staticmethod
    def dashboard(db: Session, mes: int, ano: int) -> DashboardFinanceiroResponse:
        totais = FinMovimentacaoService._calcular_totais_mes(db, mes, ano)
        # saldo acumulado = soma de saldo_mes de jan até mes
        acumulado = Decimal(0)
        for m in range(1, mes + 1):
            t = FinMovimentacaoService._calcular_totais_mes(db, m, ano)
            acumulado += t["saldo_mes"]
        return DashboardFinanceiroResponse(
            mes=mes,
            ano=ano,
            saldo_inicial=totais["saldo_inicial"],
            entradas=totais["entradas"],
            fornecedores=totais["fornecedores"],
            despesas=totais["despesas"],
            saidas=totais["saidas"],
            saldo_mes=totais["saldo_mes"],
            saldo_acumulado=acumulado,
            por_grupo=totais["por_grupo"],
        )

    @staticmethod
    def sincronizar_inter(db: Session, data_inicio: str, data_fim: str) -> SincronizarInterResponse:
        from app.services.inter_client import InterClient
        from app.models.configuracao_model import ConfiguracaoInter
        conta = (
            db.query(ConfiguracaoInter)
            .filter(
                ConfiguracaoInter.ativo == True,  # noqa
                ConfiguracaoInter.tipo_nota == "SERVICO",
                ConfiguracaoInter.client_id != None,  # noqa
            )
            .first()
        )
        if not conta:
            raise Exception("Nenhuma conta Inter com credenciais configuradas encontrada.")

        client = InterClient(
            client_id=conta.client_id,
            client_secret=conta.client_secret,
            conta_corrente=conta.conta_corrente,
            cert_path=conta.cert_path,
        )
        transacoes = client.buscar_extrato(data_inicio, data_fim)
        novas = duplicadas = erros = 0
        for t in transacoes:
            id_ext = t.get("codigoTransacao") or t.get("idTransacao")
            if not id_ext:
                erros += 1
                continue
            try:
                tipo = "ENTRADA" if t.get("tipoOperacao", "").upper() in ("C", "CREDITO", "CREDIT") else "SAIDA"
                mov = MovimentacaoFinanceira(
                    data=t.get("dataEntrada") or t.get("dataLancamento"),
                    descricao=t.get("descricao") or t.get("titulo") or "Extrato Inter",
                    valor=abs(Decimal(str(t.get("valor", 0)))),
                    tipo=tipo,
                    origem="BANCO",
                    status="PENDENTE",
                    id_externo_banco=id_ext,
                )
                db.add(mov)
                db.commit()
                novas += 1
            except IntegrityError:
                db.rollback()
                duplicadas += 1
            except Exception:
                db.rollback()
                erros += 1

        return SincronizarInterResponse(
            novas=novas,
            duplicadas=duplicadas,
            erros=erros,
            mensagem=f"{novas} importada(s), {duplicadas} duplicada(s), {erros} erro(s).",
        )

    @staticmethod
    def get_saldo_inicial(db: Session, ano: int, mes: int) -> SaldoInicialResponse:
        from app.models.fin_saldo_inicial_model import SaldoInicial
        obj = FinSaldoInicialRepository.get(db, ano, mes)
        if not obj:
            from datetime import datetime as dt
            obj = SaldoInicial(id=0, ano=ano, mes=mes, valor=Decimal(0),
                               criado_em=dt.utcnow(), atualizado_em=dt.utcnow())
        return SaldoInicialResponse.model_validate(obj)

    @staticmethod
    def upsert_saldo_inicial(db: Session, ano: int, mes: int, req: SaldoInicialUpsert) -> SaldoInicialResponse:
        obj = FinSaldoInicialRepository.upsert(db, ano, mes, req.valor, req.observacao)
        return SaldoInicialResponse.model_validate(obj)
