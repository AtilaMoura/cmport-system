"""Export do Fluxo Financeiro completo em .xlsx — pro cliente.

Espelha a LÓGICA da planilha da cliente (regime de caixa: tudo por data de
pagamento), com formato próprio mais limpo. Abas:
  Resumo · Entradas · Saídas · Transferências · Categoria x Mês · (Pendências)

Fonte: FinDashboardService.por_banco (totais), FluxoFinanceiroService.fluxo_mensal
(entradas linha a linha), fin_movimentacoes (saídas/transferências linha a linha).
"""
import calendar
import io
from datetime import date
from typing import Optional

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.models.fin_movimentacao_model import MovimentacaoFinanceira
from app.models.fin_categoria_model import CategoriaFinanceira, GrupoCategoria
from app.models.condominio_model import Condominio
from app.models.banco_model import Banco
from app.models.despesa_model import Despesa, DespesaParcela, StatusParcelaDespesa
from app.models.funcionario_model import Funcionario
from app.services.fin_dashboard_service import FinDashboardService
from app.services.fluxo_financeiro_service import FluxoFinanceiroService

EMPRESA_POR_CNPJ = {"22761557000188": "CMPORT", "65756913000188": "TEC"}
_HDR_FILL = PatternFill(start_color="1e3a5f", end_color="1e3a5f", fill_type="solid")
_HDR_FONT = Font(color="FFFFFF", bold=True)
_TOT_FONT = Font(bold=True)
_TERMOS_TARIFA = ("tarifa", "juros", "iof", "ir sobre", "imposto sobre")


def _sd(v: Optional[str]) -> str:
    return "".join(filter(str.isdigit, v or ""))


def _f(v) -> float:
    return round(float(v or 0), 2)


def _meses(ano_ini, mes_ini, ano_fim, mes_fim):
    a, m = ano_ini, mes_ini
    while (a, m) <= (ano_fim, mes_fim):
        yield a, m
        m += 1
        if m > 12:
            m, a = 1, a + 1


def _cab(ws, headers):
    ws.append(headers)
    for i, _ in enumerate(headers, 1):
        c = ws.cell(row=1, column=i)
        c.fill, c.font = _HDR_FILL, _HDR_FONT
        c.alignment = Alignment(horizontal="center")


def _ajustar_largura(ws, com_filtro=True):
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = min(
            max((len(str(c.value or "")) for c in col), default=8) + 2, 55
        )
    ws.freeze_panes = "A2"
    if com_filtro and ws.max_row > 1:
        ws.auto_filter.ref = ws.dimensions


class FinExportService:

    @staticmethod
    def gerar_xlsx(db: Session, ano_ini: int, mes_ini: int, ano_fim: int, mes_fim: int,
                   cnpj: Optional[str] = None, incluir_pendentes: bool = True) -> bytes:
        cnpj_limpo = _sd(cnpj) if cnpj else None
        meses = list(_meses(ano_ini, mes_ini, ano_fim, mes_fim))
        rotulo_mes = {(a, m): f"{m:02d}/{a}" for a, m in meses}

        wb = Workbook()
        wb.remove(wb.active)

        # ── coletas ─────────────────────────────────────────────────────────
        resumo_rows = []          # (mes, cnpj, empresa, ...campos)
        entradas_rows = []
        saidas_rows = []
        transf_rows = []
        cat_mes: dict[str, dict] = {}   # categoria -> {(a,m): total}

        for a, m in meses:
            dash = FinDashboardService.por_banco(db, a, m)
            # agrega o dashboard por-banco em CNPJ
            por_cnpj: dict[str, dict] = {}
            for l in dash.bancos:
                if l.banco_id is None:
                    continue
                emp = l.empresa or "?"
                key = emp
                d = por_cnpj.setdefault(key, {
                    "saldo_inicial": 0.0, "ent_boleto": 0.0, "ent_recibo": 0.0, "ent_avulso": 0.0,
                    "transf_rec": 0.0, "transf_env": 0.0, "rendimento": 0.0,
                    "s_forn": 0.0, "s_desp": 0.0, "s_func": 0.0, "s_tar": 0.0,
                    "saldo_extrato": 0.0, "tem_extrato": False,
                })
                d["saldo_inicial"] += _f(l.saldo_inicial)
                d["ent_boleto"] += _f(l.entradas.boleto)
                d["ent_recibo"] += _f(l.entradas.recibo)
                d["ent_avulso"] += _f(l.entradas.avulso)
                d["transf_rec"] += _f(l.transf_recebidas)
                d["transf_env"] += _f(l.transf_enviadas)
                d["rendimento"] += _f(l.rendimento)
                d["s_forn"] += _f(l.saidas.fornecedor)
                d["s_desp"] += _f(l.saidas.despesa)
                d["s_func"] += _f(l.saidas.funcionario)
                d["s_tar"] += _f(l.saidas.tarifa)
                if l.saldo_extrato is not None:
                    d["saldo_extrato"] += _f(l.saldo_extrato)
                    d["tem_extrato"] = True

            for emp, d in sorted(por_cnpj.items()):
                if cnpj_limpo and EMPRESA_POR_CNPJ.get(cnpj_limpo) != emp:
                    continue
                ent_tot = round(d["ent_boleto"] + d["ent_recibo"] + d["ent_avulso"], 2)
                sai_tot = round(d["s_forn"] + d["s_desp"] + d["s_func"] + d["s_tar"], 2)
                saldo_mes = round(d["saldo_inicial"] + ent_tot + d["rendimento"]
                                  + d["transf_rec"] - d["transf_env"] - sai_tot, 2)
                resumo_rows.append({
                    "mes": rotulo_mes[(a, m)], "empresa": emp,
                    "saldo_inicial": d["saldo_inicial"],
                    "ent_boleto": d["ent_boleto"], "ent_recibo": d["ent_recibo"], "ent_avulso": d["ent_avulso"],
                    "ent_tot": ent_tot,
                    "transf_rec": d["transf_rec"], "transf_env": d["transf_env"], "rendimento": d["rendimento"],
                    "s_forn": d["s_forn"], "s_desp": d["s_desp"], "s_func": d["s_func"], "s_tar": d["s_tar"],
                    "sai_tot": sai_tot,
                    "saldo_mes": saldo_mes,
                    "saldo_extrato": d["saldo_extrato"] if d["tem_extrato"] else None,
                })

            # entradas linha a linha
            fx = FluxoFinanceiroService.fluxo_mensal(db, a, m, cnpj)
            for c in fx.cnpjs:
                emp = EMPRESA_POR_CNPJ.get(_sd(c.cnpj), c.cnpj)
                for ln in c.linhas:
                    entradas_rows.append([
                        rotulo_mes[(a, m)], emp, ln.condominio_nome, ln.tipo,
                        ln.numero_nota or "", ln.origem,
                        ln.data_pagamento.strftime("%d/%m/%Y") if ln.data_pagamento else "",
                        ln.valor, ln.banco_nome or "",
                        "cross-CNPJ" if ln.cross_cnpj else "",
                    ])
                    chave = f"Entrada — {ln.tipo.capitalize()}"
                    cat_mes.setdefault(chave, {})
                    cat_mes[chave][(a, m)] = round(cat_mes[chave].get((a, m), 0.0) + _f(ln.valor), 2)

            # saidas linha a linha (fin_movimentacoes SAIDA — razao reconciliado)
            FinExportService._coletar_saidas(db, a, m, rotulo_mes[(a, m)], cnpj_limpo, saidas_rows, cat_mes)
            # transferencias
            FinExportService._coletar_transf(db, a, m, rotulo_mes[(a, m)], cnpj_limpo, transf_rows, cat_mes)

        # ── aba Resumo ─────────────────────────────────────────────────────
        ws = wb.create_sheet("Resumo")
        _cab(ws, [
            "Mês", "Empresa", "Saldo inicial",
            "Entradas — Boletos", "Entradas — Recibos", "Entradas — Avulsos", "Entradas (total)",
            "Transf. recebidas", "Transf. enviadas", "Rendimento",
            "Saídas — Fornecedores", "Saídas — Despesas", "Saídas — Funcionário", "Saídas — Tarifas/IR",
            "Saídas (total)", "Saldo do mês", "Saldo do extrato",
        ])
        campos = ["saldo_inicial", "ent_boleto", "ent_recibo", "ent_avulso", "ent_tot",
                  "transf_rec", "transf_env", "rendimento",
                  "s_forn", "s_desp", "s_func", "s_tar", "sai_tot", "saldo_mes"]
        for r in resumo_rows:
            ws.append([r["mes"], r["empresa"]] + [round(r[c], 2) for c in campos]
                      + [r["saldo_extrato"]])
        if resumo_rows:
            tot = ["TOTAL", ""] + [round(sum(r[c] for r in resumo_rows), 2) for c in campos] + [""]
            ws.append(tot)
            for cell in ws[ws.max_row]:
                cell.font = _TOT_FONT
        _ajustar_largura(ws, com_filtro=False)

        # ── aba Entradas ──────────────────────────────────────────────────
        ws = wb.create_sheet("Entradas")
        _cab(ws, ["Mês", "Empresa", "Cliente/Condomínio", "Tipo", "Nota/Recibo", "Origem",
                  "Pagamento", "Valor", "Banco", "Obs"])
        for row in sorted(entradas_rows, key=lambda x: (x[0], x[1], x[6])):
            ws.append(row)
        _ajustar_largura(ws)

        # ── aba Saídas ────────────────────────────────────────────────────
        ws = wb.create_sheet("Saídas")
        _cab(ws, ["Mês", "Empresa", "Grupo", "Categoria", "Descrição", "Fornecedor/Funcionário",
                  "Pagamento", "Valor", "Banco", "Forma"])
        for row in sorted(saidas_rows, key=lambda x: (x[0], x[1], x[2], x[6])):
            ws.append(row)
        _ajustar_largura(ws)

        # ── aba Transferências ────────────────────────────────────────────
        ws = wb.create_sheet("Transferências")
        _cab(ws, ["Mês", "Data", "Valor", "De (conta)", "Para (conta)", "Categoria", "Descrição"])
        for row in sorted(transf_rows, key=lambda x: (x[0], x[1])):
            ws.append(row)
        _ajustar_largura(ws)

        # ── aba Categoria x Mês ───────────────────────────────────────────
        ws = wb.create_sheet("Categoria x Mês")
        _cab(ws, ["Categoria"] + [rotulo_mes[k] for k in meses] + ["Total"])
        for cat in sorted(cat_mes.keys()):
            linha = [cat]
            tot = 0.0
            for k in meses:
                v = round(cat_mes[cat].get(k, 0.0), 2)
                linha.append(v)
                tot += v
            linha.append(round(tot, 2))
            ws.append(linha)
        _ajustar_largura(ws)

        # ── aba Pendências (opcional) ─────────────────────────────────────
        if incluir_pendentes:
            ws = wb.create_sheet("Pendências")
            _cab(ws, ["Mês", "Empresa", "Tipo", "Cliente/Descrição", "Nota/Categoria",
                      "Vencimento", "Valor pendente", "Situação"])
            for a, m in meses:
                pend = FluxoFinanceiroService.pendencias_ate_mes(db, a, m, cnpj)
                for ln in pend.linhas:
                    if ln.situacao == "PAGO":
                        continue
                    ws.append([
                        rotulo_mes[(a, m)], ln.empresa or "", f"Entrada — {ln.tipo}",
                        ln.condominio_nome, ln.numero_nota or "",
                        ln.data_vencimento.strftime("%d/%m/%Y") if ln.data_vencimento else "",
                        _f(ln.valor_pendente), ln.situacao,
                    ])
                FinExportService._pendencias_saida(db, a, m, rotulo_mes[(a, m)], cnpj_limpo, ws)
            _ajustar_largura(ws)

        out = io.BytesIO()
        wb.save(out)
        return out.getvalue()

    # ──────────────────────────────────────────────────────────────────────
    @staticmethod
    def _coletar_saidas(db, ano, mes, rot, cnpj_limpo, saidas_rows, cat_mes):
        dp = aliased(DespesaParcela)
        d = aliased(Despesa)
        fn = aliased(Funcionario)
        b = aliased(Banco)
        c = aliased(CategoriaFinanceira)
        f = aliased(Condominio)
        q = (
            db.query(MovimentacaoFinanceira, c, f, b, d, fn)
            .outerjoin(c, c.id == MovimentacaoFinanceira.categoria_id)
            .outerjoin(f, f.id == MovimentacaoFinanceira.fornecedor_id)
            .outerjoin(b, b.id == MovimentacaoFinanceira.banco_id)
            .outerjoin(dp, dp.movimentacao_id == MovimentacaoFinanceira.id)
            .outerjoin(d, d.id == dp.despesa_id)
            .outerjoin(fn, fn.id == d.funcionario_id)
            .filter(
                MovimentacaoFinanceira.tipo == "SAIDA",
                MovimentacaoFinanceira.deletado_em.is_(None),
                func.year(MovimentacaoFinanceira.data) == ano,
                func.month(MovimentacaoFinanceira.data) == mes,
            )
        )
        for mov, cat, forn, banco, desp, func_ in q.all():
            cnpj_mov = _sd(banco.cnpj_titular) if banco else (_sd(desp.cnpj) if desp else "")
            if cnpj_limpo and cnpj_mov != cnpj_limpo:
                continue
            grupo = cat.grupo if cat else "?"
            nome_cat = cat.nome if cat else "-"
            nome_l = nome_cat.lower()
            if grupo == GrupoCategoria.FORNECEDOR.value:
                g_label = "Fornecedor"
            elif grupo == GrupoCategoria.FUNCIONARIO.value:
                g_label = "Funcionário"
            elif any(t in nome_l for t in _TERMOS_TARIFA):
                g_label = "Tarifa/IR"
            else:
                g_label = "Despesa"
            saidas_rows.append([
                rot, EMPRESA_POR_CNPJ.get(cnpj_mov, cnpj_mov or "?"), g_label, nome_cat,
                (mov.descricao or "")[:120],
                (func_.nome if func_ else (forn.nome if forn else "")),
                mov.data.strftime("%d/%m/%Y") if mov.data else "",
                _f(mov.valor), banco.nome if banco else "", mov.forma_pagamento or "",
            ])
            chave = f"Saída — {nome_cat}"
            cat_mes.setdefault(chave, {})
            cat_mes[chave][(ano, mes)] = round(cat_mes[chave].get((ano, mes), 0.0) + _f(mov.valor), 2)

    @staticmethod
    def _coletar_transf(db, ano, mes, rot, cnpj_limpo, transf_rows, cat_mes):
        bo = aliased(Banco)
        bd = aliased(Banco)
        c = aliased(CategoriaFinanceira)
        q = (
            db.query(MovimentacaoFinanceira, bo, bd, c)
            .outerjoin(bo, bo.id == MovimentacaoFinanceira.banco_origem_id)
            .outerjoin(bd, bd.id == MovimentacaoFinanceira.banco_id)
            .outerjoin(c, c.id == MovimentacaoFinanceira.categoria_id)
            .filter(
                MovimentacaoFinanceira.tipo == "ENTRADA",
                MovimentacaoFinanceira.deletado_em.is_(None),
                MovimentacaoFinanceira.banco_origem_id.isnot(None),
                func.year(MovimentacaoFinanceira.data) == ano,
                func.month(MovimentacaoFinanceira.data) == mes,
            )
        )
        for mov, borig, bdest, cat in q.all():
            if cnpj_limpo:
                cnpjs = {_sd(borig.cnpj_titular) if borig else "", _sd(bdest.cnpj_titular) if bdest else ""}
                if cnpj_limpo not in cnpjs:
                    continue
            transf_rows.append([
                rot, mov.data.strftime("%d/%m/%Y") if mov.data else "", _f(mov.valor),
                borig.nome + (f" ({borig.razao_social_titular})" if borig and borig.razao_social_titular else "") if borig else "?",
                bdest.nome + (f" ({bdest.razao_social_titular})" if bdest and bdest.razao_social_titular else "") if bdest else "?",
                cat.nome if cat else "", (mov.descricao or "")[:80],
            ])
            cat_mes.setdefault("Transferência interna", {})
            cat_mes["Transferência interna"][(ano, mes)] = round(
                cat_mes["Transferência interna"].get((ano, mes), 0.0) + _f(mov.valor), 2)

    @staticmethod
    def _pendencias_saida(db, ano, mes, rot, cnpj_limpo, ws):
        ultimo = date(ano, mes, calendar.monthrange(ano, mes)[1])
        primeiro = date(ano, mes, 1)
        q = (
            db.query(DespesaParcela, Despesa, CategoriaFinanceira)
            .join(Despesa, Despesa.id == DespesaParcela.despesa_id)
            .outerjoin(CategoriaFinanceira, CategoriaFinanceira.id == Despesa.categoria_id)
            .filter(
                Despesa.deletado_em.is_(None),
                DespesaParcela.status == StatusParcelaDespesa.PENDENTE,
                DespesaParcela.data_vencimento.between(primeiro, ultimo),
            )
        )
        for parc, desp, cat in q.all():
            if cnpj_limpo and _sd(desp.cnpj) != cnpj_limpo:
                continue
            ws.append([
                rot, EMPRESA_POR_CNPJ.get(_sd(desp.cnpj), desp.cnpj), "Saída — despesa/parcela",
                desp.descricao, cat.nome if cat else "",
                parc.data_vencimento.strftime("%d/%m/%Y") if parc.data_vencimento else "",
                _f(parc.valor), "PENDENTE",
            ])
