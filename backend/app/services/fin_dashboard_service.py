"""Dashboard "por banco" do Fluxo Financeiro — demonstrativo em cascata de cada
conta bancária: saldo inicial → entradas → transferências → saídas → saldo
calculado, comparado com o saldo do extrato.

Query direta no service (mesmo padrão do dashboard consolidado atual). As
entradas de cliente (boletos/recibos) NÃO ficam em fin_movimentacoes — são lidas
das tabelas de origem, igual `fluxo_financeiro_service.fluxo_mensal`, mas
agrupadas por `banco_id` em vez de por CNPJ.
"""
from datetime import date
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
from app.models.condominio_model import Condominio
from app.schemas.fin_dashboard_schema import (
    DashboardBancoLinha, DashboardPorBancoResponse,
    EntradasBreakdown, SaidasBreakdown,
    DashboardCnpjLinha, DashboardPorCnpjResponse,
    EntradasCnpjBreakdown, SaidasCnpjBreakdown,
    LancamentoLinha, LancamentosCnpjResumo, LancamentosResponse,
)
import calendar as _calendar

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

    # ── Dashboard "por CNPJ" (Fechamento do Fluxo separado por empresa) ───────
    @staticmethod
    def por_cnpj(db: Session, ano: int, mes: int) -> DashboardPorCnpjResponse:
        """Fluxo do mês separado por CNPJ (CMPORT / TEC) + consolidado. NÃO faz
        query nova: compõe `FluxoFinanceiroService.fluxo_mensal` (entradas de
        serviço já separadas por CNPJ e tipo) com `FinDashboardService.por_banco`
        (saídas, transferências e conferência de saldo por conta, cada linha já
        rotulada com a empresa dona da conta).
        """
        from app.services.fluxo_financeiro_service import FluxoFinanceiroService
        from app.repositories.configuracao_repository import ConfiguracaoInterRepository

        fluxo = FluxoFinanceiroService.fluxo_mensal(db, ano, mes)
        banco = FinDashboardService.por_banco(db, ano, mes)

        # entradas de serviço por CNPJ (só dígitos) — do fluxo-mensal
        ent_por_cnpj = {_so_digitos(c.cnpj): c for c in fluxo.cnpjs}

        # agrupa as linhas do "por banco" pela empresa dona da conta
        grupo: dict[Optional[str], list[DashboardBancoLinha]] = {}
        for l in banco.bancos:
            grupo.setdefault(l.empresa, []).append(l)

        def _soma(vals):
            return _r2(sum((_d(v) for v in vals if v is not None), Z))

        def _monta_empresa(cnpj_digitos: str, razao: str, empresa: Optional[str]) -> DashboardCnpjLinha:
            ent = ent_por_cnpj.get(cnpj_digitos)
            linhas_emp = grupo.get(empresa, []) if empresa else []
            contas = [l for l in linhas_emp if l.banco_id is not None]

            entradas = EntradasCnpjBreakdown(
                manutencao=_d(ent.total_manutencao) if ent else Z,
                assistencia=_d(ent.total_assistencia) if ent else Z,
                produto=_d(ent.total_produto) if ent else Z,
                recibos=_d(ent.total_recibos) if ent else Z,
                transf_recebidas=_soma(l.transf_recebidas for l in contas),
            )
            entradas_total = _r2(
                entradas.manutencao + entradas.assistencia + entradas.produto
                + entradas.recibos + entradas.transf_recebidas
            )
            saidas = SaidasCnpjBreakdown(
                despesa=_soma(l.saidas.despesa for l in contas),
                fornecedor=_soma(l.saidas.fornecedor for l in contas),
                funcionario=_soma(l.saidas.funcionario for l in contas),
                tarifa=_soma(l.saidas.tarifa for l in contas),
                transf_enviadas=_soma(l.transf_enviadas for l in contas),
            )
            saidas_total = _r2(
                saidas.despesa + saidas.fornecedor + saidas.funcionario
                + saidas.tarifa + saidas.transf_enviadas
            )
            rendimento = _soma(l.rendimento for l in contas)
            saldo_mov = _r2(entradas_total + rendimento - saidas_total)

            # conferência: só fecha quando TODA conta da empresa tem os dois saldos
            completa = bool(contas) and all(
                l.saldo_inicial is not None and l.saldo_extrato is not None for l in contas
            )
            saldo_ini = _soma(l.saldo_inicial for l in contas) if any(l.saldo_inicial is not None for l in contas) else None
            saldo_calc = _soma(l.saldo_calculado for l in contas) if any(l.saldo_calculado is not None for l in contas) else None
            saldo_ext = _soma(l.saldo_extrato for l in contas) if any(l.saldo_extrato is not None for l in contas) else None
            if completa and saldo_calc is not None and saldo_ext is not None:
                dif = _r2(saldo_calc - saldo_ext)
                bate = abs(dif) < TOLERANCIA
            else:
                dif = None
                bate = None
            sem_saldo = [
                l.banco_nome for l in contas
                if l.saldo_inicial is None or l.saldo_extrato is None
            ]

            return DashboardCnpjLinha(
                cnpj=cnpj_digitos or None,
                razao_social=razao,
                empresa=empresa,
                entradas=entradas,
                entradas_total=entradas_total,
                saidas=saidas,
                saidas_total=saidas_total,
                rendimento=rendimento,
                saldo_movimento=saldo_mov,
                saldo_inicial=saldo_ini,
                saldo_calculado=saldo_calc,
                saldo_extrato=saldo_ext,
                diferenca=dif,
                bate=bate,
                conferencia_completa=completa,
                contas_sem_saldo=sem_saldo,
            )

        empresas: list[DashboardCnpjLinha] = []
        for cfg in ConfiguracaoInterRepository.get_all(db):
            digitos = _so_digitos(cfg.cnpj)
            empresas.append(_monta_empresa(
                digitos, cfg.razao_social or cfg.cnpj, EMPRESA_POR_CNPJ.get(digitos),
            ))

        # ── Sem CNPJ: só as SAÍDAS / transferências das contas sem empresa
        #    (as entradas já foram atribuídas a um CNPJ no fluxo-mensal) ────────
        sem_linhas = [l for l in grupo.get(None, [])]
        sem_cnpj = None
        if sem_linhas:
            s_saidas = SaidasCnpjBreakdown(
                despesa=_soma(l.saidas.despesa for l in sem_linhas),
                fornecedor=_soma(l.saidas.fornecedor for l in sem_linhas),
                funcionario=_soma(l.saidas.funcionario for l in sem_linhas),
                tarifa=_soma(l.saidas.tarifa for l in sem_linhas),
                transf_enviadas=_soma(l.transf_enviadas for l in sem_linhas),
            )
            s_saidas_total = _r2(
                s_saidas.despesa + s_saidas.fornecedor + s_saidas.funcionario
                + s_saidas.tarifa + s_saidas.transf_enviadas
            )
            s_entradas = EntradasCnpjBreakdown(
                transf_recebidas=_soma(l.transf_recebidas for l in sem_linhas),
            )
            s_entradas_total = _r2(s_entradas.transf_recebidas)
            s_rend = _soma(l.rendimento for l in sem_linhas)
            if any(v != Z for v in (
                s_saidas_total, s_entradas_total, s_rend,
            )):
                sem_cnpj = DashboardCnpjLinha(
                    cnpj=None,
                    razao_social="Sem CNPJ / sem banco identificado",
                    empresa=None,
                    entradas=s_entradas,
                    entradas_total=s_entradas_total,
                    saidas=s_saidas,
                    saidas_total=s_saidas_total,
                    rendimento=s_rend,
                    saldo_movimento=_r2(s_entradas_total + s_rend - s_saidas_total),
                    conferencia_completa=False,
                )

        # ── Consolidado ────────────────────────────────────────────────────
        partes = list(empresas) + ([sem_cnpj] if sem_cnpj else [])
        cons_entradas = EntradasCnpjBreakdown(
            manutencao=_r2(sum((p.entradas.manutencao for p in partes), Z)),
            assistencia=_r2(sum((p.entradas.assistencia for p in partes), Z)),
            produto=_r2(sum((p.entradas.produto for p in partes), Z)),
            recibos=_r2(sum((p.entradas.recibos for p in partes), Z)),
            transf_recebidas=_r2(sum((p.entradas.transf_recebidas for p in partes), Z)),
        )
        cons_saidas = SaidasCnpjBreakdown(
            despesa=_r2(sum((p.saidas.despesa for p in partes), Z)),
            fornecedor=_r2(sum((p.saidas.fornecedor for p in partes), Z)),
            funcionario=_r2(sum((p.saidas.funcionario for p in partes), Z)),
            tarifa=_r2(sum((p.saidas.tarifa for p in partes), Z)),
            transf_enviadas=_r2(sum((p.saidas.transf_enviadas for p in partes), Z)),
        )
        cons_entradas_total = _r2(sum((p.entradas_total for p in partes), Z))
        cons_saidas_total = _r2(sum((p.saidas_total for p in partes), Z))
        cons_rend = _r2(sum((p.rendimento for p in partes), Z))
        bc = banco.consolidado  # conferência consolidada = a mesma do "por banco"
        consolidado = DashboardCnpjLinha(
            cnpj=None,
            razao_social="Consolidado",
            empresa=None,
            entradas=cons_entradas,
            entradas_total=cons_entradas_total,
            saidas=cons_saidas,
            saidas_total=cons_saidas_total,
            rendimento=cons_rend,
            saldo_movimento=_r2(cons_entradas_total + cons_rend - cons_saidas_total),
            saldo_inicial=bc.saldo_inicial,
            saldo_calculado=bc.saldo_calculado,
            saldo_extrato=bc.saldo_extrato,
            diferenca=bc.diferenca,
            bate=bc.bate,
            conferencia_completa=bc.diferenca is not None,
            contas_sem_saldo=[
                l.banco_nome for l in banco.bancos
                if l.banco_id is not None and (l.saldo_inicial is None or l.saldo_extrato is None)
            ],
        )

        return DashboardPorCnpjResponse(
            ano=ano, mes=mes, empresas=empresas, sem_cnpj=sem_cnpj, consolidado=consolidado,
        )

    # ── Lançamentos do período (fluxo detalhado com filtros avançados) ───────
    @staticmethod
    def lancamentos(
        db: Session, ano: int, mes_inicio: int, mes_fim: int,
        cnpj: Optional[str] = None, tipo: Optional[str] = None,
        categoria_id: Optional[int] = None,
        valor_min: Optional[float] = None, valor_max: Optional[float] = None,
        busca: Optional[str] = None,
    ) -> LancamentosResponse:
        """Lista plana de tudo que entrou e saiu no intervalo de meses, com
        filtros. Entradas de cliente vêm de boletos/recibos (atribuídas ao CNPJ
        da conta que recebeu); o resto vem de fin_movimentacoes. Transferência
        interna vira 2 linhas: TRANSF_SAIDA (CNPJ de origem) + TRANSF_ENTRADA
        (CNPJ de destino), pra cada lado fechar certo."""
        from app.repositories.configuracao_repository import ConfiguracaoInterRepository

        if mes_fim < mes_inicio:
            mes_fim = mes_inicio
        d_ini = date(ano, mes_inicio, 1)
        d_fim = date(ano, mes_fim, _calendar.monthrange(ano, mes_fim)[1])

        cnpj_alvo = _so_digitos(cnpj) if cnpj else None
        busca_l = (busca or "").strip().lower() or None

        cnpjs_cfg = {_so_digitos(c.cnpj): (c.razao_social or c.cnpj)
                     for c in ConfiguracaoInterRepository.get_all(db)}
        bancos = {b.id: b for b in db.query(Banco).all()}

        def _empresa_e_cnpj(banco_id):
            b = bancos.get(banco_id) if banco_id else None
            if not b:
                return None, None
            dig = _so_digitos(b.cnpj_titular)
            return (EMPRESA_POR_CNPJ.get(dig), dig if dig in cnpjs_cfg else None)

        def _cat_grupo_bucket(grupo, nome_lower):
            if grupo == GrupoCategoria.FORNECEDOR.value:
                return "FORNECEDOR"
            if grupo == GrupoCategoria.FUNCIONARIO.value:
                return "FUNCIONARIO"
            if any(t in nome_lower for t in _TERMOS_TARIFA):
                return "TARIFA"
            return "DESPESA"

        linhas: list[LancamentoLinha] = []

        # ── Entradas de cliente: boletos de serviço PAGO/BAIXADO/PARCIAL ─────
        q_bol = (
            db.query(Boleto, NotaFiscal, Condominio, Banco)
            .join(NotaFiscal, Boleto.nota_fiscal_id == NotaFiscal.id)
            .join(Condominio, NotaFiscal.condominio_id == Condominio.id)
            .outerjoin(Banco, Boleto.banco_id == Banco.id)
            .filter(
                NotaFiscal.tipo.in_([TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA, TipoNota.PRODUTO]),
                NotaFiscal.status != StatusNota.CANCELADA,
                Boleto.situacao.in_([SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO, SituacaoBoleto.PARCIAL]),
                Boleto.data_pagamento >= d_ini, Boleto.data_pagamento <= d_fim,
            )
        )
        for bol, nota, cond, banco in q_bol.all():
            emp, dig_conta = _empresa_e_cnpj(bol.banco_id)
            dig = dig_conta or _so_digitos(nota.cnpj_emitente)
            emp = emp or EMPRESA_POR_CNPJ.get(dig)
            valor = _d(bol.valor_total_recebido) if bol.situacao == SituacaoBoleto.PARCIAL else _d(bol.valor_nominal)
            linhas.append(LancamentoLinha(
                data=bol.data_pagamento.isoformat(),
                descricao=f"{cond.nome} · NF {nota.numero_nota or '—'}",
                valor=_r2(valor), tipo="ENTRADA",
                subtipo=(nota.tipo.value if hasattr(nota.tipo, "value") else str(nota.tipo)),
                cnpj=dig or None, empresa=emp, categoria=None,
                banco_nome=(banco.nome if banco else None),
                origem="BOLETO", origem_id=bol.id,
            ))

        # ── Entradas de cliente: recibos ENTRADA PAGO sem nota vinculada ─────
        q_rec = (
            db.query(Recibo, Condominio, Banco)
            .outerjoin(Condominio, Recibo.condominio_id == Condominio.id)
            .outerjoin(ManutencaoAssistencia, ManutencaoAssistencia.recibo_id == Recibo.id)
            .outerjoin(Banco, Recibo.banco_id == Banco.id)
            .filter(
                Recibo.tipo == "ENTRADA", Recibo.status == "PAGO",
                Recibo.deletado_em.is_(None),
                Recibo.data_pagamento >= d_ini, Recibo.data_pagamento <= d_fim,
                (ManutencaoAssistencia.nota_fiscal_id.is_(None)) | (ManutencaoAssistencia.id.is_(None)),
            )
        )
        vistos_rec: set[int] = set()
        for rec, cond, banco in q_rec.all():
            if rec.id in vistos_rec:
                continue
            vistos_rec.add(rec.id)
            emp, dig_conta = _empresa_e_cnpj(rec.banco_id)
            dig = dig_conta or _so_digitos(rec.cnpj_emitente)
            emp = emp or EMPRESA_POR_CNPJ.get(dig)
            linhas.append(LancamentoLinha(
                data=rec.data_pagamento.isoformat(),
                descricao=f"{(cond.nome if cond else (rec.cliente_nome_avulso or 'Avulso'))} · {rec.numero_recibo}",
                valor=_r2(_d(rec.valor)), tipo="ENTRADA", subtipo="RECIBO",
                cnpj=dig or None, empresa=emp, categoria=None,
                banco_nome=(banco.nome if banco else None),
                origem="RECIBO", origem_id=rec.id,
            ))

        # ── fin_movimentacoes do período ────────────────────────────────────
        movs = (
            db.query(MovimentacaoFinanceira)
            .filter(
                MovimentacaoFinanceira.deletado_em.is_(None),
                MovimentacaoFinanceira.data >= d_ini,
                MovimentacaoFinanceira.data <= d_fim,
            )
            .all()
        )
        for m in movs:
            grupo = m.categoria.grupo if m.categoria else None
            nome = (m.categoria.nome if m.categoria else "").lower()
            cat_nome = m.categoria.nome if m.categoria else None
            valor = _r2(_d(m.valor))
            if m.tipo == "ENTRADA":
                if m.banco_origem_id is not None:
                    emp_o, dig_o = _empresa_e_cnpj(m.banco_origem_id)
                    emp_d, dig_d = _empresa_e_cnpj(m.banco_id)
                    linhas.append(LancamentoLinha(
                        data=m.data.isoformat(), descricao=m.descricao, valor=valor,
                        tipo="TRANSFERENCIA", subtipo="TRANSF_SAIDA",
                        cnpj=dig_o, empresa=emp_o, categoria=cat_nome,
                        banco_nome=(bancos[m.banco_origem_id].nome if m.banco_origem_id in bancos else None),
                        origem="MOVIMENTACAO", origem_id=m.id,
                    ))
                    linhas.append(LancamentoLinha(
                        data=m.data.isoformat(), descricao=m.descricao, valor=valor,
                        tipo="TRANSFERENCIA", subtipo="TRANSF_ENTRADA",
                        cnpj=dig_d, empresa=emp_d, categoria=cat_nome,
                        banco_nome=(bancos[m.banco_id].nome if m.banco_id in bancos else None),
                        origem="MOVIMENTACAO", origem_id=m.id,
                    ))
                else:
                    emp, dig = _empresa_e_cnpj(m.banco_id)
                    linhas.append(LancamentoLinha(
                        data=m.data.isoformat(), descricao=m.descricao, valor=valor,
                        tipo="ENTRADA",
                        subtipo=("RENDIMENTO" if "rendiment" in nome else "AVULSO"),
                        cnpj=dig, empresa=emp, categoria=cat_nome,
                        banco_nome=(bancos[m.banco_id].nome if m.banco_id in bancos else None),
                        origem="MOVIMENTACAO", origem_id=m.id,
                    ))
            else:  # SAIDA
                emp, dig = _empresa_e_cnpj(m.banco_id)
                linhas.append(LancamentoLinha(
                    data=m.data.isoformat(), descricao=m.descricao, valor=valor,
                    tipo="SAIDA", subtipo=_cat_grupo_bucket(grupo, nome),
                    cnpj=dig, empresa=emp, categoria=cat_nome,
                    banco_nome=(bancos[m.banco_id].nome if m.banco_id in bancos else None),
                    origem="MOVIMENTACAO", origem_id=m.id,
                ))

        # ── filtros ─────────────────────────────────────────────────────────
        cat_alvo_nome: Optional[str] = None
        if categoria_id is not None:
            from app.models.fin_categoria_model import CategoriaFinanceira
            cat = db.query(CategoriaFinanceira).filter(CategoriaFinanceira.id == categoria_id).first()
            cat_alvo_nome = cat.nome if cat else "\0"   # nome inexistente => nada casa

        def _passa(l: LancamentoLinha) -> bool:
            if cnpj_alvo and (l.cnpj or "") != cnpj_alvo:
                return False
            if tipo and l.tipo != tipo:
                return False
            if cat_alvo_nome is not None and (l.categoria or "") != cat_alvo_nome:
                return False
            v = float(l.valor)
            if valor_min is not None and v < valor_min:
                return False
            if valor_max is not None and v > valor_max:
                return False
            if busca_l and busca_l not in l.descricao.lower():
                return False
            return True

        linhas = [l for l in linhas if _passa(l)]
        linhas.sort(key=lambda l: (l.data, l.descricao), reverse=True)

        # ── resumo por CNPJ ─────────────────────────────────────────────────
        ENT = {"ENTRADA"}
        resumo: dict[Optional[str], LancamentosCnpjResumo] = {}

        def _res(dig: Optional[str]) -> LancamentosCnpjResumo:
            if dig not in resumo:
                resumo[dig] = LancamentosCnpjResumo(
                    cnpj=dig,
                    razao_social=(cnpjs_cfg.get(dig) if dig else "Sem CNPJ"),
                    empresa=EMPRESA_POR_CNPJ.get(dig or ""),
                )
            return resumo[dig]

        for l in linhas:
            r = _res(l.cnpj)
            r.qtd += 1
            if l.tipo == "ENTRADA" or l.subtipo == "TRANSF_ENTRADA":
                r.entradas = _r2(r.entradas + l.valor)
            else:
                r.saidas = _r2(r.saidas + l.valor)
        for r in resumo.values():
            r.saldo = _r2(r.entradas - r.saidas)

        ordem = list(cnpjs_cfg.keys())
        por_cnpj = sorted(
            resumo.values(),
            key=lambda r: (ordem.index(r.cnpj) if r.cnpj in ordem else 99),
        )
        consolidado = LancamentosCnpjResumo(
            cnpj=None, razao_social="Consolidado", empresa=None,
            entradas=_r2(sum((r.entradas for r in por_cnpj), Z)),
            saidas=_r2(sum((r.saidas for r in por_cnpj), Z)),
            saldo=_r2(sum((r.saldo for r in por_cnpj), Z)),
            qtd=sum(r.qtd for r in por_cnpj),
        )

        return LancamentosResponse(
            ano=ano, mes_inicio=mes_inicio, mes_fim=mes_fim,
            linhas=linhas, por_cnpj=por_cnpj, consolidado=consolidado,
        )
