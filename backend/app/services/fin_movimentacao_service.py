import re
import unicodedata
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
import json

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, func


def _normalizar_texto(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()

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
    OsFornecedorReferenciaResponse, SugestaoParcelaResponse,
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
               sem_servico_vinculado=None, cnpj=None) -> List[MovimentacaoResponse]:
        movs = FinMovimentacaoRepository.listar(
            db, mes=mes, ano=ano, tipo=tipo, grupo=grupo,
            categoria_id=categoria_id, origem=origem, status=status, recibo_id=recibo_id,
            sem_servico_vinculado=sem_servico_vinculado, cnpj=cnpj,
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
        """Puxa o extrato (GET banking/v2/extrato) de TODAS as contas Inter com
        credencial e importa as SAÍDAS como MovimentacaoFinanceira origem=BANCO
        status=PENDENTE, pra tela de Conciliação. Só saída — a entrada já é
        100% coberta pelo sync de cobranças (BoletoService.sincronizar_do_inter),
        importar entrada aqui duplicaria receita no dashboard.

        A resposta do Inter não tem nenhum ID de transação (só dataEntrada,
        tipoOperacao, valor, titulo, descricao) — a dedupe usa uma chave
        sintética (hash de banco+data+valor+descrição+ordem de ocorrência),
        que cobre até o caso de 2 transações idênticas no mesmo dia."""
        import hashlib
        from app.services.inter_client import InterClient
        from app.models.configuracao_model import ConfiguracaoInter
        from app.models.banco_model import Banco

        contas = (
            db.query(ConfiguracaoInter)
            .filter(ConfiguracaoInter.ativo == True, ConfiguracaoInter.client_id.isnot(None))  # noqa: E712
            .all()
        )
        if not contas:
            raise Exception("Nenhuma conta Inter com credenciais configuradas encontrada.")

        novas = duplicadas = erros = 0
        for cfg in contas:
            banco = db.query(Banco).filter(
                Banco.configuracao_inter_id == cfg.id, Banco.ativo.is_(True)
            ).first()
            if not banco:
                continue
            try:
                client = InterClient(
                    client_id=cfg.client_id, client_secret=cfg.client_secret,
                    conta_corrente=cfg.conta_corrente, cert_path=cfg.cert_path,
                )
                transacoes = client.consultar_extrato(data_inicio, data_fim)
            except Exception:
                erros += 1
                continue

            contagem: dict[str, int] = {}
            for t in transacoes:
                if t.get("tipoOperacao") != "D":
                    continue
                data_t = t.get("dataEntrada", "")
                valor_t = str(t.get("valor", "0"))
                titulo = t.get("titulo", "")
                descricao = t.get("descricao", "")
                assinatura = f"{banco.id}|{data_t}|{valor_t}|{titulo}|{descricao}"
                n = contagem.get(assinatura, 0)
                contagem[assinatura] = n + 1
                id_ext = hashlib.sha256(f"{assinatura}|{n}".encode()).hexdigest()[:40]

                try:
                    mov = MovimentacaoFinanceira(
                        data=data_t,
                        descricao=f"{titulo} - {descricao}".strip(" -") or "Extrato Inter",
                        valor=abs(Decimal(valor_t)),
                        tipo="SAIDA",
                        origem="BANCO",
                        status="PENDENTE",
                        banco_id=banco.id,
                        id_externo_banco=id_ext,
                    )
                    db.add(mov)
                    db.commit()
                    db.refresh(mov)
                    sugestao_id = FinMovimentacaoService._sugerir_parcela(db, mov)
                    if sugestao_id:
                        FinMovimentacaoRepository.update(db, mov, {"parcela_sugerida_id": sugestao_id})
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
    def _sugerir_parcela(db: Session, mov: MovimentacaoFinanceira) -> Optional[int]:
        """Acha a melhor DespesaParcela PENDENTE pra sugerir como origem dessa
        saída importada do extrato: mesmo CNPJ da conta bancária e valor
        dentro de ±R$0,02. Quando há mais de uma candidata com o mesmo valor
        (comum — valores redondos se repetem entre despesas diferentes),
        desempata primeiro por semelhança de texto entre a descrição do
        extrato e o nome do fornecedor/categoria/despesa, só depois por
        proximidade de data — se fosse só por data, "Acordo FGTS" podia ganhar
        de um fornecedor completamente diferente só por coincidência de valor."""
        from app.models.despesa_model import Despesa, DespesaParcela
        from app.models.banco_model import Banco

        banco = db.query(Banco).filter(Banco.id == mov.banco_id).first()
        if not banco or not banco.cnpj_titular:
            return None
        cnpj = "".join(c for c in banco.cnpj_titular if c.isdigit())
        tol = Decimal("0.02")

        candidatas = (
            db.query(DespesaParcela)
            .join(Despesa, Despesa.id == DespesaParcela.despesa_id)
            .filter(
                DespesaParcela.status == "PENDENTE",
                DespesaParcela.valor >= float(mov.valor - tol),
                DespesaParcela.valor <= float(mov.valor + tol),
                func.replace(func.replace(func.replace(Despesa.cnpj, ".", ""), "/", ""), "-", "") == cnpj,
            )
            .all()
        )
        if not candidatas:
            return None
        if len(candidatas) == 1:
            return candidatas[0].id

        desc_extrato = _normalizar_texto(mov.descricao)

        def pontuacao(p: DespesaParcela) -> tuple:
            d = p.despesa
            nomes = [d.fornecedor.nome if d.fornecedor_id else None,
                     d.funcionario.nome if d.funcionario_id else None, d.descricao]
            similar = any(
                nome and _normalizar_texto(nome)[:6] in desc_extrato
                for nome in nomes if nome
            )
            return (0 if similar else 1, abs((p.data_vencimento - mov.data).days))

        candidatas.sort(key=pontuacao)
        return candidatas[0].id

    @staticmethod
    def confirmar_parcela(db: Session, mov_id: int, parcela_id: int) -> MovimentacaoResponse:
        """Confirma que uma saída importada do extrato (sugerida ou escolhida
        manualmente) é o pagamento de uma parcela de despesa — marca a parcela
        como PAGO vinculada a essa movimentação (sem criar uma nova) e valida
        a movimentação."""
        from app.services.despesa_service import DespesaService
        from app.repositories.despesa_repository import DespesaRepository

        mov = FinMovimentacaoRepository.get_by_id(db, mov_id)
        if not mov:
            raise Exception("Movimentação não encontrada.")
        parcela = DespesaRepository.get_parcela_by_id(db, parcela_id)
        if not parcela:
            raise Exception("Parcela não encontrada.")
        if parcela.status != "PENDENTE":
            raise Exception("Essa parcela já está paga.")

        DespesaService._marcar_pago_interno(
            db, parcela, mov.data, mov.banco_id, mov.forma_pagamento or "PIX",
            movimentacao=mov,
        )
        db.refresh(mov)
        return FinMovimentacaoService._montar_response(mov)

    @staticmethod
    def listar_pendentes_banco(db: Session, ano: Optional[int] = None, mes: Optional[int] = None,
                                cnpj: Optional[str] = None) -> List[MovimentacaoResponse]:
        """Lista as saídas importadas do extrato (origem=BANCO) ainda não
        confirmadas, pra tela de Conciliação — cada uma já com a sugestão de
        parcela embutida."""
        from app.models.despesa_model import DespesaParcela
        from app.models.banco_model import Banco

        q = db.query(MovimentacaoFinanceira).filter(
            MovimentacaoFinanceira.origem == "BANCO",
            MovimentacaoFinanceira.status == "PENDENTE",
            MovimentacaoFinanceira.tipo == "SAIDA",
            MovimentacaoFinanceira.deletado_em.is_(None),
        )
        if ano:
            q = q.filter(func.year(MovimentacaoFinanceira.data) == ano)
        if mes:
            q = q.filter(func.month(MovimentacaoFinanceira.data) == mes)
        if cnpj:
            cnpj_limpo = "".join(c for c in cnpj if c.isdigit())
            q = q.join(Banco, Banco.id == MovimentacaoFinanceira.banco_id).filter(
                func.replace(func.replace(func.replace(Banco.cnpj_titular, ".", ""), "/", ""), "-", "") == cnpj_limpo
            )
        movs = q.order_by(MovimentacaoFinanceira.data.desc()).all()

        parcela_ids = [m.parcela_sugerida_id for m in movs if m.parcela_sugerida_id]
        parcelas_map = {}
        if parcela_ids:
            parcelas_map = {
                p.id: p for p in db.query(DespesaParcela).filter(DespesaParcela.id.in_(parcela_ids)).all()
            }

        resultado = []
        for m in movs:
            r = FinMovimentacaoService._montar_response(m)
            p = parcelas_map.get(m.parcela_sugerida_id) if m.parcela_sugerida_id else None
            if p:
                d = p.despesa
                origem = "FORNECEDOR" if d.fornecedor_id else ("FUNCIONARIO" if d.funcionario_id else "DESPESA")
                r.sugestao = SugestaoParcelaResponse(
                    parcela_id=p.id,
                    despesa_id=d.id,
                    despesa_descricao=d.descricao,
                    origem=origem,
                    fornecedor_nome=d.fornecedor.nome if d.fornecedor_id else None,
                    funcionario_nome=d.funcionario.nome if d.funcionario_id else None,
                    categoria_nome=d.categoria.nome if d.categoria_id else None,
                    numero_parcela=p.numero_parcela,
                    total_parcelas=p.total_parcelas,
                    valor=p.valor,
                    data_vencimento=p.data_vencimento,
                )
            resultado.append(r)
        return resultado

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
