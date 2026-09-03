# -*- coding: utf-8 -*-
"""
Reconciliação da folha de AGOSTO/2026 — versão 2 (abrangente).

A folha de agosto NÃO é só "Pix pra fulano" — inclui guias pagas a instituições
(CEF/FGTS, Receita Federal/INSS-IRRF, AMIL, Associação de Beneficência, Sindicato,
SanMedi, Brasil Medicina). Essa versão pega TODAS as saídas do extrato que são
folha/encargo/benefício, e cruza com o sistema por VALOR (±R$0,02).

3 fontes:
  1. EXTRATO   -> extratos_agosto_normalizado.json  (o que REALMENTE saiu do banco)
  2. SISTEMA   -> despesas/movs de agosto (produção via SSH)
  3. PLANILHA  -> despesas_funcionario.json          (o que a cliente itemizou)

SOMENTE LEITURA.
Uso: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/conferir_folha_agosto.py
"""
import io
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _folha_d2_ssh import conectar

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
TOL = 0.02

NOMES_FUNC = {
    1: ["andre moreira", "andre m"], 2: ["melgarejo", "magarejo", "luis antonio"],
    3: ["welligto", "weligto", "wellingto", "meneses rodrigues", "menezes rodrigues"],
    4: ["pedro silva", "pedro henrique", "286596601 pedro"],
    5: ["fabiana"], 6: ["gabriel moreira", "gabriel pedretti"],
    7: ["almira", "salomao"],
}
FNOME = {1: "André", 2: "Luis", 3: "Welligton", 4: "Pedro", 5: "Fabiana", 6: "Gabriel", 7: "Almira", None: "-"}


def _n(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s.lower())).strip()


def mf(txt):
    t = _n(txt)
    for fid, toks in NOMES_FUNC.items():
        if any(tk in t for tk in toks):
            return fid
    return None


# instituições / termos que são FOLHA/ENCARGO/BENEFÍCIO
RX_FOLHA = re.compile(
    r"salari|adiant|rescis|rscis|feria|ferias|plant[ãa]o|hora extra|prl|13[ºo]|"
    r"cef matriz|cef |caixa economica|receita federal|darf|inss|irrf|fgts|gps|"
    r"sindicat|amil|san ?med|sanmed|brasil medicina|associacao de beneficencia|"
    r"bem mais familiar|beneficio mais familiar|previdencia|"
    r"pedro silva|286596601 pedro", re.I)
# saídas que NÃO são folha (mesmo perto de nomes)
RX_NAO = re.compile(
    r"diproseg|telman|thenorio|disfer|zn distribuidora|renata imoveis|suhai|"
    r"sinapar|estapar|zul |panific|rafael cansian|posto|sapopetro|uber|"
    r"prefeitura|pmsp|telefonica|quisi|bennuvem|benuven|cleber alves|"
    r"caique|caio ribeiro|lucivando|matheus de so|sabor do bolo|"
    r"cmport tec sistemas|cm port|54107009", re.I)


def carregar_extrato():
    d = json.load(open(os.path.join(BASE, "extratos_agosto_normalizado.json"), encoding="utf-8"))
    out = []
    for x in d["lancamentos"]:
        if x["valor"] >= 0:
            continue
        s = _n(x["descricao"])
        if RX_NAO.search(s):
            continue
        if RX_FOLHA.search(s):
            out.append({"data": x["data"], "rotulo": x["rotulo"], "valor": round(abs(x["valor"]), 2),
                        "desc": x["descricao"], "fid": mf(x["descricao"])})
    return out


def carregar_planilha():
    d = json.load(open(os.path.join(BASE, "despesas_funcionario.json"), encoding="utf-8"))
    out = []
    for t in d["transacoes"]:
        if str(t.get("pagto", "")).startswith("2026-08"):
            out.append({"data": t["pagto"], "valor": round(abs(t.get("valor") or t.get("pagos") or 0), 2),
                        "sub": t["subcategoria"], "desc": t["descricao"],
                        "fid": mf(t["descricao"]) or mf(t["subcategoria"])})
    return out


def carregar_sistema(db):
    desp = db.q("""
        SELECT d.id, COALESCE(c.nome,''), d.funcionario_id, d.valor_total, p.data_pagamento,
               p.banco_id, d.deletado_em, p.movimentacao_id, LEFT(d.descricao,70)
        FROM despesas d JOIN despesa_parcelas p ON p.despesa_id=d.id
        LEFT JOIN fin_categorias c ON c.id=d.categoria_id
        WHERE d.tipo_pagamento='UNICO'
          AND p.data_vencimento>='2026-08-01' AND p.data_vencimento<='2026-08-31'
    """)
    movs = db.q("""
        SELECT m.id, m.valor, m.data, m.deletado_em, COALESCE(c.nome,''), m.categoria_id,
               (SELECT COUNT(*) FROM despesa_parcelas p WHERE p.movimentacao_id=m.id) tem_parc,
               LEFT(m.descricao,70)
        FROM fin_movimentacoes m LEFT JOIN fin_categorias c ON c.id=m.categoria_id
        WHERE m.tipo='SAIDA' AND m.data>='2026-08-01' AND m.data<='2026-08-31'
    """)
    d_out, m_out = [], []
    for r in desp:
        s = _n(r[8])
        if RX_NAO.search(s) or not RX_FOLHA.search(s + " " + _n(r[1])):
            continue
        d_out.append({"id": int(r[0]), "cat": r[1], "fid": None if str(r[2]) == "NULL" else int(r[2]),
                      "valor": round(float(r[3]), 2), "data": r[4],
                      "banco_id": None if str(r[5]) == "NULL" else int(r[5]),
                      "del": str(r[6]) != "NULL", "mov_id": None if str(r[7]) == "NULL" else int(r[7]),
                      "desc": r[8]})
    for r in movs:
        s = _n(r[7])
        if RX_NAO.search(s) or not RX_FOLHA.search(s + " " + _n(r[4])):
            continue
        m_out.append({"id": int(r[0]), "valor": round(float(r[1]), 2), "data": r[2],
                      "del": str(r[3]) != "NULL", "cat": r[4], "cat_id": None if str(r[5]) == "NULL" else int(r[5]),
                      "tem_parc": int(r[6]), "desc": r[7]})
    return d_out, m_out


def main():
    ext = carregar_extrato()
    plan = carregar_planilha()
    db = conectar("producao")
    desp, movs = carregar_sistema(db)
    db.close()

    ext_ativo = [e for e in ext]
    desp_ativo = [d for d in desp if not d["del"]]
    movs_ativo = [m for m in movs if not m["del"]]

    print("=" * 105)
    print("[1] TOTAIS — Extrato (saiu do banco) × Sistema (despesas ativas) × Planilha FLUXO")
    print("=" * 105)
    print(f"  Extrato  folha/encargo agosto:  {len(ext_ativo):>3} lançamentos   R$ {sum(e['valor'] for e in ext_ativo):>12,.2f}")
    print(f"  Sistema  despesas ativas:       {len(desp_ativo):>3} despesas      R$ {sum(d['valor'] for d in desp_ativo):>12,.2f}")
    print(f"  Sistema  movs ativas:           {len(movs_ativo):>3} movimentações R$ {sum(m['valor'] for m in movs_ativo):>12,.2f}")
    print(f"  Planilha FLUXO:                 {len(plan):>3} lançamentos   R$ {sum(p['valor'] for p in plan):>12,.2f}")

    print("\n" + "=" * 105)
    print("[2] CADA LINHA DO EXTRATO (folha/encargo) → tem despesa? tem mov? está na planilha?")
    print("=" * 105)
    dp = list(desp_ativo); mv = list(movs_ativo); pl = list(plan)
    orfas = []
    for e in sorted(ext_ativo, key=lambda z: z["data"]):
        d = next((x for x in dp if abs(x["valor"] - e["valor"]) <= TOL), None)
        if d:
            dp.remove(d)
        m = next((x for x in mv if abs(x["valor"] - e["valor"]) <= TOL), None)
        if m:
            mv.remove(m)
        p = next((x for x in pl if abs(x["valor"] - e["valor"]) <= TOL), None)
        if p:
            pl.remove(p)
        dtxt = f"d{d['id']}(fid={d['fid']})" if d else "—"
        mtxt = f"m{m['id']}" + ("+parc" if m and m["tem_parc"] else "") if m else "—"
        flag = ""
        if m and not d and not (m and m["tem_parc"]):
            flag = "  <<< MOV ÓRFÃ (despesa apagada)"
            orfas.append((e, m))
        print(f"  {e['data']} {e['rotulo']:12} R$ {e['valor']:>9,.2f}  desp:{dtxt:16} mov:{mtxt:12} "
              f"planilha:{'SIM' if p else 'não':4}  {e['desc'][:34]}{flag}")

    print("\n  --- EXTRATO sem despesa ativa no sistema (pode ser mov órfã ou falta lançar) ---")
    dp2 = list(desp_ativo)
    for e in ext_ativo:
        d = next((x for x in dp2 if abs(x["valor"] - e["valor"]) <= TOL), None)
        if d:
            dp2.remove(d)
        else:
            print(f"    {e['data']} {e['rotulo']:12} R$ {e['valor']:>9,.2f}  {e['desc'][:55]}")

    print("\n  --- PLANILHA sem correspondente no EXTRATO (não saiu do banco em agosto?) ---")
    ep = list(ext_ativo)
    for p in plan:
        e = next((x for x in ep if abs(x["valor"] - p["valor"]) <= TOL), None)
        if e:
            ep.remove(e)
        else:
            print(f"    {p['data']} R$ {p['valor']:>9,.2f}  {p['sub'][:22]:22} {p['desc'][:45]}")

    print("\n" + "=" * 105)
    print("[3] DESPESAS de agosto SOFT-DELETADAS que eram folha (Passo 2b / limpeza) — conferir")
    print("=" * 105)
    for d in sorted([x for x in desp if x["del"]], key=lambda z: z["data"]):
        m_viva = next((x for x in movs_ativo if x["id"] == d["mov_id"]), None)
        tag = f"  mov {d['mov_id']} AINDA VIVA" if m_viva else ""
        print(f"  d{d['id']:>4} {d['data']} R$ {d['valor']:>9,.2f}  mov={d['mov_id']}  {d['desc'][:45]}{tag}")

    print("\n" + "=" * 105)
    print("[4] MOVS de agosto ÓRFÃS (folha, sem despesa, sem parcela) — precisam de despesa+vínculo")
    print("=" * 105)
    for m in sorted(movs_ativo, key=lambda z: z["data"]):
        if m["tem_parc"] == 0:
            print(f"  m{m['id']:>4} {m['data']} R$ {m['valor']:>9,.2f}  [{m['cat'][:20]:20}]  {m['desc'][:45]}")


if __name__ == "__main__":
    main()
