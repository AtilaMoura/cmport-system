r"""
diagnostico.py — Diagnóstico completo CMPort: banco + XMLs/ZIPs + API Inter

Uso:
    python diagnostico.py                                      # só banco
    python diagnostico.py --xml "pasta/ou/arquivo"             # banco + XMLs
    python diagnostico.py --inter                              # banco + boletos do Inter
    python diagnostico.py --inter --data-inicio 2025-01-01     # período customizado
    python diagnostico.py --xml notas.zip --inter --salvar     # tudo junto

Pré-requisito: venv ativado (venv\Scripts\activate)

Seções geradas:
  1. Condominios          — cadastro, CNPJ, contatos
  2. Notas Fiscais        — vencidas, sem cond., parcelas=NULL
  3. Serviços             — notas sem serviço, duplicados
  4. Boletos (DB)         — listagem completa, divergências de valor, parcelas, $ sem cond.
  5. Cruzamentos          — prontas para boleto, ranking inadimplência
  6. Resumo Financeiro    — recebido, pendente, taxa
  7. XMLs/ZIPs            — classificação por arquivo
  8. Inter API            — dump raw de todas as cobranças do banco
"""

import sys, os, re, zipfile, io, argparse, xml.etree.ElementTree as ET
from datetime import datetime, date
from collections import defaultdict
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# Utilidades gerais
# ─────────────────────────────────────────────────────────────────────────────
SEP  = "=" * 100
SEP2 = "-" * 100
FMT  = "%d/%m/%Y"

def w_append(linhas, s=""):
    linhas.append(s)

def fmt_brl(v):
    try:
        return f"R$ {float(v):>12,.2f}".replace(",","X").replace(".",",").replace("X",".")
    except Exception:
        return "R$ ???"

def fmt_d(d):
    if d is None: return "—"
    if isinstance(d, str): return d[:10]
    try: return d.strftime(FMT)
    except Exception: return str(d)

def col(label, valor, w=45):
    return f"  {label:<{w}} {valor}"

def secao(titulo):
    return f"\n{SEP}\n  {titulo}\n{SEP}"

def sub(titulo):
    return f"\n{SEP2}\n  {titulo}\n{SEP2}"

def limpar_cnpj(s):
    return re.sub(r"\D", "", s or "")

# ─────────────────────────────────────────────────────────────────────────────
# .env e engine
# ─────────────────────────────────────────────────────────────────────────────
def carregar_env(path=".env"):
    env = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env

def criar_engine(env):
    from sqlalchemy import create_engine
    url = (
        f"mysql+pymysql://{env.get('DB_USER','root')}:"
        f"{env.get('DB_PASSWORD','')}@"
        f"{env.get('DB_HOST','localhost')}:"
        f"{env.get('DB_PORT','3306')}/"
        f"{env.get('DB_NAME','cmport_gerenciamento')}?charset=utf8mb4"
    )
    return create_engine(url, echo=False)

def ler(conn, sql, params=None):
    from sqlalchemy import text
    res = conn.execute(text(sql), params or {})
    cols = list(res.keys())
    return [dict(zip(cols, row)) for row in res.fetchall()]

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 1 — CONDOMINIOS
# ─────────────────────────────────────────────────────────────────────────────
def sec_condominios(conn, linhas):
    W = w_append
    condominios = ler(conn, "SELECT * FROM condominios ORDER BY id")
    enderecos   = ler(conn, "SELECT * FROM enderecos")
    contatos    = ler(conn, "SELECT * FROM contatos")

    end_map  = {e["condominio_id"]: e for e in enderecos}
    cont_map = defaultdict(list)
    for c in contatos:
        cont_map[c["condominio_id"]].append(c)

    sem_cnpj    = [c for c in condominios if not c.get("cnpj")]
    sem_end     = [c for c in condominios if c["id"] not in end_map]
    sem_cont    = [c for c in condominios if c["id"] not in cont_map]
    inativos    = [c for c in condominios if not c.get("ativo")]

    W(linhas, secao("1. CONDOMINIOS"))
    W(linhas, col("Total cadastrados", len(condominios)))
    W(linhas, col("  Com CNPJ",        len(condominios) - len(sem_cnpj)))
    W(linhas, col("  Sem CNPJ ⚠",      len(sem_cnpj),  30) + "  (boleto impossível sem CNPJ)")
    W(linhas, col("  Com endereço",    len(condominios) - len(sem_end)))
    W(linhas, col("  Sem endereço",    len(sem_end)))
    W(linhas, col("  Com contato",     len(condominios) - len(sem_cont)))
    W(linhas, col("  Sem contato ⚠",   len(sem_cont),  30) + "  (email/tel faltam no boleto)")
    W(linhas, col("  Inativos",        len(inativos)))

    if sem_cnpj:
        W(linhas, sub(f"⚠  {len(sem_cnpj)} condomínios SEM CNPJ"))
        for c in sem_cnpj:
            W(linhas, f"  #{c['id']:5d}  {c['nome']}")

    return condominios, end_map, cont_map

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 2 — NOTAS FISCAIS
# ─────────────────────────────────────────────────────────────────────────────
def sec_notas(conn, condominios, linhas):
    W = w_append
    notas = ler(conn,
        "SELECT n.*, c.nome AS cond_nome, c.cnpj AS cond_cnpj "
        "FROM notas_fiscais n "
        "LEFT JOIN condominios c ON c.id = n.condominio_id "
        "ORDER BY n.id")

    hoje = date.today()
    cnpj_por_cond = {c["id"]: c.get("cnpj") for c in condominios}

    por_tipo   = defaultdict(list)
    por_status = defaultdict(list)
    for n in notas:
        por_tipo[str(n.get("tipo","?"))].append(n)
        por_status[str(n.get("status","?"))].append(n)

    ativas      = [n for n in notas if str(n.get("status","")) != "CANCELADA"]
    sem_cond    = [n for n in ativas if not n.get("condominio_id")]
    sem_cnpj_n  = [n for n in ativas if n.get("condominio_id") and not cnpj_por_cond.get(n["condominio_id"])]
    vencidas    = [n for n in ativas if n.get("data_vencimento") and n["data_vencimento"] < hoje and not n.get("data_pagamento")]
    pagas       = [n for n in notas if n.get("data_pagamento")]
    parceladas  = [n for n in ativas if (n.get("parcelas") or 1) > 1]
    canceladas  = por_status.get("CANCELADA", [])
    parcelas_null = [n for n in ativas if n.get("parcelas") is None]

    W(linhas, secao("2. NOTAS FISCAIS"))
    W(linhas, col("Total",             len(notas)))
    W(linhas, col("  Ativas",          len(ativas)))
    W(linhas, col("  Canceladas",      len(canceladas)))
    W(linhas, "")
    for k in sorted(por_tipo):
        v = por_tipo[k]
        W(linhas, col(f"  Tipo {k}", f"{len(v):4d}  |  {fmt_brl(sum(float(x['valor'] or 0) for x in v))}"))
    W(linhas, "")
    W(linhas, col("Sem condomínio vinculado ⚠",    len(sem_cond)))
    W(linhas, col("Com cond. mas sem CNPJ ⚠",      len(sem_cnpj_n)))
    W(linhas, col("Vencidas sem pagamento ⚠",       len(vencidas)))
    W(linhas, col("Com data_pagamento preenchida",  len(pagas)))
    W(linhas, col("Parceladas (parcelas > 1)",      len(parceladas)))
    W(linhas, col("Com parcelas = NULL ⚠",          len(parcelas_null), 30) + "  (risco de crash ao gerar boleto)")

    # ── Detalhes vencidas ─────────────────────────────────────────────────
    if vencidas:
        W(linhas, sub(f"⚠  {len(vencidas)} NOTAS VENCIDAS sem pagamento"))
        W(linhas, f"  {'ID':>6}  {'Número':<22}  {'Valor':>14}  {'Venc':>10}  {'Tipo':<12}  Condomínio")
        W(linhas, "  " + "-"*96)
        for n in sorted(vencidas, key=lambda x: x["data_vencimento"]):
            dias = (hoje - n["data_vencimento"]).days
            W(linhas, f"  #{n['id']:5d}  {str(n['numero_nota']):<22}  {fmt_brl(n['valor']):>14}  "
                      f"{fmt_d(n['data_vencimento'])}  {str(n['tipo']):<12}  "
                      f"{n.get('cond_nome') or '—'}  ({dias}d atraso)")

    # ── Sem condomínio ────────────────────────────────────────────────────
    if sem_cond:
        W(linhas, sub(f"⚠  {len(sem_cond)} notas SEM condomínio (CNPJ não cruzou)"))
        W(linhas, f"  {'ID':>6}  {'Número':<22}  {'Valor':>14}  {'Venc':>10}  Cliente / Emitente")
        W(linhas, "  " + "-"*96)
        for n in sem_cond:
            W(linhas, f"  #{n['id']:5d}  {str(n['numero_nota']):<22}  {fmt_brl(n['valor']):>14}  "
                      f"{fmt_d(n.get('data_vencimento'))}  {n.get('cliente_nome') or '—'}")
            obs = n.get("observacao") or ""
            if obs:
                W(linhas, f"         Observação: {obs[:90]}")

    if sem_cnpj_n:
        W(linhas, sub(f"⚠  {len(sem_cnpj_n)} notas cujo condomínio não tem CNPJ cadastrado"))
        for n in sem_cnpj_n:
            W(linhas, f"  #{n['id']:5d}  {str(n['numero_nota']):<22}  {fmt_brl(n['valor'])}  cond:#{n['condominio_id']} {n.get('cond_nome')}")

    if parcelas_null:
        W(linhas, sub(f"🔴  {len(parcelas_null)} notas com parcelas = NULL (risco de crash)"))
        W(linhas, "  Essas notas vão causar erro de divisão por zero ao tentar gerar boleto.")
        W(linhas, "  Corrija: UPDATE notas_fiscais SET parcelas = 1 WHERE parcelas IS NULL;")
        W(linhas, "")
        for n in parcelas_null:
            W(linhas, f"  #{n['id']:5d}  {str(n['numero_nota']):<22}  {fmt_brl(n['valor'])}  {n.get('cond_nome') or '—'}")

    # ── Canceladas ────────────────────────────────────────────────────────
    if canceladas:
        W(linhas, sub(f"ℹ  {len(canceladas)} notas CANCELADAS"))
        W(linhas, f"  {'ID':>6}  {'Número':<22}  {'Valor':>14}  Condomínio")
        W(linhas, "  " + "-"*80)
        for n in canceladas:
            W(linhas, f"  #{n['id']:5d}  {str(n['numero_nota']):<22}  {fmt_brl(n['valor'])}  {n.get('cond_nome') or '—'}")

    return notas, vencidas, parceladas

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 3 — SERVIÇOS
# ─────────────────────────────────────────────────────────────────────────────
def sec_servicos(conn, notas, linhas):
    W = w_append
    servicos = ler(conn,
        "SELECT s.*, c.nome AS cond_nome FROM manutencoes_assistencias s "
        "LEFT JOIN condominios c ON c.id = s.condominio_id ORDER BY s.id")

    nota_ids_com_servico = {s["nota_fiscal_id"] for s in servicos if s.get("nota_fiscal_id")}
    notas_ativas = [n for n in notas if str(n.get("status","")) != "CANCELADA"]
    notas_sem_servico = [n for n in notas_ativas
                         if n["id"] not in nota_ids_com_servico
                         and str(n.get("tipo","")) in ("ASSISTENCIA", "MANUTENCAO")]

    dup_nota = defaultdict(list)
    for s in servicos:
        if s.get("nota_fiscal_id"):
            dup_nota[s["nota_fiscal_id"]].append(s)
    duplicados = {k: v for k, v in dup_nota.items() if len(v) > 1}

    por_tipo = defaultdict(int)
    for s in servicos: por_tipo[str(s["tipo"])] += 1

    W(linhas, secao("3. SERVIÇOS (Manutenções / Assistências)"))
    W(linhas, col("Total", len(servicos)))
    for k, v in sorted(por_tipo.items()):
        W(linhas, col(f"  {k}", v))
    W(linhas, col("Sem nota fiscal vinculada",         sum(1 for s in servicos if not s.get("nota_fiscal_id"))))
    W(linhas, col("Notas MANUT/ASSIST sem serviço ⚠",  len(notas_sem_servico)))
    W(linhas, col("Notas com >1 serviço ⚠",            len(duplicados)))

    if notas_sem_servico:
        W(linhas, sub(f"⚠  {len(notas_sem_servico)} notas MANUT/ASSIST sem serviço gerado"))
        for n in notas_sem_servico:
            W(linhas, f"  #{n['id']:5d}  {str(n['numero_nota']):<22}  {str(n['tipo']):<12}  {n.get('cond_nome') or '—'}")

    if duplicados:
        W(linhas, sub("⚠  Notas com múltiplos serviços"))
        for nota_id, svcs in duplicados.items():
            W(linhas, f"  Nota #{nota_id}: {len(svcs)} serviços → IDs {[s['id'] for s in svcs]}")

    return servicos

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 4 — BOLETOS (completo)
# ─────────────────────────────────────────────────────────────────────────────
def sec_boletos(conn, notas, linhas):
    W = w_append
    boletos = ler(conn,
        "SELECT b.*, n.numero_nota, n.valor AS valor_nota, "
        "n.parcelas AS parcelas_nota, n.status AS status_nota, "
        "c.nome AS cond_nome "
        "FROM boletos b "
        "LEFT JOIN notas_fiscais n ON n.id = b.nota_fiscal_id "
        "LEFT JOIN condominios c ON c.id = n.condominio_id "
        "ORDER BY b.nota_fiscal_id, b.numero_parcela, b.id")

    hoje = date.today()
    por_sit = defaultdict(list)
    for b in boletos: por_sit[str(b["situacao"])].append(b)

    notas_com_boleto = defaultdict(list)
    for b in boletos:
        if b.get("nota_fiscal_id"):
            notas_com_boleto[b["nota_fiscal_id"]].append(b)

    # inconsistência parcelas
    incons_parcelas = []
    for nota_id, bols in notas_com_boleto.items():
        esperadas = int(bols[0].get("parcelas_nota") or 1)
        geradas   = len(bols)
        nums      = sorted(b["numero_parcela"] for b in bols)
        if geradas != esperadas or nums != list(range(1, esperadas + 1)):
            incons_parcelas.append({
                "nota_id": nota_id, "numero_nota": bols[0].get("numero_nota"),
                "esperadas": esperadas, "geradas": geradas, "nums": nums,
                "boletos": bols,
            })

    # boletos PAGO vs nota sem data_pagamento
    notas_pago_sem_dt = []
    nota_map = {n["id"]: n for n in notas}
    for nota_id, bols in notas_com_boleto.items():
        todos_pagos = all(b["situacao"] in ("PAGO","BAIXADO") for b in bols)
        nota = nota_map.get(nota_id)
        if todos_pagos and nota and not nota.get("data_pagamento"):
            notas_pago_sem_dt.append({"nota": nota, "boletos": bols})

    sem_codigo = [b for b in boletos if not b.get("codigo_solicitacao")]
    sem_nota   = [b for b in boletos if not b.get("nota_fiscal_id")]
    vencidos   = [b for b in boletos if b["situacao"] in ("EMABERTO","VENCIDO")
                  and b.get("data_vencimento") and b["data_vencimento"] < hoje]

    # ── Divergência nota.valor vs soma dos boletos ────────────────────────
    diverg_valor = []
    for nota_id, bols in notas_com_boleto.items():
        nota = nota_map.get(nota_id)
        if not nota:
            continue
        soma_bols = sum(float(b["valor_nominal"]) for b in bols)
        nota_val  = float(nota.get("valor") or 0)
        diff      = abs(soma_bols - nota_val)
        if diff > 0.05:  # tolerância de 5 centavos
            pct = (soma_bols / nota_val * 100) if nota_val > 0 else 0
            diverg_valor.append({
                "nota_id": nota_id, "numero_nota": nota.get("numero_nota"),
                "cond_nome": nota.get("cond_nome"), "valor_nota": nota_val,
                "soma_bols": soma_bols, "diff": soma_bols - nota_val, "pct": pct,
                "boletos": bols,
            })

    # ── Boletos PAGO de notas sem condomínio (dinheiro não atribuído) ─────
    pago_sem_cond = []
    for b in por_sit.get("PAGO", []) + por_sit.get("BAIXADO", []):
        if not b.get("cond_nome"):
            pago_sem_cond.append(b)

    total_rec  = sum(float(b.get("valor_total_recebido") or b["valor_nominal"]) for b in por_sit.get("PAGO",[]))
    total_ab   = sum(float(b["valor_nominal"]) for b in por_sit.get("EMABERTO",[]) + por_sit.get("VENCIDO",[]))

    W(linhas, secao("4. BOLETOS — Visão Geral"))
    W(linhas, col("Total boletos no banco", len(boletos)))
    W(linhas, "")
    for sit in ["PAGO","EMABERTO","VENCIDO","CANCELADO","EXPIRADO","BAIXADO"]:
        lst = por_sit.get(sit, [])
        if lst:
            val = sum(float(b["valor_nominal"]) for b in lst)
            W(linhas, col(f"  {sit}", f"{len(lst):4d}  |  {fmt_brl(val)}"))
    W(linhas, "")
    W(linhas, col("Valor total recebido (PAGO)",       fmt_brl(total_rec)))
    W(linhas, col("Valor pendente (EMABERTO+VENCIDO)", fmt_brl(total_ab)))
    W(linhas, "")
    W(linhas, col("Sem código Inter (não emitido) ⚠",  len(sem_codigo)))
    W(linhas, col("Sem nota vinculada ⚠",               len(sem_nota)))
    W(linhas, col("Vencidos em aberto ⚠",               len(vencidos)))
    W(linhas, col("Inconsistências de parcelas ⚠",      len(incons_parcelas)))
    W(linhas, col("Boletos PAGO mas nota sem dt_pag ⚠", len(notas_pago_sem_dt)))
    W(linhas, col("Divergência nota.valor vs boletos ⚠",len(diverg_valor)))
    W(linhas, col("PAGO sem condomínio ($ não atrib.) ⚠",len(pago_sem_cond)))

    # ── TODOS os boletos — tabela completa ───────────────────────────────
    W(linhas, sub(f"LISTAGEM COMPLETA DOS {len(boletos)} BOLETOS"))
    W(linhas, f"  {'ID':>5}  {'Nota':>5}  {'Nº Nota':<22}  {'Parc':>6}  {'Valor':>14}  "
              f"{'Emissão':>10}  {'Vencimento':>10}  {'Pagamento':>10}  {'Situação':<12}  "
              f"{'NossoNum':<14}  Condomínio")
    W(linhas, "  " + "-"*160)
    for b in boletos:
        parc_str  = f"{b.get('numero_parcela',1)}/{b.get('total_parcelas',1)}"
        vr        = b.get("valor_total_recebido")
        val_str   = fmt_brl(b["valor_nominal"])
        if vr and abs(float(vr) - float(b["valor_nominal"])) > 0.01:
            val_str += f" (rec:{fmt_brl(vr)})"
        jm = float(b.get("valor_juros") or 0) + float(b.get("valor_multa") or 0)
        jm_str = f" +{fmt_brl(jm)} j/m" if jm > 0 else ""
        W(linhas, f"  #{b['id']:4d}  #{b.get('nota_fiscal_id') or '—':>4}  "
                  f"{str(b.get('numero_nota') or '—'):<22}  "
                  f"{parc_str:>6}  {val_str}{jm_str:>18}  "
                  f"{fmt_d(b.get('data_emissao')):>10}  "
                  f"{fmt_d(b.get('data_vencimento')):>10}  "
                  f"{fmt_d(b.get('data_pagamento')):>10}  "
                  f"{str(b['situacao']):<12}  "
                  f"{str(b.get('nosso_numero') or '—'):<14}  "
                  f"{b.get('cond_nome') or '—'}")

    # ── Parcelas inconsistentes ───────────────────────────────────────────
    if incons_parcelas:
        W(linhas, sub(f"⚠  {len(incons_parcelas)} INCONSISTÊNCIAS DE PARCELAS"))
        W(linhas, "  Notas onde a quantidade de boletos gerados ≠ parcelas esperadas na nota.\n"
                  "  Precisa gerar os boletos das parcelas faltantes.")
        W(linhas, "")
        for inc in incons_parcelas:
            W(linhas, f"  Nota #{inc['nota_id']} ({inc['numero_nota']})  "
                      f"esperadas:{inc['esperadas']}  geradas:{inc['geradas']}  "
                      f"números gerados:{inc['nums']}")
            faltam = [p for p in range(1, inc["esperadas"]+1) if p not in inc["nums"]]
            W(linhas, f"    → FALTAM as parcelas: {faltam}")
            for b in inc["boletos"]:
                W(linhas, f"    Boleto #{b['id']} parcela {b['numero_parcela']}  "
                          f"{fmt_brl(b['valor_nominal'])}  "
                          f"venc:{fmt_d(b.get('data_vencimento'))}  {b['situacao']}")

    # ── PAGO mas nota sem data_pagamento ──────────────────────────────────
    if notas_pago_sem_dt:
        W(linhas, sub(f"⚠  {len(notas_pago_sem_dt)} NOTAS com todos boletos PAGO mas sem data_pagamento"))
        W(linhas, "  Esses boletos foram baixados no Inter mas a nota não foi atualizada.")
        W(linhas, "  Execute uma sincronização ou atualize manualmente a data_pagamento.")
        W(linhas, "")
        for item in notas_pago_sem_dt:
            n = item["nota"]
            W(linhas, f"  Nota #{n['id']} ({n['numero_nota']})  {fmt_brl(n['valor'])}  "
                      f"cond:{n.get('cond_nome','—')}")
            for b in item["boletos"]:
                W(linhas, f"    Boleto #{b['id']} parc:{b.get('numero_parcela',1)}/{b.get('total_parcelas',1)}  "
                          f"{fmt_brl(b['valor_nominal'])}  "
                          f"pago:{fmt_d(b.get('data_pagamento'))}  "
                          f"recebido:{fmt_brl(b.get('valor_total_recebido') or b['valor_nominal'])}")

    # ── Vencidos em aberto ────────────────────────────────────────────────
    if vencidos:
        W(linhas, sub(f"⚠  {len(vencidos)} boletos VENCIDOS em aberto"))
        for b in sorted(vencidos, key=lambda x: x["data_vencimento"]):
            dias = (hoje - b["data_vencimento"]).days
            W(linhas, f"  #{b['id']:4d}  Nota:{str(b.get('numero_nota') or '?'):<22}  "
                      f"{fmt_brl(b['valor_nominal'])}  venc:{fmt_d(b.get('data_vencimento'))}  "
                      f"({dias}d)  {b.get('cond_nome') or '—'}")

    # ── Divergência nota.valor vs soma boletos ────────────────────────────
    if diverg_valor:
        W(linhas, sub(f"⚠  {len(diverg_valor)} notas com DIVERGÊNCIA de valor (nota ≠ soma boletos)"))
        W(linhas, "  Causas comuns: ISS descontado no boleto, boleto importado do Inter com valor diferente,")
        W(linhas, "  ou erro no cálculo de parcelas.")
        W(linhas, "")
        W(linhas, f"  {'ID':>6}  {'Número':<22}  {'Valor Nota':>14}  {'Soma Boletos':>14}  {'Diferença':>12}  {'%':>6}  Condomínio")
        W(linhas, "  " + "-"*110)
        for d in sorted(diverg_valor, key=lambda x: abs(x["diff"]), reverse=True):
            sinal = "+" if d["diff"] > 0 else ""
            W(linhas, f"  #{d['nota_id']:5d}  {str(d['numero_nota']):<22}  "
                      f"{fmt_brl(d['valor_nota']):>14}  {fmt_brl(d['soma_bols']):>14}  "
                      f"{sinal}{fmt_brl(d['diff']):>12}  {d['pct']:>5.1f}%  {d['cond_nome'] or '—'}")
            for b in d["boletos"]:
                W(linhas, f"         Boleto #{b['id']} parc:{b.get('numero_parcela',1)}/{b.get('total_parcelas',1)}  "
                          f"{fmt_brl(b['valor_nominal'])}  {b['situacao']}")

    # ── PAGO sem condomínio (dinheiro não atribuído) ───────────────────────
    if pago_sem_cond:
        total_nao_atrib = sum(float(b.get("valor_total_recebido") or b["valor_nominal"]) for b in pago_sem_cond)
        W(linhas, sub(f"🔴  {len(pago_sem_cond)} boletos PAGO sem condomínio — {fmt_brl(total_nao_atrib)} NÃO ATRIBUÍDOS"))
        W(linhas, "  Dinheiro recebido mas a nota não está vinculada a nenhum condomínio.")
        W(linhas, "  Ação necessária: identificar o pagador e vincular a nota ao condomínio correto.")
        W(linhas, "")
        for b in pago_sem_cond:
            vr = b.get("valor_total_recebido")
            rec_str = f"  recebido:{fmt_brl(vr)}" if vr and abs(float(vr)-float(b["valor_nominal"])) > 0.01 else ""
            W(linhas, f"  Boleto #{b['id']}  Nota #{b.get('nota_fiscal_id')} ({b.get('numero_nota')})  "
                      f"{fmt_brl(b['valor_nominal'])}{rec_str}  "
                      f"pago:{fmt_d(b.get('data_pagamento'))}  nosso:{b.get('nosso_numero') or '—'}")

    return boletos, notas_com_boleto

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 5 — CRUZAMENTOS
# ─────────────────────────────────────────────────────────────────────────────
def sec_cruzamentos(conn, notas, boletos, notas_com_boleto, condominios, linhas):
    W = w_append
    cnpj_por_cond = {c["id"]: c.get("cnpj") for c in condominios}
    ativas = [n for n in notas if str(n.get("status","")) != "CANCELADA"]

    nota_ids_com_boleto = set(notas_com_boleto.keys())
    sem_boleto = [n for n in ativas if n["id"] not in nota_ids_com_boleto]

    sem_cond_bl  = [n for n in sem_boleto if not n.get("condominio_id")]
    sem_cnpj_bl  = [n for n in sem_boleto if n.get("condominio_id") and not cnpj_por_cond.get(n["condominio_id"])]
    prontas      = [n for n in sem_boleto if n.get("condominio_id") and cnpj_por_cond.get(n["condominio_id"])]

    W(linhas, secao("5. CRUZAMENTOS E PENDÊNCIAS"))
    W(linhas, col("Notas ativas sem nenhum boleto",         len(sem_boleto)))
    W(linhas, col("  → sem condomínio (impossível)",        len(sem_cond_bl)))
    W(linhas, col("  → cond. sem CNPJ (bloqueado)",         len(sem_cnpj_bl)))
    W(linhas, col("  → PRONTAS para gerar boleto ✔",        len(prontas)))
    W(linhas, "")

    # valor total pendente
    val_prontas = sum(float(n.get("valor") or 0) for n in prontas)
    W(linhas, col("  Valor pendente (prontas sem boleto)", fmt_brl(val_prontas)))

    if prontas:
        W(linhas, sub(f"✔  {len(prontas)} notas PRONTAS para gerar boleto  ({fmt_brl(val_prontas)})"))
        W(linhas, f"  {'ID':>6}  {'Número':<22}  {'Valor':>14}  {'Venc':>10}  {'Tipo':<12}  Condomínio")
        W(linhas, "  " + "-"*96)
        hoje = date.today()
        for n in sorted(prontas, key=lambda x: x.get("data_vencimento") or date.min):
            atrasado = ""
            if n.get("data_vencimento") and n["data_vencimento"] < hoje:
                dias = (hoje - n["data_vencimento"]).days
                atrasado = f"  ← {dias}d ATRASADA"
            parc = int(n.get("parcelas") or 1)
            parc_str = f"  {parc}x" if parc > 1 else ""
            W(linhas, f"  #{n['id']:5d}  {str(n['numero_nota']):<22}  {fmt_brl(n['valor']):>14}  "
                      f"{fmt_d(n.get('data_vencimento'))}  {str(n.get('tipo','?')):<12}  "
                      f"{n.get('cond_nome') or '—'}{parc_str}{atrasado}")

    if sem_cnpj_bl:
        W(linhas, sub(f"⚠  {len(sem_cnpj_bl)} notas bloqueadas — condomínio sem CNPJ"))
        for n in sem_cnpj_bl:
            W(linhas, f"  #{n['id']:5d}  {str(n['numero_nota']):<22}  {fmt_brl(n['valor'])}  "
                      f"cond:#{n['condominio_id']} {n.get('cond_nome')}")

    # ── Ranking de inadimplência por condomínio ───────────────────────────
    hoje = date.today()
    vencidas_sem_pag = [n for n in ativas
                        if n.get("data_vencimento") and n["data_vencimento"] < hoje
                        and not n.get("data_pagamento")]
    inad_por_cond = defaultdict(lambda: {"total": 0.0, "qtd": 0, "nome": ""})
    for n in vencidas_sem_pag:
        cid = n.get("condominio_id") or 0
        inad_por_cond[cid]["total"] += float(n.get("valor") or 0)
        inad_por_cond[cid]["qtd"]   += 1
        inad_por_cond[cid]["nome"]   = n.get("cond_nome") or f"(sem cond, id={cid})"

    ranking = sorted(inad_por_cond.items(), key=lambda x: x[1]["total"], reverse=True)

    if ranking:
        W(linhas, sub(f"📊  RANKING INADIMPLÊNCIA — top {min(30,len(ranking))} condomínios com mais valor em atraso"))
        W(linhas, f"  {'#':>3}  {'Condomínio':<50}  {'Qtd Notas':>10}  {'Total Devido':>14}")
        W(linhas, "  " + "-"*85)
        for pos, (cid, info) in enumerate(ranking[:30], 1):
            W(linhas, f"  {pos:>3}  {info['nome']:<50}  {info['qtd']:>10}  {fmt_brl(info['total']):>14}")

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 6 — RESUMO FINANCEIRO
# ─────────────────────────────────────────────────────────────────────────────
def sec_financeiro(notas, boletos, notas_com_boleto, linhas):
    W = w_append
    ativas     = [n for n in notas if str(n.get("status","")) != "CANCELADA"]
    canceladas = [n for n in notas if str(n.get("status","")) == "CANCELADA"]

    por_sit = defaultdict(list)
    for b in boletos: por_sit[str(b["situacao"])].append(b)

    val_total    = sum(float(n.get("valor") or 0) for n in ativas)
    val_canc     = sum(float(n.get("valor") or 0) for n in canceladas)
    val_pago_bol = sum(float(b.get("valor_total_recebido") or b["valor_nominal"]) for b in por_sit.get("PAGO",[]))
    val_aberto   = sum(float(b["valor_nominal"]) for b in por_sit.get("EMABERTO",[]) + por_sit.get("VENCIDO",[]))
    val_sem_bol  = sum(float(n.get("valor") or 0) for n in ativas if n["id"] not in notas_com_boleto)
    val_exp_canc = sum(float(b["valor_nominal"]) for b in por_sit.get("EXPIRADO",[]) + por_sit.get("CANCELADO",[]))

    W(linhas, secao("6. RESUMO FINANCEIRO"))
    W(linhas, col("Valor total notas ativas",             fmt_brl(val_total)))
    W(linhas, col("Valor notas canceladas",               fmt_brl(val_canc)))
    W(linhas, "")
    W(linhas, col("Recebido via boletos (PAGO)",          fmt_brl(val_pago_bol)))
    W(linhas, col("Em aberto / vencido (boletos ativos)", fmt_brl(val_aberto)))
    W(linhas, col("Expirado / cancelado (boletos)",       fmt_brl(val_exp_canc)))
    W(linhas, col("Sem boleto emitido (a cobrança)",      fmt_brl(val_sem_bol)))
    W(linhas, "")
    cobertura = (val_pago_bol / val_total * 100) if val_total > 0 else 0
    W(linhas, col("  Taxa de recebimento",                f"{cobertura:.1f}%"))

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 7 — ANÁLISE DE XMLs / ZIPs
# ─────────────────────────────────────────────────────────────────────────────
def detectar_tipo_xml(xml_str):
    if "procEventoNFe" in xml_str:     return "EventoCancelamento"
    if "<RazaoSocialPrestador>" in xml_str and "<ValorServicos>" in xml_str: return "NFSe"
    if "<infNFe" in xml_str and "portalfiscal.inf.br/nfe" in xml_str:       return "NFe"
    return "Desconhecido"

def find_text(root, tag, ns=None):
    xpath = tag if (tag.startswith(".") or tag.startswith("/")) else f".//{tag}"
    el = root.find(xpath, ns) if ns else root.find(xpath)
    return el.text.strip() if el is not None and el.text else None

def parse_xml(xml_str, nome):
    r = dict(arquivo=nome, tipo_xml="?", numero_nota=None, tipo_nota=None,
             status=None, cnpj_dest=None, razao_dest=None, cnpj_emit=None,
             razao_emit=None, valor=None, data_emissao=None, data_vencimento=None,
             parcelas=1, descricao=None, alertas=[], erro=None, raw_passos=[])
    passos = []

    try:
        tipo = detectar_tipo_xml(xml_str)
        r["tipo_xml"] = tipo
        passos.append(f"Tipo detectado: {tipo}")

        if tipo == "EventoCancelamento":
            root = ET.fromstring(xml_str)
            ch = find_text(root,"chNFe") or find_text(root,"{http://www.portalfiscal.inf.br/nfe}chNFe")
            if ch:
                num = ch[25:34].lstrip("0")
                ser = ch[22:25].lstrip("0")
                r["numero_nota"] = f"{num}-{ser}" if ser else num
            r["status"] = "CANCELAMENTO"
            r["raw_passos"] = passos
            return r

        root = ET.fromstring(xml_str)

        if tipo == "NFSe":
            g = lambda t: find_text(root, t)
            r["numero_nota"] = g("NumeroNFe")
            r["cnpj_emit"]   = g("CPFCNPJPrestador/CNPJ")
            r["razao_emit"]  = g("RazaoSocialPrestador")
            r["cnpj_dest"]   = g("CPFCNPJTomador/CNPJ")
            r["razao_dest"]  = g("RazaoSocialTomador")
            r["valor"]       = float(g("ValorServicos") or 0)
            r["data_emissao"]= (g("DataEmissaoNFe") or "")[:10]
            disc             = g("Discriminacao") or ""
            r["descricao"]   = disc[:200]
            status_xml       = g("StatusNFe")
            r["status"]      = "CANCELADA" if status_xml=="C" else "AUTORIZADA" if status_xml=="N" else "DESCONHECIDO"

            passos.append(f"Número: {r['numero_nota']}")
            passos.append(f"CNPJ emitente: {r['cnpj_emit']}")
            passos.append(f"CNPJ destinatário: {r['cnpj_dest']} | Razão: {r['razao_dest']}")
            passos.append(f"Valor: {r['valor']} | Status XML: {status_xml} → {r['status']}")

            m = re.search(r"parcela[s]?:\s*(\d+)", disc.lower())
            r["parcelas"] = int(m.group(1)) if m else 1
            passos.append(f"Parcelas detectadas: {r['parcelas']}" + (" (extraído da discriminação)" if m else " (padrão 1)"))

            m2 = re.search(r"[Vv]encimento[:\s\.]+(\d{2})\.(\d{2})\.(\d{4})", disc)
            if m2:
                r["data_vencimento"] = f"{m2.group(3)}-{m2.group(2)}-{m2.group(1)}"
                passos.append(f"Vencimento extraído da discriminação: {r['data_vencimento']}")
            else:
                r["data_vencimento"] = r["data_emissao"]
                passos.append(f"Vencimento NÃO encontrado na discriminação → usa data emissão: {r['data_emissao']}")

            du = disc.upper().strip()
            if du.startswith("MANUTENCAO"):
                r["tipo_nota"] = "MANUTENCAO"
            elif du.startswith("SERVICOS PRESTADOS"):
                r["tipo_nota"] = "ASSISTENCIA"
            else:
                r["tipo_nota"] = "OUTROS"
            passos.append(f"Tipo detectado: {r['tipo_nota']} (prefixo discriminação: '{du[:30]}')")

        elif tipo == "NFe":
            ns = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
            g  = lambda x: find_text(root, x, ns)
            numero = g(".//nfe:ide/nfe:nNF")
            serie  = g(".//nfe:ide/nfe:serie")
            r["numero_nota"]  = f"{numero}-{serie}" if serie and numero else numero
            r["cnpj_emit"]    = g(".//nfe:emit/nfe:CNPJ")
            r["razao_emit"]   = g(".//nfe:emit/nfe:xNome")
            r["cnpj_dest"]    = g(".//nfe:dest/nfe:CNPJ")
            r["razao_dest"]   = g(".//nfe:dest/nfe:xNome")
            r["valor"]        = float(g(".//nfe:total/nfe:ICMSTot/nfe:vNF") or 0)
            r["data_emissao"] = (g(".//nfe:ide/nfe:dhEmi") or "")[:10]
            inf               = g(".//nfe:infAdic/nfe:infCpl") or ""
            r["descricao"]    = inf[:200]
            c_stat            = g(".//nfe:protNFe/nfe:infProt/nfe:cStat")
            r["status"]       = "CANCELADA" if c_stat=="101" else "AUTORIZADA" if c_stat=="100" else "DESCONHECIDO"

            passos.append(f"Número: {r['numero_nota']}  (nNF={numero} série={serie})")
            passos.append(f"CNPJ emitente: {r['cnpj_emit']}")
            passos.append(f"CNPJ destinatário: {r['cnpj_dest']} | Razão: {r['razao_dest']}")
            passos.append(f"Valor: {r['valor']} | cStat: {c_stat} → {r['status']}")

            m = re.search(r"parcela[s]?:\s*(\d+)", inf.lower())
            r["parcelas"] = int(m.group(1)) if m else 1
            passos.append(f"Parcelas: {r['parcelas']}")

            m2 = re.search(r"[Vv]encimento[:\s\.]+(\d{2})\.(\d{2})\.(\d{4})", inf)
            if m2:
                r["data_vencimento"] = f"{m2.group(3)}-{m2.group(2)}-{m2.group(1)}"
                passos.append(f"Vencimento extraído: {r['data_vencimento']}")
            else:
                r["data_vencimento"] = r["data_emissao"]
                passos.append(f"Vencimento NÃO encontrado → usa emissão: {r['data_emissao']}")

            du = inf.upper().strip()
            if du.startswith("MANUTENCAO"):
                r["tipo_nota"] = "MANUTENCAO"
            elif du.startswith("SERVICOS PRESTADOS"):
                r["tipo_nota"] = "ASSISTENCIA"
            else:
                r["tipo_nota"] = "OUTROS"
            passos.append(f"Tipo: {r['tipo_nota']}")

        else:
            r["erro"] = "Tipo XML não reconhecido (não é NFSe, NFe nem cancelamento)"
            r["raw_passos"] = passos
            return r

    except ET.ParseError as e:
        r["erro"] = f"XML inválido/corrompido: {e}"
        passos.append(f"ERRO PARSE: {e}")
    except Exception as e:
        r["erro"] = f"Erro inesperado: {e}"
        passos.append(f"ERRO: {e}")

    # alertas
    alertas = []
    if not r.get("cnpj_dest"):               alertas.append("Sem CNPJ do destinatário")
    if not r.get("numero_nota"):             alertas.append("Sem número de nota")
    if (r.get("valor") or 0) == 0:           alertas.append("Valor zerado")
    if r.get("status") == "DESCONHECIDO":    alertas.append("Status desconhecido no XML")
    if r.get("tipo_nota") == "OUTROS":       alertas.append("Tipo OUTROS (não cria serviço)")
    r["alertas"] = alertas
    r["raw_passos"] = passos
    return r

def coletar_xmls(caminho):
    xmls = []
    p = Path(caminho)
    arquivos = [p] if p.is_file() else (list(p.rglob("*.xml")) + list(p.rglob("*.XML")) +
                                         list(p.rglob("*.zip")) + list(p.rglob("*.ZIP"))) if p.is_dir() else []
    for arq in arquivos:
        ext = arq.suffix.lower()
        try:
            if ext == ".xml":
                raw = arq.read_bytes()
                xmls.append((arq.name, raw.decode("utf-8") if raw[:3] != b'\xef\xbb\xbf' else raw.decode("utf-8-sig")))
            elif ext == ".zip":
                with zipfile.ZipFile(arq) as zf:
                    for info in zf.filelist:
                        if not info.is_dir() and info.filename.lower().endswith(".xml"):
                            raw = zf.read(info.filename)
                            try: txt = raw.decode("utf-8")
                            except: txt = raw.decode("latin-1")
                            xmls.append((f"{arq.name}/{info.filename}", txt))
        except Exception as e:
            print(f"[ERRO lendo {arq}]: {e}")
    return xmls

def sec_xmls(caminho, engine, linhas):
    W = w_append
    xmls = coletar_xmls(caminho)

    if not xmls:
        W(linhas, secao(f"7. XMLs / ZIPs  ({caminho})"))
        W(linhas, "  Nenhum arquivo XML encontrado no caminho informado.")
        return

    with engine.connect() as conn:
        condominios_db = ler(conn, "SELECT id, nome, cnpj FROM condominios")
        notas_db       = ler(conn, "SELECT id, numero_nota FROM notas_fiscais")

    cnpj_map    = {limpar_cnpj(c["cnpj"]): c for c in condominios_db if c.get("cnpj")}
    notas_exist = {n["numero_nota"]: n["id"] for n in notas_db}

    resultados = [parse_xml(xml_str, nome) for nome, xml_str in xmls]

    # Classifica cada XML
    for r in resultados:
        num = r.get("numero_nota")
        cnpj = limpar_cnpj(r.get("cnpj_dest") or "")

        if r["erro"]:
            r["_destino"] = "ERRO_PARSE"
        elif r["tipo_xml"] == "EventoCancelamento":
            r["_destino"] = "CANCELAMENTO"
        elif r.get("status") == "CANCELADA":
            r["_destino"] = "NOTA_CANCELADA"
        elif num and num in notas_exist:
            r["_destino"] = "JA_IMPORTADA"
        elif not cnpj:
            r["_destino"] = "SEM_CNPJ"
        elif cnpj not in cnpj_map:
            r["_destino"] = "CNPJ_NAO_ENCONTRADO"
        else:
            r["_destino"] = "PRONTA"
            r["_cond"] = cnpj_map[cnpj]

    grupos = defaultdict(list)
    for r in resultados: grupos[r["_destino"]].append(r)

    W(linhas, secao(f"7. XMLs / ZIPs  ({caminho})  —  {len(resultados)} arquivo(s)"))
    W(linhas, col("Total arquivos XML",                           len(resultados)))
    W(linhas, col("  NFSe",                                       sum(1 for r in resultados if r["tipo_xml"]=="NFSe")))
    W(linhas, col("  NFe",                                        sum(1 for r in resultados if r["tipo_xml"]=="NFe")))
    W(linhas, col("  Eventos de cancelamento",                    len(grupos["CANCELAMENTO"])))
    W(linhas, col("  Tipo não reconhecido / erro parse",          len(grupos["ERRO_PARSE"])))
    W(linhas, "")
    W(linhas, col("✔  Prontas para importar",                     len(grupos["PRONTA"])))
    W(linhas, col("ℹ  Já importadas (serão ignoradas)",           len(grupos["JA_IMPORTADA"])))
    W(linhas, col("🚫 Notas canceladas no XML",                   len(grupos["NOTA_CANCELADA"])))
    W(linhas, col("⚠  Sem CNPJ no XML",                          len(grupos["SEM_CNPJ"])))
    W(linhas, col("⚠  CNPJ NÃO encontrado no banco",             len(grupos["CNPJ_NAO_ENCONTRADO"])))

    # ── Erros de parse ────────────────────────────────────────────────────
    if grupos["ERRO_PARSE"]:
        W(linhas, sub(f"✖  {len(grupos['ERRO_PARSE'])} ERROS DE PARSE"))
        for r in grupos["ERRO_PARSE"]:
            W(linhas, f"  {r['arquivo']}")
            W(linhas, f"    Erro: {r['erro']}")
            for p in r["raw_passos"]:
                W(linhas, f"    → {p}")

    # ── CNPJ não encontrado ───────────────────────────────────────────────
    if grupos["CNPJ_NAO_ENCONTRADO"]:
        W(linhas, sub(f"⚠  {len(grupos['CNPJ_NAO_ENCONTRADO'])} XMLs com CNPJ NÃO ENCONTRADO no banco"))
        W(linhas, "  Esses condomínios existem no XML mas não estão cadastrados.")
        W(linhas, "")
        for r in grupos["CNPJ_NAO_ENCONTRADO"]:
            W(linhas, f"  {r['arquivo']}")
            W(linhas, f"    Nota:  {r.get('numero_nota') or '—'}  |  Valor: {fmt_brl(r.get('valor') or 0)}")
            W(linhas, f"    CNPJ dest: {r.get('cnpj_dest') or '—'}  |  Razão: {r.get('razao_dest') or '—'}")
            W(linhas, f"    CNPJ emit: {r.get('cnpj_emit') or '—'}  |  Razão emit: {r.get('razao_emit') or '—'}")
            W(linhas, f"    CNPJ limpo buscado: {limpar_cnpj(r.get('cnpj_dest') or '')}")
            W(linhas, "    Passos do parser:")
            for p in r["raw_passos"]:
                W(linhas, f"      → {p}")
            W(linhas, "")

    # ── Sem CNPJ no XML ───────────────────────────────────────────────────
    if grupos["SEM_CNPJ"]:
        W(linhas, sub(f"⚠  {len(grupos['SEM_CNPJ'])} XMLs SEM CNPJ do destinatário"))
        for r in grupos["SEM_CNPJ"]:
            W(linhas, f"  {r['arquivo']}")
            W(linhas, f"    Nota: {r.get('numero_nota') or '—'}  Valor: {fmt_brl(r.get('valor') or 0)}")
            for p in r["raw_passos"]:
                W(linhas, f"    → {p}")

    # ── Prontas ───────────────────────────────────────────────────────────
    if grupos["PRONTA"]:
        W(linhas, sub(f"✔  {len(grupos['PRONTA'])} XMLs PRONTOS para importar"))
        for r in grupos["PRONTA"]:
            c = r.get("_cond", {})
            als = f"  ⚠ {', '.join(r['alertas'])}" if r["alertas"] else ""
            W(linhas, f"  {r['arquivo']}")
            W(linhas, f"    Nota:   {r.get('numero_nota') or '—'}  |  Tipo: {r.get('tipo_nota')}  |  XML: {r['tipo_xml']}")
            W(linhas, f"    Valor:  {fmt_brl(r.get('valor') or 0)}  |  Parcelas: {r.get('parcelas',1)}")
            W(linhas, f"    Emiss:  {r.get('data_emissao') or '—'}  |  Venc: {r.get('data_vencimento') or '—'}")
            W(linhas, f"    Dest:   {r.get('razao_dest') or '—'}  CNPJ: {r.get('cnpj_dest') or '—'}")
            W(linhas, f"    Condo:  #{c.get('id','?')} {c.get('nome','?')}")
            if als: W(linhas, f"    {als}")
            W(linhas, "    Passos:")
            for p in r["raw_passos"]:
                W(linhas, f"      → {p}")
            W(linhas, "")

    # ── Já importadas ─────────────────────────────────────────────────────
    if grupos["JA_IMPORTADA"]:
        W(linhas, sub(f"ℹ  {len(grupos['JA_IMPORTADA'])} já importadas"))
        for r in grupos["JA_IMPORTADA"]:
            nota_id = notas_exist.get(r.get("numero_nota"))
            W(linhas, f"  {r['arquivo']}  →  Nota #{nota_id} ({r.get('numero_nota')})")

    # ── Canceladas no XML ─────────────────────────────────────────────────
    if grupos["NOTA_CANCELADA"]:
        W(linhas, sub(f"🚫  {len(grupos['NOTA_CANCELADA'])} notas CANCELADAS no XML"))
        for r in grupos["NOTA_CANCELADA"]:
            W(linhas, f"  {r['arquivo']}  →  Nota {r.get('numero_nota') or '—'}  {fmt_brl(r.get('valor') or 0)}")

    # ── Cancelamentos ─────────────────────────────────────────────────────
    if grupos["CANCELAMENTO"]:
        W(linhas, sub(f"ℹ  {len(grupos['CANCELAMENTO'])} Eventos de cancelamento"))
        for r in grupos["CANCELAMENTO"]:
            nota = r.get("numero_nota") or "?"
            status = "JÁ NO BANCO" if nota in notas_exist else "não cadastrada"
            W(linhas, f"  {r['arquivo']}  →  cancela Nota {nota}  ({status})")

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 8 — BOLETOS DO BANCO INTER (API direta)
# ─────────────────────────────────────────────────────────────────────────────
def _inter_token(env):
    import base64, requests as req
    base_urls = {
        "sandbox":    "https://cdpj-sandbox.partners.uatinter.co",
        "production": "https://cdpj.partners.bancointer.com.br",
    }
    inter_env  = env.get("INTER_ENV", "sandbox")
    base_url   = base_urls.get(inter_env, base_urls["sandbox"])
    client_id  = env.get("INTER_CLIENT_ID", "")
    client_sec = env.get("INTER_CLIENT_SECRET", "")
    cert_path  = env.get("INTER_CERT_PATH", "app/auth/")
    cert       = (cert_path + "certificado.crt", cert_path + "key.key")

    creds = base64.b64encode(f"{client_id}:{client_sec}".encode()).decode()
    r = req.post(
        f"{base_url}/oauth/v2/token",
        headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "client_credentials", "scope": "boleto-cobranca.read"},
        cert=cert,
        timeout=30,
    )
    if r.status_code != 200:
        raise Exception(f"Token Inter [{inter_env}]: {r.status_code} — {r.text[:300]}")
    return r.json()["access_token"], base_url, cert, env.get("INTER_CONTA_CORRENTE", "")


def _inter_listar(token, base_url, cert, conta_corrente, data_inicio, data_fim):
    import requests as req
    headers = {
        "Authorization": f"Bearer {token}",
        "x-conta-corrente": conta_corrente,
        "Content-Type": "application/json",
    }
    todos = []
    pagina = 1
    while True:
        params = {
            "dataInicial": data_inicio,
            "dataFinal":   data_fim,
            "filtrarDataPor": "VENCIMENTO",
            "situacao":    "TODAS",
            "pagina":      pagina,
            "tamanhoPagina": 100,
        }
        r = req.get(f"{base_url}/cobranca/v3/cobrancas", headers=headers,
                    params=params, cert=cert, timeout=60)
        if r.status_code != 200:
            raise Exception(f"Listar Inter: {r.status_code} — {r.text[:300]}")
        data  = r.json()
        itens = data.get("cobrancas", [])
        total = data.get("total", 0)
        # Inter API v3 retorna items como {"cobranca": {...}} — desembrulha
        itens = [
            item.get("cobranca", item) if isinstance(item, dict) and "cobranca" in item else item
            for item in itens
        ]
        todos.extend(itens)
        print(f"  [Inter] pag={pagina} itens={len(itens)} total_acum={len(todos)}/{total}")
        if len(todos) >= total or not itens:
            break
        pagina += 1
    return todos


def sec_inter(env, boletos_db, linhas, data_inicio, data_fim):
    W = w_append
    W(linhas, secao(f"8. BOLETOS BANCO INTER (API)  —  {data_inicio} a {data_fim}"))

    if not env.get("INTER_CLIENT_ID"):
        W(linhas, "  ⚠  INTER_CLIENT_ID não configurado no .env — seção ignorada.")
        return

    try:
        print("  Autenticando na API Inter...")
        token, base_url, cert, conta = _inter_token(env)
        print(f"  Token obtido. Listando de {data_inicio} a {data_fim}...")
        cobrancas = _inter_listar(token, base_url, cert, conta, data_inicio, data_fim)
    except Exception as e:
        W(linhas, f"  ✖  Erro ao consultar Inter: {e}")
        return

    if not cobrancas:
        W(linhas, "  Nenhuma cobrança retornada para o período.")
        return

    # índice dos boletos locais pelo código de solicitação
    codigos_db = {b.get("codigo_solicitacao"): b for b in boletos_db if b.get("codigo_solicitacao")}

    por_sit = defaultdict(list)
    for c in cobrancas:
        sit = str(c.get("situacao") or "?")
        por_sit[sit].append(c)

    val_total = sum(float(c.get("valorNominal", 0)) for c in cobrancas)

    W(linhas, col("Total cobranças no Inter", len(cobrancas)))
    W(linhas, col("Período",                  f"{data_inicio} → {data_fim}"))
    W(linhas, "")
    for sit in sorted(por_sit):
        lst = por_sit[sit]
        val = sum(float(c.get("valorNominal", 0)) for c in lst)
        W(linhas, col(f"  {sit}", f"{len(lst):4d}  |  {fmt_brl(val)}"))
    W(linhas, "")
    W(linhas, col("Valor total nominal", fmt_brl(val_total)))

    # Quais estão no Inter mas NÃO no nosso banco?
    so_inter = [c for c in cobrancas if c.get("codigoSolicitacao") not in codigos_db]
    so_db    = [b for b in boletos_db
                if b.get("codigo_solicitacao") and b["codigo_solicitacao"] not in
                {c.get("codigoSolicitacao") for c in cobrancas}]
    W(linhas, col("No Inter mas NÃO na nossa base ⚠", len(so_inter)))
    W(linhas, col("Na base mas NÃO no Inter ⚠",        len(so_db)))

    # ── TABELA COMPLETA ────────────────────────────────────────────────────
    W(linhas, sub(f"LISTAGEM COMPLETA — {len(cobrancas)} cobranças do Inter"))
    hdr = (f"  {'#':<4}  {'CodigoSolicitacao':<38}  {'SeuNumero':<16}  "
           f"{'NossoNumero':<14}  {'Valor':>14}  {'Emissão':>10}  "
           f"{'Vencimento':>10}  {'Pagamento':>10}  {'Situação':<14}  Pagador")
    W(linhas, hdr)
    W(linhas, "  " + "-" * 175)

    for i, c in enumerate(cobrancas, 1):
        pag    = c.get("pagador") or {}
        vr     = c.get("valorTotalRecebido")
        val_s  = fmt_brl(c.get("valorNominal", 0))
        if vr and abs(float(vr) - float(c.get("valorNominal", 0))) > 0.01:
            val_s += f" (rec:{fmt_brl(vr)})"
        no_db  = "✔DB" if c.get("codigoSolicitacao") in codigos_db else "⚠ FORA"
        W(linhas,
          f"  {i:<4}  {str(c.get('codigoSolicitacao') or '—'):<38}  "
          f"{str(c.get('seuNumero') or '—'):<16}  "
          f"{str(c.get('nossoNumero') or '—'):<14}  "
          f"{val_s:>14}  "
          f"{str((c.get('dataEmissao') or '—'))[:10]:>10}  "
          f"{str((c.get('dataVencimento') or '—'))[:10]:>10}  "
          f"{str((c.get('dataPagamento') or '—'))[:10]:>10}  "
          f"{str(c.get('situacao') or '—'):<14}  "
          f"{no_db}  {pag.get('nome') or '—'}")

    # ── RAW JSON completo de cada cobrança ────────────────────────────────
    W(linhas, sub(f"DADOS RAW (JSON) — todas as {len(cobrancas)} cobranças"))
    W(linhas, "  (campo a campo conforme retorno da API Inter)")
    W(linhas, "")
    campos_ordem = [
        "codigoSolicitacao", "seuNumero", "nossoNumero", "situacao",
        "valorNominal", "valorTotalRecebido", "valorAbatimento",
        "valorDesconto", "valorIof", "valorPago",
        "dataEmissao", "dataVencimento", "dataPagamento",
        "multa", "mora", "desconto",
        "mensagem",
    ]
    for i, c in enumerate(cobrancas, 1):
        pag   = c.get("pagador") or {}
        W(linhas, f"  [{i:03d}] ──────────────────────────────────────────────────────────────────")
        for campo in campos_ordem:
            v = c.get(campo)
            if v is not None and v != "" and v != {} and v != []:
                W(linhas, f"    {campo:<28} {v}")
        # pagador
        if pag:
            W(linhas, f"    {'pagador.cpfCnpj':<28} {pag.get('cpfCnpj') or '—'}")
            W(linhas, f"    {'pagador.nome':<28} {pag.get('nome') or '—'}")
            W(linhas, f"    {'pagador.email':<28} {pag.get('email') or '—'}")
            W(linhas, f"    {'pagador.cidade':<28} {pag.get('cidade') or '—'}")
        # campos extras que não estão na lista acima
        extras = {k: v for k, v in c.items()
                  if k not in campos_ordem and k != "pagador" and v not in (None, "", {}, [])}
        for k, v in extras.items():
            W(linhas, f"    {k:<28} {v}")
        W(linhas, "")

    # ── Só no Inter (ausentes na base local) ──────────────────────────────
    if so_inter:
        W(linhas, sub(f"⚠  {len(so_inter)} cobranças no Inter SEM registro local"))
        W(linhas, "  Esses boletos existem no banco Inter mas não estão na tabela 'boletos'.")
        W(linhas, "")
        for c in so_inter:
            pag = c.get("pagador") or {}
            W(linhas, f"  Código: {c.get('codigoSolicitacao')}  "
                      f"SeuNum: {c.get('seuNumero')}  "
                      f"Valor: {fmt_brl(c.get('valorNominal',0))}  "
                      f"Venc: {(c.get('dataVencimento') or '—')[:10]}  "
                      f"Sit: {c.get('situacao')}  "
                      f"Pagador: {pag.get('nome') or '—'}")

    # ── Só na base local (sem correspondente no Inter) ────────────────────
    if so_db:
        W(linhas, sub(f"⚠  {len(so_db)} boletos locais SEM correspondente no Inter"))
        W(linhas, "  Podem ter sido cancelados ou emitidos em outro período.")
        W(linhas, "")
        for b in so_db:
            W(linhas, f"  ID #{b.get('id')}  Código: {b.get('codigo_solicitacao')}  "
                      f"SeuNum: {b.get('seu_numero') or b.get('nosso_numero')}  "
                      f"Valor: {fmt_brl(b.get('valor_nominal',0))}  "
                      f"Sit: {b.get('situacao')}  "
                      f"Venc: {fmt_d(b.get('data_vencimento'))}")


# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 9 — ANÁLISE ZIP vs BD: por que o serviço não é gerado
# ─────────────────────────────────────────────────────────────────────────────
def _strip_accents_diag(s: str) -> str:
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def _buscar_cond_por_nome_diag(nome, condominios_db):
    """Replica exatamente a lógica do nota_fiscal_repository.get_condominio_by_nome."""
    if not nome:
        return None, "nome vazio"
    nome_upper = nome.strip().upper()
    _PREFIXOS = {"CONDOMINIO", "CONDOMÍNIO", "EDIFICIO", "EDIFÍCIO", "RESIDENCIAL", "COND"}

    def _chave(s):
        palavras = _strip_accents_diag(s.upper()).split()
        return " ".join([p for p in palavras if p not in _PREFIXOS])

    # 1) Exato (case insensitive)
    for c in condominios_db:
        if c.get("razao_social") and c["razao_social"].upper() == nome_upper:
            return c, "match exato razao_social"
        if c.get("nome") and c["nome"].upper() == nome_upper:
            return c, "match exato nome"

    # 2) Normaliza acentos
    nome_norm = _strip_accents_diag(nome_upper)
    for c in condominios_db:
        if c.get("razao_social") and _strip_accents_diag(c["razao_social"].upper()) == nome_norm:
            return c, "match sem acentos razao_social"
        if c.get("nome") and _strip_accents_diag(c["nome"].upper()) == nome_norm:
            return c, "match sem acentos nome"

    # 3) Remove prefixos
    chave_xml = _chave(nome)
    if chave_xml:
        for c in condominios_db:
            if c.get("razao_social") and _chave(c["razao_social"]) == chave_xml:
                return c, f"match por chave (sem prefixos) razao_social — chave='{chave_xml}'"
            if c.get("nome") and _chave(c["nome"]) == chave_xml:
                return c, f"match por chave (sem prefixos) nome — chave='{chave_xml}'"

    # 4) Containment
    for c in condominios_db:
        for campo in ["razao_social", "nome"]:
            v = c.get(campo)
            if not v:
                continue
            campo_norm = _strip_accents_diag(v.upper())
            if campo_norm in nome_norm or nome_norm in campo_norm:
                return c, f"match por conteúdo ({campo}): '{v}'"

    return None, "nenhum match"


def sec_vincular_servicos(caminho_zip, engine, linhas):
    """Analisa cada XML do ZIP contra o banco e mostra exatamente por que o serviço não é gerado."""
    W = w_append
    W(linhas, secao(f"9. ANÁLISE VÍNCULO ZIP → SERVIÇOS  ({caminho_zip})"))

    xmls = coletar_xmls(caminho_zip)
    if not xmls:
        W(linhas, "  Nenhum XML encontrado.")
        return

    with engine.connect() as conn:
        condominios_db = ler(conn, "SELECT id, nome, cnpj, razao_social FROM condominios")
        notas_db       = ler(conn, "SELECT id, numero_nota, condominio_id, tipo FROM notas_fiscais")
        servicos_db    = ler(conn, "SELECT id, nota_fiscal_id, condominio_id, tipo FROM manutencoes_assistencias")

    cnpj_map  = {limpar_cnpj(c["cnpj"]): c for c in condominios_db if c.get("cnpj")}
    nota_map  = {n["numero_nota"]: n for n in notas_db}
    serv_map  = {s["nota_fiscal_id"]: s for s in servicos_db if s.get("nota_fiscal_id")}

    W(linhas, col("Condominios no banco",          len(condominios_db)))
    W(linhas, col("  Com CNPJ",                    sum(1 for c in condominios_db if c.get("cnpj"))))
    W(linhas, col("  Sem CNPJ",                    sum(1 for c in condominios_db if not c.get("cnpj"))))
    W(linhas, col("XMLs encontrados",              len(xmls)))
    W(linhas, "")

    resumo = {"sem_cond": 0, "tipo_outros": 0, "servico_ok": 0, "ja_tem_servico": 0,
              "ja_importada_sem_servico": 0, "nova_com_cond": 0}

    for nome_arq, xml_str in xmls:
        r = parse_xml(xml_str, nome_arq)
        numero  = r.get("numero_nota") or "?"
        cnpj_d  = limpar_cnpj(r.get("cnpj_dest") or "")
        nome_d  = r.get("razao_dest") or ""
        tipo    = r.get("tipo_nota") or "?"
        valor   = r.get("valor") or 0
        status  = r.get("status") or "?"

        W(linhas, f"  ── {nome_arq}")
        W(linhas, f"     Nota: {numero}  |  Tipo: {tipo}  |  Status: {status}  |  Valor: {fmt_brl(valor)}")
        W(linhas, f"     Dest: {nome_d or '—'}  |  CNPJ dest: {r.get('cnpj_dest') or '—'}")

        if r.get("erro"):
            W(linhas, f"     ✖  ERRO DE PARSE: {r['erro']}")
            W(linhas, "")
            continue

        if status == "CANCELADA":
            W(linhas, "     ℹ  Nota cancelada — ignorada na importação")
            W(linhas, "")
            continue

        # ── Localizar condomínio ────────────────────────────────────────────
        cond = None
        if cnpj_d and cnpj_d in cnpj_map:
            cond = cnpj_map[cnpj_d]
            W(linhas, f"     ✔  CNPJ {cnpj_d} → Cond #{cond['id']} {cond['nome']}")
        elif cnpj_d:
            W(linhas, f"     ⚠  CNPJ {cnpj_d} NÃO encontrado no banco")
            # Tenta por nome
            cond, motivo = _buscar_cond_por_nome_diag(nome_d, condominios_db)
            if cond:
                W(linhas, f"     ✔  Nome '{nome_d}' → Cond #{cond['id']} {cond['nome']}  ({motivo})")
            else:
                W(linhas, f"     ✖  Nome '{nome_d}' também não encontrado  ({motivo})")
        else:
            W(linhas, "     ⚠  Sem CNPJ no XML")
            cond, motivo = _buscar_cond_por_nome_diag(nome_d, condominios_db)
            if cond:
                W(linhas, f"     ✔  Nome '{nome_d}' → Cond #{cond['id']} {cond['nome']}  ({motivo})")
            else:
                W(linhas, f"     ✖  Nome '{nome_d}' não encontrado  ({motivo})")

        # ── Verificar se nota já existe ─────────────────────────────────────
        nota_existente = nota_map.get(numero)
        if nota_existente:
            servico_existente = serv_map.get(nota_existente["id"])
            if servico_existente:
                W(linhas, f"     ℹ  Nota já importada (ID #{nota_existente['id']}) e JÁ tem serviço (ID #{servico_existente['id']})")
                resumo["ja_tem_servico"] += 1
            else:
                W(linhas, f"     ⚠  Nota já importada (ID #{nota_existente['id']}) MAS SEM SERVIÇO vinculado")
                if tipo in ("MANUTENCAO", "ASSISTENCIA") and cond:
                    W(linhas, f"     ➜  Seria possível criar serviço: tipo={tipo}, cond=#{cond['id']}")
                elif tipo not in ("MANUTENCAO", "ASSISTENCIA"):
                    W(linhas, f"     ℹ  Tipo '{tipo}' não gera serviço")
                elif not cond:
                    W(linhas, "     ✖  Sem condomínio vinculado — não é possível criar serviço")
                resumo["ja_importada_sem_servico"] += 1
        else:
            # Nota nova — simular o que aconteceria
            if not cond:
                W(linhas, "     ✖  RESULTADO: Nota será importada SEM condomínio → serviço NÃO criado")
                resumo["sem_cond"] += 1
            elif tipo not in ("MANUTENCAO", "ASSISTENCIA"):
                W(linhas, f"     ℹ  RESULTADO: Nota importada, mas tipo '{tipo}' não gera serviço")
                resumo["tipo_outros"] += 1
            else:
                W(linhas, f"     ✔  RESULTADO: Nota + serviço '{tipo}' serão criados para Cond #{cond['id']}")
                resumo["nova_com_cond"] += 1

        W(linhas, "")

    W(linhas, sub("RESUMO"))
    W(linhas, col("  Notas sem condomínio (serviço NÃO criado)", resumo["sem_cond"]))
    W(linhas, col("  Notas tipo OUTROS (não geram serviço)",     resumo["tipo_outros"]))
    W(linhas, col("  Notas novas que gerariam serviço",          resumo["nova_com_cond"]))
    W(linhas, col("  Já importadas COM serviço (ok)",            resumo["ja_tem_servico"]))
    W(linhas, col("  Já importadas SEM serviço (problema)",      resumo["ja_importada_sem_servico"]))


# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 10 — ANÁLISE FINANCEIRA XML vs BANCO DE DADOS
# Lê o xml_original de cada nota, re-parseia e cruza com o que está gravado.
# Cobre: valor, data_vencimento, parcelas, status, impostos (ISS, PIS, COFINS…)
# e calcula o valor correto por parcela/boleto para geração em massa.
# ─────────────────────────────────────────────────────────────────────────────

def _extrair_impostos_nfse(root):
    """Retorna dict com campos financeiros detalhados de uma NFSe."""
    def g(tag):
        el = root.find(f".//{tag}")
        return float(el.text.strip()) if el is not None and el.text and el.text.strip() else 0.0
    return {
        "valor_servicos":   g("ValorServicos"),
        "valor_deducoes":   g("ValorDeducoes"),
        "valor_pis":        g("ValorPis"),
        "valor_cofins":     g("ValorCofins"),
        "valor_inss":       g("ValorInss"),
        "valor_ir":         g("ValorIr"),
        "valor_csll":       g("ValorCsll"),
        "iss_retido":       g("IssRetido"),
        "valor_iss":        g("ValorIss"),
        "valor_iss_retido": g("ValorIssRetido"),
        "valor_liquido":    g("ValorLiquidoNfse"),
        "aliquota":         g("Aliquota"),
    }


def _extrair_impostos_nfe(root, ns):
    """Retorna dict com campos financeiros detalhados de uma NFe (ICMSTot)."""
    def g(xpath):
        el = root.find(xpath, ns)
        return float(el.text.strip()) if el is not None and el.text and el.text.strip() else 0.0
    pref = ".//nfe:total/nfe:ICMSTot/"
    return {
        "v_nf":       g(pref + "nfe:vNF"),
        "v_icms":     g(pref + "nfe:vICMS"),
        "v_pis":      g(pref + "nfe:vPIS"),
        "v_cofins":   g(pref + "nfe:vCOFINS"),
        "v_ipi":      g(pref + "nfe:vIPI"),
        "v_frete":    g(pref + "nfe:vFrete"),
        "v_seg":      g(pref + "nfe:vSeg"),
        "v_desc":     g(pref + "nfe:vDesc"),
        "v_tot_trib": g(pref + "nfe:vTotTrib"),
        # ISS não está no ICMSTot (é via ISSQN); tenta extrair do campo infCpl
        "v_iss_infcpl": _extrair_iss_infcpl(root, ns),
    }


def _extrair_iss_infcpl(root, ns):
    """Tenta extrair ISS do campo infCpl de uma NFe ('ISS: R$ 123,45' ou similar)."""
    el = root.find(".//nfe:infAdic/nfe:infCpl", ns)
    if el is None or not el.text:
        return 0.0
    m = re.search(r"ISS[:\s]+R?\$?\s*([\d.,]+)", el.text, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1).replace(".", "").replace(",", "."))
        except Exception:
            pass
    return 0.0


def _comparar(campo, val_db, val_xml, tolerancia=0.01):
    """Retorna (ok, mensagem) comparando valor do banco vs XML."""
    if val_db is None and val_xml is None:
        return True, ""
    if val_db is None:
        return False, f"{campo}: BD=NULL  XML={val_xml}"
    if val_xml is None:
        return False, f"{campo}: BD={val_db}  XML=não encontrado"
    if isinstance(val_db, float) or isinstance(val_xml, float):
        ok = abs(float(val_db) - float(val_xml)) <= tolerancia
        diff = float(val_db) - float(val_xml)
        return ok, (f"{campo}: BD={fmt_brl(val_db)}  XML={fmt_brl(val_xml)}  DIFF={fmt_brl(diff)}"
                    if not ok else "")
    # datas e strings
    ok = str(val_db)[:10] == str(val_xml)[:10] if campo.startswith("data") else str(val_db).upper() == str(val_xml).upper()
    return ok, (f"{campo}: BD={val_db}  XML={val_xml}" if not ok else "")


def sec_analise_financeira_xml_bd(engine, linhas):
    """
    Seção 10: para cada nota com xml_original no banco, re-parseia o XML e
    confronta todos os campos financeiros e datas. Calcula valor/parcela e
    identifica o que precisa ser corrigido antes de gerar boletos em massa.
    """
    W = w_append
    W(linhas, secao("10. ANÁLISE FINANCEIRA XML vs BANCO DE DADOS"))

    with engine.connect() as conn:
        notas = ler(conn,
            "SELECT n.*, c.nome AS cond_nome, c.cnpj AS cond_cnpj "
            "FROM notas_fiscais n "
            "LEFT JOIN condominios c ON c.id = n.condominio_id "
            "ORDER BY n.id")
        boletos_db = ler(conn,
            "SELECT nota_fiscal_id, COUNT(*) AS qtd, SUM(valor_nominal) AS soma_bols "
            "FROM boletos GROUP BY nota_fiscal_id")

    boleto_map = {b["nota_fiscal_id"]: b for b in boletos_db}

    notas_com_xml    = [n for n in notas if n.get("xml_original")]
    notas_sem_xml    = [n for n in notas if not n.get("xml_original")]
    ativas           = [n for n in notas if str(n.get("status","")) == "AUTORIZADA"]
    ativas_com_xml   = [n for n in ativas if n.get("xml_original")]

    W(linhas, col("Total de notas no banco",         len(notas)))
    W(linhas, col("  Autorizadas",                   len(ativas)))
    W(linhas, col("  Com xml_original",              len(notas_com_xml)))
    W(linhas, col("  Sem xml_original (manuais)",    len(notas_sem_xml)))
    W(linhas, "")

    # ── Contadores globais ─────────────────────────────────────────────────
    cnt = {
        "ok":                   0,  # sem nenhuma divergência
        "div_valor":            0,  # valor BD ≠ valor XML
        "div_vencimento":       0,  # data_vencimento divergente
        "div_parcelas":         0,  # parcelas divergente
        "div_status":           0,  # status divergente
        "div_tipo":             0,  # tipo divergente
        "sem_cond":             0,  # sem condomínio vinculado
        "parcelas_zero":        0,  # parcelas = 0 ou NULL
        "valor_zero":           0,  # valor = 0
        "boleto_valor_errado":  0,  # soma boletos ≠ nota.valor
        "pronta_boleto":        0,  # ok e sem boleto — pronta para emitir
    }

    problemas     = []  # lista de (nota_id, lista_de_alertas)
    prontas       = []  # notas autorizadas sem boleto e sem problemas críticos
    impostos_nfse = []  # todas as notas NFSe com breakdown de impostos
    impostos_nfe  = []  # todas as notas NFe com breakdown de impostos

    for nota in notas_com_xml:
        nid    = nota["id"]
        num    = nota.get("numero_nota") or "?"
        status = str(nota.get("status") or "?")
        tipo   = str(nota.get("tipo") or "?")
        valor_bd  = float(nota.get("valor") or 0)
        parcelas_bd = int(nota.get("parcelas") or 0)
        venc_bd   = nota.get("data_vencimento")
        cond_id   = nota.get("condominio_id")

        alertas   = []
        impostos  = {}

        # ── Parse do XML ────────────────────────────────────────────────────
        try:
            xml_str  = nota["xml_original"]
            r        = parse_xml(xml_str, f"nota#{nid}")
            tipo_xml = r.get("tipo_xml") or "?"

            valor_xml    = float(r.get("valor") or 0)
            venc_xml     = r.get("data_vencimento") or r.get("data_emissao") or ""
            parcelas_xml = int(r.get("parcelas") or 1)
            status_xml   = r.get("status") or "?"
            tipo_xml_det = r.get("tipo_nota") or "?"

            # ── Extração detalhada de impostos ─────────────────────────────
            root_el = ET.fromstring(xml_str)
            if tipo_xml == "NFSe":
                impostos = _extrair_impostos_nfse(root_el)
                impostos["_tipo_xml"] = "NFSe"
                impostos["_nota_id"]  = nid
                impostos["_numero"]   = num
                impostos["_cond"]     = nota.get("cond_nome") or "—"
                impostos["_valor_bd"] = valor_bd
                impostos_nfse.append(impostos)
            elif tipo_xml == "NFe":
                ns_nfe = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
                impostos = _extrair_impostos_nfe(root_el, ns_nfe)
                impostos["_tipo_xml"] = "NFe"
                impostos["_nota_id"]  = nid
                impostos["_numero"]   = num
                impostos["_cond"]     = nota.get("cond_nome") or "—"
                impostos["_valor_bd"] = valor_bd
                impostos_nfe.append(impostos)

            # ── Comparações campo a campo ───────────────────────────────────
            ok_val, msg_val  = _comparar("valor",          valor_bd,    valor_xml)
            ok_venc, msg_venc = _comparar("data_vencimento", venc_bd,   venc_xml)
            ok_parc, msg_parc = _comparar("parcelas",       parcelas_bd, parcelas_xml)
            ok_stat, msg_stat = _comparar("status",         status,      status_xml)
            ok_tipo, msg_tipo = _comparar("tipo",           tipo,        tipo_xml_det)

            if not ok_val:   alertas.append(f"⚠  VALOR:      {msg_val}"); cnt["div_valor"] += 1
            if not ok_venc:  alertas.append(f"📅 VENCIMENTO: {msg_venc}"); cnt["div_vencimento"] += 1
            if not ok_parc:  alertas.append(f"🔢 PARCELAS:   {msg_parc}"); cnt["div_parcelas"] += 1
            if not ok_stat:  alertas.append(f"🔴 STATUS:     {msg_stat}"); cnt["div_status"] += 1
            if not ok_tipo:  alertas.append(f"📋 TIPO:       {msg_tipo}"); cnt["div_tipo"] += 1

        except Exception as e:
            alertas.append(f"✖  ERRO PARSE XML: {e}")

        # ── Validações independentes do XML ─────────────────────────────────
        if not cond_id:
            alertas.append("🏢 SEM CONDOMÍNIO vinculado (boleto impossível)"); cnt["sem_cond"] += 1
        if parcelas_bd <= 0:
            alertas.append(f"🔢 PARCELAS = {parcelas_bd} (crash ao gerar boleto)"); cnt["parcelas_zero"] += 1
        if valor_bd == 0:
            alertas.append("💰 VALOR = 0"); cnt["valor_zero"] += 1

        # ── Verificar soma boletos vs nota.valor ────────────────────────────
        b = boleto_map.get(nid)
        if b:
            soma = float(b.get("soma_bols") or 0)
            diff = abs(soma - valor_bd)
            if diff > 0.05:
                alertas.append(f"🏦 BOLETOS: soma={fmt_brl(soma)} ≠ nota={fmt_brl(valor_bd)} (diff={fmt_brl(soma-valor_bd)})")
                cnt["boleto_valor_errado"] += 1

        # ── Classificação final ─────────────────────────────────────────────
        critico = any(a.startswith(("✖","🏢","🔢 PARCELAS")) for a in alertas)
        if not alertas:
            cnt["ok"] += 1
        if alertas:
            problemas.append((nota, alertas))

        # Pronta para boleto: AUTORIZADA + com cond + parcelas > 0 + valor > 0 + sem boleto existente
        if (status == "AUTORIZADA"
                and cond_id
                and parcelas_bd > 0
                and valor_bd > 0
                and not b
                and not critico):
            prontas.append(nota)
            cnt["pronta_boleto"] += 1

    # ══ RESUMO GLOBAL ══════════════════════════════════════════════════════════
    W(linhas, sub("RESUMO GERAL"))
    W(linhas, col("Notas sem divergência alguma",               cnt["ok"]))
    W(linhas, col("Notas com divergência de VALOR",             cnt["div_valor"]))
    W(linhas, col("Notas com divergência de VENCIMENTO",        cnt["div_vencimento"]))
    W(linhas, col("Notas com divergência de PARCELAS",          cnt["div_parcelas"]))
    W(linhas, col("Notas com STATUS divergente (XML vs BD)",    cnt["div_status"]))
    W(linhas, col("Notas com TIPO divergente (XML vs BD)",      cnt["div_tipo"]))
    W(linhas, col("Notas SEM condomínio vinculado ⚠",           cnt["sem_cond"]))
    W(linhas, col("Notas com parcelas = 0/NULL ⚠",              cnt["parcelas_zero"]))
    W(linhas, col("Notas com valor = 0 ⚠",                      cnt["valor_zero"]))
    W(linhas, col("Notas com soma boletos ≠ valor nota ⚠",      cnt["boleto_valor_errado"]))
    W(linhas, "")
    W(linhas, col("✔  PRONTAS para gerar boleto (sem boleto existente)",  cnt["pronta_boleto"]))

    # ══ PRONTAS PARA BOLETO ════════════════════════════════════════════════════
    if prontas:
        W(linhas, sub(f"✔  {len(prontas)} NOTAS PRONTAS PARA GERAR BOLETO"))
        W(linhas, f"  {'ID':>6}  {'Número':<24}  {'Tipo':<12}  {'Parc':>4}  {'Valor Total':>14}  "
                  f"{'Valor/Parcela':>14}  {'Vencimento':>10}  Condomínio")
        W(linhas, "  " + "-"*120)
        total_pronto = 0.0
        for n in sorted(prontas, key=lambda x: x.get("data_vencimento") or ""):
            parc     = int(n.get("parcelas") or 1)
            val      = float(n.get("valor") or 0)
            val_parc = val / parc if parc > 0 else 0.0
            total_pronto += val
            W(linhas, f"  #{n['id']:5d}  {str(n.get('numero_nota') or '?'):<24}  "
                      f"{str(n.get('tipo') or '?'):<12}  {parc:>4}  "
                      f"{fmt_brl(val):>14}  {fmt_brl(val_parc):>14}  "
                      f"{fmt_d(n.get('data_vencimento')):>10}  "
                      f"{n.get('cond_nome') or '—'}")
        W(linhas, "  " + "-"*120)
        W(linhas, col("  TOTAL A EMITIR", fmt_brl(total_pronto), 50))
        W(linhas, col("  Total boletos a criar (soma parcelas)",
                      sum(int(n.get("parcelas") or 1) for n in prontas), 50))

    # ══ PROBLEMAS DETALHADOS ══════════════════════════════════════════════════
    if problemas:
        W(linhas, sub(f"⚠  {len(problemas)} NOTAS COM DIVERGÊNCIAS — detalhes"))
        W(linhas, f"  {'ID':>6}  {'Número':<24}  {'Status':<12}  {'Valor BD':>14}  "
                  f"{'Parc':>4}  {'Vencimento':>10}  Condomínio")
        W(linhas, "  " + "-"*120)
        for nota, alertas in sorted(problemas, key=lambda x: x[0]["id"]):
            parc = int(nota.get("parcelas") or 0)
            val  = float(nota.get("valor") or 0)
            W(linhas, f"  #{nota['id']:5d}  {str(nota.get('numero_nota') or '?'):<24}  "
                      f"{str(nota.get('status') or '?'):<12}  {fmt_brl(val):>14}  "
                      f"{parc:>4}  {fmt_d(nota.get('data_vencimento')):>10}  "
                      f"{nota.get('cond_nome') or '— sem condomínio —'}")
            for a in alertas:
                W(linhas, f"       {a}")
        W(linhas, "")

    # ══ IMPOSTOS NFSe ══════════════════════════════════════════════════════════
    if impostos_nfse:
        W(linhas, sub(f"IMPOSTOS NFSe — {len(impostos_nfse)} notas"))
        W(linhas, f"  {'ID':>6}  {'Número':<20}  {'Serviços':>14}  {'ISS':>10}  "
                  f"{'PIS':>10}  {'COFINS':>10}  {'CSLL':>10}  {'INSS':>10}  "
                  f"{'Líquido':>14}  {'Alíquota%':>9}  Condomínio")
        W(linhas, "  " + "-"*150)
        for imp in impostos_nfse:
            W(linhas, f"  #{imp['_nota_id']:5d}  {str(imp['_numero']):<20}  "
                      f"{fmt_brl(imp['valor_servicos']):>14}  "
                      f"{fmt_brl(imp['valor_iss']):>10}  "
                      f"{fmt_brl(imp['valor_pis']):>10}  "
                      f"{fmt_brl(imp['valor_cofins']):>10}  "
                      f"{fmt_brl(imp['valor_csll']):>10}  "
                      f"{fmt_brl(imp['valor_inss']):>10}  "
                      f"{fmt_brl(imp['valor_liquido'] or imp['_valor_bd']):>14}  "
                      f"{imp['aliquota']:>9.2f}  "
                      f"{imp['_cond']}")
        # Totais
        W(linhas, "  " + "-"*150)
        W(linhas, f"  {'TOTAL':<28}  "
                  f"{fmt_brl(sum(i['valor_servicos'] for i in impostos_nfse)):>14}  "
                  f"{fmt_brl(sum(i['valor_iss'] for i in impostos_nfse)):>10}  "
                  f"{fmt_brl(sum(i['valor_pis'] for i in impostos_nfse)):>10}  "
                  f"{fmt_brl(sum(i['valor_cofins'] for i in impostos_nfse)):>10}  "
                  f"{fmt_brl(sum(i['valor_csll'] for i in impostos_nfse)):>10}  "
                  f"{fmt_brl(sum(i['valor_inss'] for i in impostos_nfse)):>10}  "
                  f"{fmt_brl(sum(i.get('valor_liquido') or i['_valor_bd'] for i in impostos_nfse)):>14}")

        # ISS retido vs não retido
        retidas    = [i for i in impostos_nfse if i.get("iss_retido", 0) > 0]
        nao_retidas = [i for i in impostos_nfse if i.get("iss_retido", 0) == 0]
        W(linhas, "")
        W(linhas, col("  ISS retido na fonte (iss_retido > 0)", len(retidas)))
        W(linhas, col("  ISS NÃO retido",                       len(nao_retidas)))
        if retidas:
            W(linhas, f"  Notas com ISS retido: {[i['_numero'] for i in retidas[:10]]}")

    # ══ IMPOSTOS NFe ══════════════════════════════════════════════════════════
    if impostos_nfe:
        W(linhas, sub(f"IMPOSTOS NFe — {len(impostos_nfe)} notas"))
        W(linhas, f"  {'ID':>6}  {'Número':<20}  {'vNF':>14}  {'ICMS':>10}  "
                  f"{'PIS':>10}  {'COFINS':>10}  {'IPI':>10}  {'Frete':>10}  "
                  f"{'Desc':>10}  {'TotTrib':>10}  Condomínio")
        W(linhas, "  " + "-"*150)
        for imp in impostos_nfe:
            W(linhas, f"  #{imp['_nota_id']:5d}  {str(imp['_numero']):<20}  "
                      f"{fmt_brl(imp['v_nf']):>14}  "
                      f"{fmt_brl(imp['v_icms']):>10}  "
                      f"{fmt_brl(imp['v_pis']):>10}  "
                      f"{fmt_brl(imp['v_cofins']):>10}  "
                      f"{fmt_brl(imp['v_ipi']):>10}  "
                      f"{fmt_brl(imp['v_frete']):>10}  "
                      f"{fmt_brl(imp['v_desc']):>10}  "
                      f"{fmt_brl(imp['v_tot_trib']):>10}  "
                      f"{imp['_cond']}")

    # ══ ANÁLISE PARCELAS / BOLETO ══════════════════════════════════════════════
    W(linhas, sub("CÁLCULO VALOR POR PARCELA (para geração em massa de boletos)"))
    W(linhas, "  Regra: valor_boleto = nota.valor / nota.parcelas")
    W(linhas, "")

    autorizadas_para_boleto = [n for n in ativas if n.get("xml_original")]
    if autorizadas_para_boleto:
        W(linhas, f"  {'ID':>6}  {'Número':<24}  {'Tipo':<12}  {'Parc':>4}  "
                  f"{'Valor Total':>14}  {'Valor/Parcela':>14}  {'Já tem boleto?':>15}  "
                  f"{'Boletos gerados':>15}  {'Status boleto':>14}")
        W(linhas, "  " + "-"*140)
        for n in sorted(autorizadas_para_boleto, key=lambda x: x.get("data_vencimento") or ""):
            parc     = int(n.get("parcelas") or 1)
            val      = float(n.get("valor") or 0)
            val_parc = val / parc if parc > 0 else 0.0
            b        = boleto_map.get(n["id"])
            tem_bol  = "SIM" if b else "NÃO"
            qtd_bol  = int(b["qtd"]) if b else 0
            soma_bol = float(b["soma_bols"]) if b else 0.0
            diff_bol = abs(soma_bol - val) if b else 0.0
            status_bol = "✔ ok" if b and diff_bol <= 0.05 and qtd_bol == parc else \
                         f"⚠ {qtd_bol}/{parc} bols, diff={fmt_brl(soma_bol-val)}" if b else "—"
            W(linhas, f"  #{n['id']:5d}  {str(n.get('numero_nota') or '?'):<24}  "
                      f"{str(n.get('tipo') or '?'):<12}  {parc:>4}  "
                      f"{fmt_brl(val):>14}  {fmt_brl(val_parc):>14}  "
                      f"{tem_bol:>15}  {qtd_bol:>15}  {status_bol}")

    # ══ RECOMENDAÇÕES ══════════════════════════════════════════════════════════
    W(linhas, sub("RECOMENDAÇÕES"))

    recs = []
    if cnt["div_valor"] > 0:
        recs.append(f"[VALOR]      {cnt['div_valor']} nota(s) têm valor diferente do XML. "
                    "Corrija via PUT /notas-fiscais/{id} com o campo 'valor'.")
    if cnt["div_vencimento"] > 0:
        recs.append(f"[VENCIMENTO] {cnt['div_vencimento']} nota(s) têm data_vencimento divergente do XML. "
                    "Verifique se o XML tem 'Vencimento' na discriminação. "
                    "Se não, o sistema usa data de emissão como fallback. "
                    "Corrija manualmente se necessário.")
    if cnt["div_parcelas"] > 0:
        recs.append(f"[PARCELAS]   {cnt['div_parcelas']} nota(s) têm parcelas divergentes. "
                    "O XML extrai parcelas do texto 'Parcelas: N' na discriminação. "
                    "Se ausente, assume 1. Corrija no BD se necessário.")
    if cnt["div_status"] > 0:
        recs.append(f"[STATUS]     {cnt['div_status']} nota(s) com status diferente do XML. "
                    "Execute POST /notas-fiscais/revalidar-todas para corrigir automaticamente.")
    if cnt["div_tipo"] > 0:
        recs.append(f"[TIPO]       {cnt['div_tipo']} nota(s) com tipo diferente do XML. "
                    "O tipo é detectado pelo prefixo da discriminação "
                    "('MANUTENCAO...', 'SERVICOS PRESTADOS...').")
    if cnt["sem_cond"] > 0:
        recs.append(f"[CONDOMÍNIO] {cnt['sem_cond']} nota(s) sem condomínio vinculado. "
                    "Sem CNPJ no cadastro ou CNPJ não cruzou com o XML. "
                    "Vincule manualmente via PATCH /notas-fiscais/{id}/vincular-condominio.")
    if cnt["parcelas_zero"] > 0:
        recs.append(f"[PARCELAS=0] {cnt['parcelas_zero']} nota(s) com parcelas=0 ou NULL. "
                    "CORRIJA URGENTE: causará divisão por zero ao gerar boleto. "
                    "SQL: UPDATE notas_fiscais SET parcelas=1 WHERE parcelas IS NULL OR parcelas=0;")
    if cnt["boleto_valor_errado"] > 0:
        recs.append(f"[BOLETO VAL] {cnt['boleto_valor_errado']} nota(s) com soma de boletos divergente do valor da nota. "
                    "Verifique via GET /boletos/inconsistencias.")
    if cnt["pronta_boleto"] > 0:
        recs.append(f"[PRONTO]     {cnt['pronta_boleto']} nota(s) autorizadas sem boleto, prontas para emissão. "
                    "Use a página Notas Fiscais > selecionar > Gerar Boleto(s).")
    if notas_sem_xml:
        recs.append(f"[SEM XML]    {len(notas_sem_xml)} nota(s) criadas manualmente (sem xml_original). "
                    "Não é possível revalidar ou extrair impostos dessas notas.")

    if recs:
        for rec in recs:
            W(linhas, f"  • {rec}")
            W(linhas, "")
    else:
        W(linhas, "  ✔  Nenhuma inconsistência crítica encontrada. Sistema OK para geração de boletos.")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Diagnóstico CMPort")
    parser.add_argument("--xml",          metavar="CAMINHO", help="Pasta ou arquivo zip/xml")
    parser.add_argument("--vincular",     metavar="CAMINHO", help="Analisa ZIP/XML e mostra por que serviços não são gerados")
    parser.add_argument("--salvar",       action="store_true", help="Salva .txt com timestamp")
    parser.add_argument("--env",          default=".env")
    parser.add_argument("--inter",        action="store_true", help="Busca todos boletos da API Inter")
    parser.add_argument("--data-inicio",  default=None, help="Data início para busca Inter (YYYY-MM-DD), padrão: 1 ano atrás")
    parser.add_argument("--data-fim",     default=None, help="Data fim para busca Inter (YYYY-MM-DD), padrão: hoje")
    parser.add_argument("--analise-xml",  action="store_true", help="Analisa e compara campos financeiros XML vs BD, impostos, parcelas")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    sys.path.insert(0, str(script_dir))

    env    = carregar_env(args.env)
    engine = criar_engine(env)

    linhas = []
    W = lambda s="": linhas.append(s)

    ts = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    W(SEP)
    W(f"  DIAGNÓSTICO CMPORT  —  {ts}")
    W(f"  Banco: {env.get('DB_NAME','?')}@{env.get('DB_HOST','?')}")
    W(SEP)

    try:
        with engine.connect() as conn:
            condominios, end_map, cont_map = sec_condominios(conn, linhas)
            notas, vencidas, parceladas    = sec_notas(conn, condominios, linhas)
            servicos                       = sec_servicos(conn, notas, linhas)
            boletos, notas_com_boleto      = sec_boletos(conn, notas, linhas)
        sec_cruzamentos(engine, notas, boletos, notas_com_boleto, condominios, linhas)

        # engine.connect() para cruzamentos usa escopo próprio acima
        with engine.connect() as conn:
            try:
                audit = ler(conn, "SELECT tipo, COUNT(*) as total FROM registros_exclusoes GROUP BY tipo ORDER BY tipo")
                W(linhas, secao("AUDITORIA (Exclusões registradas)"))
                for a in audit:
                    W(linhas, col(f"  {a['tipo']}", a['total']))
            except Exception:
                pass

        sec_financeiro(notas, boletos, notas_com_boleto, linhas)

    except Exception as e:
        import traceback
        W(linhas, f"\n[ERRO BANCO] {e}\n{traceback.format_exc()}")

    if args.xml:
        try:
            sec_xmls(args.xml, engine, linhas)
        except Exception as e:
            import traceback
            W(linhas, f"\n[ERRO XML] {e}\n{traceback.format_exc()}")

    if args.vincular:
        try:
            sec_vincular_servicos(args.vincular, engine, linhas)
        except Exception as e:
            import traceback
            W(linhas, f"\n[ERRO VINCULAR] {e}\n{traceback.format_exc()}")

    if args.analise_xml:
        try:
            sec_analise_financeira_xml_bd(engine, linhas)
        except Exception as e:
            import traceback
            W(linhas, f"\n[ERRO ANALISE-XML] {e}\n{traceback.format_exc()}")

    if args.inter:
        from datetime import date as _date
        hoje_s  = _date.today().isoformat()
        um_ano  = (_date.today().replace(year=_date.today().year - 1)).isoformat()
        d_inicio = args.data_inicio or um_ano
        d_fim    = args.data_fim    or hoje_s
        try:
            sec_inter(env, boletos, linhas, d_inicio, d_fim)
        except Exception as e:
            import traceback
            W(linhas, f"\n[ERRO INTER] {e}\n{traceback.format_exc()}")

    W(f"\n{SEP}")
    W(f"  Fim do diagnóstico  —  {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    W(SEP)

    relatorio = "\n".join(linhas)
    print(relatorio)

    if args.salvar:
        nome = f"diagnostico_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        Path(nome).write_text(relatorio, encoding="utf-8")
        print(f"\n✔  Salvo em: {script_dir / nome}")


if __name__ == "__main__":
    main()
