# -*- coding: utf-8 -*-
"""
Antes de cancelar os 7 boletos EXPIRADO como "duplicata", confere contra a
planilha mestre (FLUXO FINANCEIRO - 2026.xlsx, aba Entradas e SAIDAS).

1. Puxa da PRODUCAO todos os boletos das 7 notas (EXPIRADO + irmaos) -> CSV
   fluxo-financeiro/expirados_producao.csv
2. Le a planilha, filtra as linhas de Entrada (Contrato/Assistencia) dos
   condominios envolvidos.
3. Pra cada nota, cruza: quanto a planilha diz que entrou x o que o sistema
   tem registrado como pago. Aponta se o EXPIRADO e' mesmo duplicata ou se
   a planilha nao confirma.

Uso: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/verificar_expirados_vs_planilha.py
"""
import csv
import io
import re
import sys
import unicodedata

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import openpyxl
import paramiko

XLSX = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\docs-e-planilhas\FLUXO FINANCEIRO - 2026.xlsx"
SHEET = "Entradas e SAIDAS - 2026"
OUT_CSV = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\fluxo-financeiro\expirados_producao.csv"

NOTAS = {  # nfid -> (numero, condominio curto)
    431: ("7690", "Piazza Fontana"),
    444: ("7706", "Verbena"),
    456: ("7710", "Sao Bento Green Park"),
    473: ("7717", "Bambino"),
    386: ("61-2", "Bem Viver General Jardim"),
    784: ("122-2", "Raposo Tavares"),
    852: ("7835", "Concor"),
}
EXPIRADO_IDS = {92, 108, 117, 165, 184, 515, 575}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def num_base(n):
    n = str(n or "").strip()
    n = re.sub(r"(?i)^tec\s+", "", n)
    n = re.sub(r"[- ]\d+/\d+$", "", n)
    n = re.sub(r"-\d+$", "", n)
    n = re.sub(r"\s*[am]$", "", n, flags=re.I)
    n = n.lstrip("0") or "0"
    return n


def puxar_producao():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("168.231.96.184", username="root", timeout=15)
    ids = ",".join(map(str, NOTAS))
    sql = f"""
        SELECT b.id, b.nota_fiscal_id, nf.numero_nota, b.numero_parcela, b.total_parcelas,
               b.valor_nominal, b.situacao, b.data_vencimento, b.data_pagamento, b.banco_id,
               nf.valor, nf.tipo, nf.status, c.nome
        FROM boletos b
        JOIN notas_fiscais nf ON nf.id = b.nota_fiscal_id
        LEFT JOIN condominios c ON c.id = nf.condominio_id
        WHERE b.nota_fiscal_id IN ({ids})
        ORDER BY b.nota_fiscal_id, b.numero_parcela, b.id;"""
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
    i, o, e = ssh.exec_command(cmd, timeout=60)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
    i.channel.shutdown_write()
    linhas = [ln.split("\t") for ln in o.read().decode("utf-8", "replace").splitlines() if "\t" in ln]
    ssh.close()
    return linhas


def ler_planilha(condominios_norm):
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    ws = wb[SHEET]
    linhas = []
    for row in ws.iter_rows(min_row=1, max_row=2500, min_col=1, max_col=10, values_only=True):
        condo, categoria, nf, parcela, d_pag, _, valor = row[2], row[3], row[4], row[5], row[6], row[7], row[8]
        if categoria not in ("Contrato", "Assistencia"):
            continue
        if not isinstance(valor, (int, float)):
            continue
        if norm(condo) not in condominios_norm and not any(cn in norm(condo) for cn in condominios_norm):
            continue
        linhas.append({
            "condo": condo, "categoria": categoria, "nf": str(nf) if nf is not None else "",
            "parcela": parcela, "data": d_pag, "valor": float(valor),
        })
    wb.close()
    return linhas


def main():
    prod = puxar_producao()

    # salva CSV
    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["boleto_id", "nota_id", "numero_nota", "parcela", "total_parcelas",
                    "valor_boleto", "situacao", "vencimento", "pagamento", "banco_id",
                    "valor_nota", "tipo", "nota_status", "condominio", "EH_EXPIRADO_SUSPEITO"])
        for r in prod:
            w.writerow(r + ["SIM" if int(r[0]) in EXPIRADO_IDS else ""])
    print(f"CSV salvo: fluxo-financeiro/expirados_producao.csv  ({len(prod)} boletos)\n")

    condos_norm = {norm(v[1]) for v in NOTAS.values()}
    plan = ler_planilha(condos_norm)
    print(f"Planilha: {len(plan)} linhas de Entrada dos condominios envolvidos\n")

    # agrupa producao por nota
    por_nota = {}
    for r in prod:
        por_nota.setdefault(int(r[1]), []).append(r)

    print("=" * 100)
    for nfid, (numero, condo) in NOTAS.items():
        bols = por_nota.get(nfid, [])
        nf_valor = float(bols[0][10]) if bols else 0
        pagos = [b for b in bols if b[6] in ("PAGO", "BAIXADO")]
        exp = [b for b in bols if int(b[0]) in EXPIRADO_IDS]
        total_pago = sum(float(b[5]) for b in pagos)

        # linhas da planilha que batem com essa nota (por numero base)
        alvo = num_base(numero)
        plan_nota = [p for p in plan if num_base(p["nf"]) == alvo or alvo in num_base(p["nf"])]
        total_plan = sum(p["valor"] for p in plan_nota)

        print(f"\n### NF {numero}  ({condo})   nota=R$ {nf_valor:.2f}")
        print(f"  SISTEMA: {len(bols)} boletos | pagos {len(pagos)} = R$ {total_pago:.2f} | "
              f"expirado suspeito: {[b[0] for b in exp]}")
        for b in bols:
            marca = "  <<< EXPIRADO SUSPEITO" if int(b[0]) in EXPIRADO_IDS else ""
            print(f"    bol {b[0]:>5}  pc {b[3]}/{b[4]}  R$ {float(b[5]):>8.2f}  {b[6]:9}  "
                  f"venc {b[7]}  pag {b[8]}{marca}")
        print(f"  PLANILHA: {len(plan_nota)} linha(s) = R$ {total_plan:.2f}")
        for p in plan_nota:
            print(f"    {p['nf']:14} parc={p['parcela']}  {p['data']}  R$ {p['valor']:.2f}  ({p['condo']})")

        # veredito
        if not exp:
            continue
        exp_val = sum(float(b[5]) for b in exp)
        if abs(total_pago - total_plan) < 0.05 and total_plan > 0:
            print(f"  >>> planilha CONFIRMA pagamento (R$ {total_plan:.2f}) — expirado {[b[0] for b in exp]} "
                  f"e' DUPLICATA, pode cancelar")
        elif total_plan == 0:
            print(f"  >>> planilha NAO tem linha pra essa nota — CONFERIR MANUAL antes de mexer")
        else:
            print(f"  >>> DIVERGE: sistema pago R$ {total_pago:.2f} x planilha R$ {total_plan:.2f} — CONFERIR")


if __name__ == "__main__":
    main()
