from datetime import datetime
from decimal import Decimal
from typing import Optional, List
import json

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.fin_movimentacao_model import MovimentacaoFinanceira
from app.models.fin_categoria_model import CategoriaFinanceira, GrupoCategoria
from app.repositories.fin_movimentacao_repository import FinMovimentacaoRepository
from app.repositories.fin_saldo_inicial_repository import FinSaldoInicialRepository
from app.schemas.fin_movimentacao_schema import (
    MovimentacaoCreate, MovimentacaoUpdate,
    MovimentacaoResponse, DashboardFinanceiroResponse, SincronizarInterResponse,
)
from app.schemas.fin_saldo_inicial_schema import SaldoInicialUpsert, SaldoInicialResponse


class FinMovimentacaoService:

    @staticmethod
    def listar(db: Session, mes=None, ano=None, tipo=None, grupo=None,
               categoria_id=None, origem=None, status=None) -> List[MovimentacaoResponse]:
        movs = FinMovimentacaoRepository.listar(
            db, mes=mes, ano=ano, tipo=tipo, grupo=grupo,
            categoria_id=categoria_id, origem=origem, status=status,
        )
        return [MovimentacaoResponse.model_validate(m) for m in movs]

    @staticmethod
    def criar(db: Session, req: MovimentacaoCreate) -> MovimentacaoResponse:
        dados = req.model_dump()
        obj = FinMovimentacaoRepository.create(db, dados)
        return MovimentacaoResponse.model_validate(obj)

    @staticmethod
    def atualizar(db: Session, id: int, req: MovimentacaoUpdate) -> MovimentacaoResponse:
        obj = FinMovimentacaoRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Movimentação não encontrada.")
        dados = {k: v for k, v in req.model_dump().items() if v is not None}
        obj = FinMovimentacaoRepository.update(db, obj, dados)
        return MovimentacaoResponse.model_validate(obj)

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
