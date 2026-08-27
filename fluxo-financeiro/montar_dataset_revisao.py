# -*- coding: utf-8 -*-
"""
Transforma dados_bancos_revisao.json (cru da producao) no dataset compacto
que vai embutido na tela HTML de revisao de banco.

Gera fluxo-financeiro/dataset_revisao_bancos.json
"""
import io
import json
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SRC = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\fluxo-financeiro\dados_bancos_revisao.json"
OUT = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\fluxo-financeiro\dataset_revisao_bancos.json"

CMPORT = "22761557000188"
TEC = "65756913000188"


def so_digitos(s):
    return "".join(c for c in (s or "") if c.isdigit())


def inferir_cnpj(x):
    if x.get("despesa_cnpj"):
        return so_digitos(x["despesa_cnpj"])
    ie = x.get("id_externo_banco") or ""
    if "TEC" in ie:
        return TEC
    if "CMPORT" in ie:
        return CMPORT
    if x.get("banco_id") in (4, 5):
        return TEC
    if x.get("banco_id") in (1, 2, 3):
        return CMPORT
    if "TEC" in (x.get("observacao") or "").upper():
        return TEC
    return CMPORT


RE_TRANSF = re.compile(r"\bpara\s+(inter|ita[uú]|bradesco|b\.?\s?t\.?\s?g)\b", re.I)
RE_NOT_TRANSF = re.compile(r"condom[íi]nio|material para|para\s+carro|para\s+computador|para\s+olivais", re.I)
FUNC_CATS = {
    "Salários", "Adiantamento de Salário", "Impostos (FGTS/GPS/ISS)",
    "Sindical", "Convênio", "Repasse zelador/síndico", "Alimentação",
}
RE_FUNC = re.compile(
    r"sal[áa]rio|adiantamento|vale.?transp|f[ée]rias|resc(is|ão)|d[eé]cimo|13[º°]"
    r"|\binss\b|\bfgts\b|\bgps\b|folha|vale.?alim|benef[íi]cio|plano de sa[úu]de",
    re.I,
)


def classificar_tipo(x):
    desc = x.get("descricao") or ""
    cat = x.get("categoria") or x.get("categoria_despesa") or ""
    if RE_TRANSF.search(desc) and not RE_NOT_TRANSF.search(desc):
        return "Transferência"
    if (x.get("mov_fornecedor_id") or x.get("despesa_fornecedor_id")
            or x.get("categoria_grupo") == "FORNECEDOR"
            or x.get("categoria_despesa_grupo") == "FORNECEDOR"):
        return "Fornecedor"
    if cat in FUNC_CATS or RE_FUNC.search(desc):
        return "Funcionário"
    return "Geral"


def origem(x):
    ie = x.get("id_externo_banco") or ""
    obs = (x.get("observacao") or "").lower()
    if ie.startswith("MIGRACAO") or "migra" in obs and "hist" in obs:
        return "Migração histórica"
    if "planilha principal" in obs or "importado da planilha" in obs:
        return "Import planilha"
    if "reconcilia" in obs:
        return "Reconciliação"
    return "Manual"


def main():
    d = json.load(open(SRC, encoding="utf-8"))
    bancos = d["bancos"]

    rows = []
    for x in d["movimentacoes"]:
        cnpj = inferir_cnpj(x)
        desc = x.get("despesa_desc") or x.get("descricao") or ""
        forn = x.get("fornecedor") or x.get("fornecedor_despesa")
        cat = x.get("categoria") or x.get("categoria_despesa")
        parc = ""
        if x.get("numero_parcela") and x.get("total_parcelas") and x["total_parcelas"] > 1:
            parc = f"{x['numero_parcela']}/{x['total_parcelas']}"
        rows.append({
            "mov_id": x["mov_id"],
            "parcela_id": x.get("parcela_id"),
            "despesa_id": x.get("despesa_id"),
            "data": str(x["data"])[:10] if x.get("data") else None,
            "valor": round(float(x["valor"]), 2),
            "descricao": desc,
            "fornecedor": forn,
            "categoria": cat,
            "parcela": parc,
            "status": x.get("status"),
            "forma": x.get("forma_pagamento"),
            "banco_atual": x.get("banco_id"),
            "cnpj": cnpj,
            "origem": origem(x),
            "tipo": classificar_tipo(x),
        })

    rows.sort(key=lambda r: (r["data"] or "9999", r["descricao"]))

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"bancos": bancos, "rows": rows}, fh, ensure_ascii=False, separators=(",", ":"))

    import collections
    print(f"{len(rows)} linhas")
    print("por CNPJ:", collections.Counter(r["cnpj"] for r in rows))
    print("por mes:", dict(sorted(collections.Counter((r["data"] or "?")[:7] for r in rows).items())))
    print("por origem:", collections.Counter(r["origem"] for r in rows))
    print("por tipo:", collections.Counter(r["tipo"] for r in rows))
    print("por status:", collections.Counter(r["status"] for r in rows))
    bmap = {b["id"]: b["nome"] for b in bancos}
    print("banco atual:", collections.Counter(bmap.get(r["banco_atual"], "— vazio —") for r in rows))
    print(f"\nSalvo em {OUT}  ({__import__('os').path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main()
