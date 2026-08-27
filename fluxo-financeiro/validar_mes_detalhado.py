# -*- coding: utf-8 -*-
import re
import sys
import openpyxl
import pymysql

XLSX_PATH = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\docs-e-planilhas\FLUXO FINANCEIRO - 2026.xlsx"
SHEET_NAME = "Entradas e SAIDAS - 2026"
MAX_ROW = 2200

mes = int(sys.argv[1])
ano = int(sys.argv[2]) if len(sys.argv) > 2 else 2026


def normaliza(numero):
    n = str(numero).strip()
    n = re.sub(r'\s*A$', '', n)
    n = re.sub(r'^000\.000\.0*', '', n)
    n = re.sub(r'-\d+$', '', n)
    return n.strip()


# --- planilha: notas com NF real (exclui Pix/Recibo, que sao tratados a parte) ---
wb = openpyxl.load_workbook(XLSX_PATH, data_only=True, read_only=True)
ws = wb[SHEET_NAME]
planilha_notas = []
planilha_recibos = []
for row in ws.iter_rows(min_row=1, max_row=MAX_ROW, min_col=1, max_col=9, values_only=True):
    categoria, condo, nf, parcela, d_pag, valor = row[3], row[2], row[4], row[5], row[6], row[8]
    if categoria != "Assistencia":
        continue
    if not isinstance(valor, (int, float)):
        continue
    if d_pag is None or not (d_pag.month == mes and d_pag.year == ano):
        continue
    if nf in ("Pix", "Recibo") or nf is None:
        planilha_recibos.append({"condo": condo, "parcela": parcela, "valor": valor})
    else:
        planilha_notas.append({"numero": nf, "norm": normaliza(nf), "condo": condo, "parcela": parcela, "valor": valor})
wb.close()

# --- banco ---
conn = pymysql.connect(host="localhost", port=3306, user="root", password="cmport2026",
                        database="cmport_gerenciamento", charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor)
cur = conn.cursor()
CNPJ_CMPORT = "22761557000188"

cur.execute("""
    SELECT nf.numero_nota, c.nome condominio, b.numero_parcela, b.total_parcelas, b.valor_nominal, nf.xml_original IS NULL nativa
    FROM notas_fiscais nf JOIN boletos b ON b.nota_fiscal_id=nf.id LEFT JOIN condominios c ON c.id=nf.condominio_id
    WHERE nf.tipo='ASSISTENCIA' AND MONTH(b.data_pagamento)=%s AND YEAR(b.data_pagamento)=%s
      AND REPLACE(REPLACE(REPLACE(nf.cnpj_emitente,'.',''),'/',''),'-','')=%s
""", (mes, ano, CNPJ_CMPORT))
db_notas = [{"numero": r["numero_nota"], "norm": normaliza(r["numero_nota"]), "condo": r["condominio"] or "",
             "parcela": f"{r['numero_parcela']}/{r['total_parcelas']}", "valor": float(r["valor_nominal"])}
            for r in cur.fetchall()]

cur.execute("""
    SELECT numero_recibo, valor, condominio_id FROM recibos
    WHERE status='PAGO' AND MONTH(data_pagamento)=%s AND YEAR(data_pagamento)=%s
      AND REPLACE(REPLACE(REPLACE(cnpj_emitente,'.',''),'/',''),'-','')=%s
""", (mes, ano, CNPJ_CMPORT))
db_recibos = [{"numero": r["numero_recibo"], "valor": float(r["valor"])} for r in cur.fetchall()]
conn.close()

print(f"Planilha: {len(planilha_notas)} notas + {len(planilha_recibos)} recibos | Banco: {len(db_notas)} notas + {len(db_recibos)} recibos\n")

usado = set()
faltando = []
for p in planilha_notas:
    achou = False
    for i, d in enumerate(db_notas):
        if i in usado:
            continue
        if d["norm"] == p["norm"] and abs(d["valor"] - p["valor"]) < 0.02:
            usado.add(i)
            achou = True
            break
    if not achou:
        faltando.append(p)
sobrando = [d for i, d in enumerate(db_notas) if i not in usado]

print(f"=== FALTANDO NO BANCO (planilha tem, banco nao) : {len(faltando)} ===")
tot = 0
for p in sorted(faltando, key=lambda x: -x["valor"]):
    print(f"  {str(p['numero']):16} | {(p['condo'] or '')[:28]:28} | parcela={str(p['parcela']):8} | R$ {p['valor']:>10.2f}")
    tot += p["valor"]
print(f"  TOTAL: R$ {tot:.2f}\n")

print(f"=== SOBRANDO NO BANCO (banco tem, planilha nao) : {len(sobrando)} ===")
tot = 0
for d in sorted(sobrando, key=lambda x: -x["valor"]):
    print(f"  {d['numero']:16} | {d['condo'][:28]:28} | parcela={d['parcela']:8} | R$ {d['valor']:>10.2f}")
    tot += d["valor"]
print(f"  TOTAL: R$ {tot:.2f}\n")

print(f"Total planilha (notas): R$ {sum(p['valor'] for p in planilha_notas):.2f}")
print(f"Total banco (notas): R$ {sum(d['valor'] for d in db_notas):.2f}")
print(f"\nRecibos planilha: {[(r['condo'], r['valor']) for r in planilha_recibos]}")
print(f"Recibos banco: {[(r['numero'], r['valor']) for r in db_recibos]}")
