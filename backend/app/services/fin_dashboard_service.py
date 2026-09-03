"""Dashboard "por banco" do Fluxo Financeiro — demonstrativo em cascata de cada
conta bancária: saldo inicial → entradas → transferências → saídas → saldo
calculado, comparado com o saldo do extrato.

Query direta no service (mesmo padrão do dashboard consolidado atual). As
entradas de cliente (boletos/recibos) NÃO ficam em fin_movimentacoes — são lidas
das tabelas de origem, igual `fluxo_financeiro_service.fluxo_mensal`, mas
agrupadas por `banco_id` em vez de por CNPJ.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.banco_model import Banco
from app.models.boleto_model import Boleto, SituacaoBoleto
from app.models.recibo_model import Recibo
from app.models.nota_fiscal_model import NotaFiscal, TipoNota, StatusNota
from app.models.servico_model import ManutencaoAssistencia
from app.models.fin_movimentacao_model import MovimentacaoFinanceira
from app.models.fin_categoria_model import GrupoCategoria
from app.repositories.fin_saldo_inicial_repository import FinSaldoInicialRepository
from app.repositories.fin_extrato_saldo_repository import FinExtratoSaldoRepository
from app.schemas.fin_dashboard_schema import (
    DashboardBancoLinha, DashboardPorBancoResponse,
    EntradasBreakdown, SaidasBreakdown,
)

Z = Decimal("0.00")
CENTAVO = Decimal("0.01")
TOLERANCIA = Decimal("0.02")

EMPRESA_POR_CNPJ = {
    "22761557000188": "CMPORT",
    "65756913000188": "TEC",
}

# categoria (nome, lower) que representa tarifa/juros e não "despesa de escritório"
_TERMOS_TARIFA = ("tarifa", "juros", "iof", "ir sobre", "imposto sobre")


def _d(v) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def _r2(v: Decimal) -> Decimal:
    return v.quantize(CENTAVO, rounding=ROUND_HALF_UP)


def _so_digitos(v: Optional[str]) -> str:
    return "".join(filter(str.isdigit, v or ""))


class _Acc:
    """Acumuladores de uma conta (ou da linha 'sem banco')."""
    __slots__ = ("boleto", "recibo", "avulso", "transf_rec", "transf_env",
                 "rendimento", "s_forn", "s_desp", "s_func", "s_tar")

    def __init__(self):
        for s in self.__slots__:
            setattr(self, s, Z)


class FinDashboardService:

    @staticmethod
    def por_banco(db: Session, ano: int, mes: int) -> DashboardPorBancoResponse:
        bancos = db.query(Banco).filter(Banco.ativo == True).order_by(Banco.id).all()  # noqa: E712
        bancos_por_id = {b.id: b for b in bancos}

        acc: dict[Optional[int], _Acc] = {}

        def a(banco_id: Optional[int]) -> _Acc:
            return acc.setdefault(banco_id, _Acc())

        # ── Entradas de cliente: boletos de serviço PAGO/BAIXADO/PARCIAL ──────
        boletos = (
            db.query(
                Boleto.banco_id, Boleto.situacao,
                Boleto.valor_nominal, Boleto.valor_total_recebido,
            )
            .join(NotaFiscal, Boleto.nota_fiscal_id == NotaFiscal.id)
            .filter(
                NotaFiscal.tipo.in_([TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA, TipoNota.PRODUTO]),
                NotaFiscal.status != StatusNota.CANCELADA,
                Boleto.situacao.in_([SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO, SituacaoBoleto.PARCIAL]),
                func.year(Boleto.data_pagamento) == ano,
                func.month(Boleto.data_pagamento) == mes,
            )
            .all()
        )
        for banco_id, situacao, v_nom, v_rec in boletos:
            valor = _d(v_rec) if situacao == SituacaoBoleto.PARCIAL else _d(v_nom)
            a(banco_id).boleto += _r2(valor)

        # ── Entradas de cliente: recibos ENTRADA PAGO sem nota vinculada ─────
        recibos_rows = (
            db.query(Recibo.id, Recibo.banco_id, Recibo.valor)
            .outerjoin(ManutencaoAssistencia, ManutencaoAssistencia.recibo_id == Recibo.id)
            .filter(
                Recibo.tipo == "ENTRADA",
                Recibo.status == "PAGO",
                Recibo.deletado_em.is_(None),
                func.year(Recibo.data_pagamento) == ano,
                func.month(Recibo.data_pagamento) == mes,
                (ManutencaoAssistencia.nota_fiscal_id.is_(None)) | (ManutencaoAssistencia.id.is_(None)),
            )
            .all()
        )
        vistos_recibo: set[int] = set()   # dedupe: recibo com N serviços vinha N vezes
        for rid, banco_id, valor in recibos_rows:
            if rid in vistos_recibo:
                continue
            vistos_recibo.add(rid)
            a(banco_id).recibo += _r2(_d(valor))

        # ── Movimentações do mês (transferências, rendimento, saídas) ────────
        movs = (
            db.query(MovimentacaoFinanceira)
            .filter(
                MovimentacaoFinanceira.deletado_em.is_(None),
                func.year(MovimentacaoFinanceira.data) == ano,
                func.month(MovimentacaoFinanceira.data) == mes,
            )
            .all()
        )
        for m in movs:
            valor = _r2(_d(m.valor))
            grupo = m.categoria.grupo if m.categoria else None
            nome = (m.categoria.nome if m.categoria else "").lower()

            if m.tipo == "ENTRADA":
                if m.banco_origem_id is not None:
                    # transferência entre contas próprias: conta como entrada no
                    # destino e como saída na origem
                    a(m.banco_id).transf_rec += valor
                    a(m.banco_origem_id).transf_env += valor
                elif "rendiment" in nome:
                    a(m.banco_id).rendimento += valor
                else:
                    a(m.banco_id).avulso += valor
            else:  # SAIDA
                if grupo == GrupoCategoria.FORNECEDOR.value:
                    a(m.banco_id).s_forn += valor
                elif grupo == GrupoCategoria.FUNCIONARIO.value:
                    a(m.banco_id).s_func += valor
                elif any(t in nome for t in _TERMOS_TARIFA):
                    a(m.banco_id).s_tar += valor
                else:
                    a(m.banco_id).s_desp += valor

        # ── Monta cada linha ────────────────────────────────────────────────
        def montar(banco_id: Optional[int], nome_fallback: str) -> DashboardBancoLinha:
            x = acc.get(banco_id) or _Acc()
            banco = bancos_por_id.get(banco_id) if banco_id else None

            entradas = EntradasBreakdown(
                boleto=_r2(x.boleto), recibo=_r2(x.recibo), avulso=_r2(x.avulso),
            )
            entradas_total = _r2(x.boleto + x.recibo + x.avulso)
            saidas = SaidasBreakdown(
                fornecedor=_r2(x.s_forn), despesa=_r2(x.s_desp),
                funcionario=_r2(x.s_func), tarifa=_r2(x.s_tar),
            )
            saidas_total = _r2(x.s_forn + x.s_desp + x.s_func + x.s_tar)
            transf_rec = _r2(x.transf_rec)
            transf_env = _r2(x.transf_env)
            rendimento = _r2(x.rendimento)

            si = FinSaldoInicialRepository.get(db, ano, mes, banco_id) if banco_id else None
            ex = FinExtratoSaldoRepository.get(db, banco_id, ano, mes) if banco_id else None

            saldo_inicial = _d(si.valor) if si else None
            saldo_calc = None
            if saldo_inicial is not None:
                saldo_calc = _r2(
                    saldo_inicial + entradas_total + rendimento + transf_rec
                    - transf_env - saidas_total
                )
            saldo_ext = _d(ex.saldo_final) if ex else None
            diferenca = _r2(saldo_calc - saldo_ext) if (saldo_calc is not None and saldo_ext is not None) else None
            bate = (abs(diferenca) < TOLERANCIA) if diferenca is not None else None

            if banco:
                nome = banco.nome
                if banco.razao_social_titular:
                    nome = f"{banco.nome} ({banco.razao_social_titular})"
                empresa = EMPRESA_POR_CNPJ.get(_so_digitos(banco.cnpj_titular))
            else:
                nome = nome_fallback
                empresa = None

            return DashboardBancoLinha(
                banco_id=banco_id,
                banco_nome=nome,
                empresa=empresa,
                saldo_inicial=saldo_inicial,
                saldo_inicial_informado=si is not None,
                entradas=entradas,
                entradas_total=entradas_total,
                transf_recebidas=transf_rec,
                transf_enviadas=transf_env,
                rendimento=rendimento,
                saidas=saidas,
                saidas_total=saidas_total,
                saldo_calculado=saldo_calc,
                saldo_extrato=saldo_ext,
                saldo_extrato_fonte=(ex.fonte if ex else None),
                diferenca=diferenca,
                bate=bate,
            )

        linhas = [montar(b.id, b.nome) for b in bancos]

        # linha "Sem banco identificado" — só aparece se tiver algum movimento
        sem = acc.get(None)
        if sem and any(getattr(sem, s) != Z for s in _Acc.__slots__):
            linhas.append(montar(None, "Sem banco identificado"))

        # ── Consolidado ────────────────────────────────────────────────────
        def soma_opt(vals):
            presentes = [v for v in vals if v is not None]
            return _r2(sum(presentes, Z)) if presentes else None

        cons_saldo_ini = soma_opt([l.saldo_inicial for l in linhas])
        cons_ext = soma_opt([l.saldo_extrato for l in linhas])
        cons_entradas = EntradasBreakdown(
            boleto=_r2(sum((l.entradas.boleto for l in linhas), Z)),
            recibo=_r2(sum((l.entradas.recibo for l in linhas), Z)),
            avulso=_r2(sum((l.entradas.avulso for l in linhas), Z)),
        )
        cons_saidas = SaidasBreakdown(
            fornecedor=_r2(sum((l.saidas.fornecedor for l in linhas), Z)),
            despesa=_r2(sum((l.saidas.despesa for l in linhas), Z)),
            funcionario=_r2(sum((l.saidas.funcionario for l in linhas), Z)),
            tarifa=_r2(sum((l.saidas.tarifa for l in linhas), Z)),
        )
        cons_entradas_total = _r2(sum((l.entradas_total for l in linhas), Z))
        cons_saidas_total = _r2(sum((l.saidas_total for l in linhas), Z))
        cons_transf_rec = _r2(sum((l.transf_recebidas for l in linhas), Z))
        cons_transf_env = _r2(sum((l.transf_enviadas for l in linhas), Z))
        cons_rend = _r2(sum((l.rendimento for l in linhas), Z))
        cons_calc = None
        if cons_saldo_ini is not None:
            cons_calc = _r2(
                cons_saldo_ini + cons_entradas_total + cons_rend + cons_transf_rec
                - cons_transf_env - cons_saidas_total
            )
        cons_dif = _r2(cons_calc - cons_ext) if (cons_calc is not None and cons_ext is not None) else None

        consolidado = DashboardBancoLinha(
            banco_id=None,
            banco_nome="Consolidado",
            saldo_inicial=cons_saldo_ini,
            saldo_inicial_informado=cons_saldo_ini is not None,
            entradas=cons_entradas,
            entradas_total=cons_entradas_total,
            transf_recebidas=cons_transf_rec,
            transf_enviadas=cons_transf_env,
            rendimento=cons_rend,
            saidas=cons_saidas,
            saidas_total=cons_saidas_total,
            saldo_calculado=cons_calc,
            saldo_extrato=cons_ext,
            diferenca=cons_dif,
            bate=(abs(cons_dif) < TOLERANCIA) if cons_dif is not None else None,
        )

        return DashboardPorBancoResponse(ano=ano, mes=mes, bancos=linhas, consolidado=consolidado)
