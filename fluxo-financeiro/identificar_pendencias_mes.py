# -*- coding: utf-8 -*-
"""
Pra cada linha da planilha (Manutencao/Assistencia) de um mes/ano/empresa que
NAO bate com um boleto ja PAGO no sistema, tenta achar a nota/boleto correspondente
mesmo que ainda esteja EMABERTO/VENCIDO/EXPIRADO -- diferente de validar_mes_detalhado.py,
que so olha boletos ja pagos e por isso reporta como "faltando" coisa que na
verdade so esta aguardando registro de pagamento.

Classifica cada linha da planilha em:
  - já paga e batendo (nao aparece na lista de pendencias)
  - já existe no sistema, so falta registrar pagamento (mostra id do boleto + situacao)
  - já existe mas o valor diverge do banco (sinaliza, nao presume qual esta certo)
  - nao encontrada em nenhuma nota do sistema (candidata a precisar criar do zero)

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/identificar_pendencias_mes.py --mes 8 --ano 2026 --empresa cmport
    ... --empresa tec --ambiente producao   (producao e o default; local exige SSH desligado)
"""
import argparse
import io
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import openpyxl
import paramiko
import pymysql

DOCS_DIR = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\docs-e-planilhas"
SHEET_NAME = "Entradas e SAIDAS - 2026"

EMPRESAS = {
    "cmport": dict(xlsx=f"{DOCS_DIR}\\FLUXO FINANCEIRO - 2026.xlsx", max_row=2200, cnpj="22761557000188"),
    "tec": dict(xlsx=f"{DOCS_DIR}\\FLUXO FINANCEIRO CMPORT TEC - 2026.xlsx", max_row=600, cnpj="65756913000188"),
}

PROD_HOST = "168.231.96.184"
LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")


def numero_base(numero):
    """Normaliza numero_nota (planilha ou banco) pra lista de bases comparaveis:
    remove prefixo TEC, sufixo de parcela (-N), sufixo A/M, prefixo 000.000.,
    zeros a esquerda; combo NNNN.NNNN vira 2 bases (padrao Assistencia+Produto
    vinculados). Prefixo TEC precisa ser removido ANTES do resto -- senao nunca
    bate com o numero real do sistema (bug que gerou falsos "nao achada" e
    "valor diverge" numa sessao de reconciliacao, ver PROCESSO_RECONCILIACAO_MENSAL.md)."""
    n = str(numero).strip()
    n = re.sub(r"(?i)^TEC\s+", "", n)
    n = re.sub(r"[- ]\d+/\d+$", "", n)
    n = re.sub(r"-\d+$", "", n)
    for suf in (" M", " A", " m", " a"):
        if n.endswith(suf):
            n = n[: -len(suf)]
            break
    partes = []
    for p in n.split("."):
        p = p.strip()
        if p.startswith("000."):
            p = p.split(".")[-1]
        p = p.lstrip("0") or "0"
        partes.append(p)
    return partes


def extrair_planilha(xlsx_path, max_row, mes, ano):
    wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
    ws = wb[SHEET_NAME]
    linhas = []
    for row in ws.iter_rows(min_row=1, max_row=max_row, min_col=1, max_col=9, values_only=True):
        categoria, condo, nf, parcela, d_pag, valor = row[3], row[2], row[4], row[5], row[6], row[8]
        if categoria not in ("Contrato", "Assistencia"):
            continue
        if not isinstance(valor, (int, float)):
            continue
        if d_pag is None or d_pag.month != mes or d_pag.year != ano or d_pag.year < 2000:
            continue
        nf_norm = str(nf).strip().lower() if nf else None
        if nf_norm in ("pix", "recibo") or nf is None:
            continue  # recibos tratados a parte (ver Helbor/Eraseg como exemplo)
        linhas.append({"nf": str(nf), "condo": condo, "categoria": categoria, "parcela": parcela,
                        "data": d_pag.date(), "valor": valor})
    wb.close()
    return linhas


QUERY = """
SELECT nf.id, nf.numero_nota, nf.tipo, c.nome, b.id, b.situacao, b.numero_parcela,
       b.total_parcelas, b.valor_nominal, b.data_vencimento, b.data_pagamento
FROM notas_fiscais nf LEFT JOIN condominios c ON c.id=nf.condominio_id
LEFT JOIN boletos b ON b.nota_fiscal_id=nf.id
WHERE REPLACE(REPLACE(REPLACE(nf.cnpj_emitente,'.',''),'/',''),'-','') = '{cnpj}'
"""


def buscar_notas_local(cnpj):
    conn = pymysql.connect(**LOCAL_DB)
    with conn.cursor() as cur:
        cur.execute(QUERY.format(cnpj=cnpj))
        rows = cur.fetchall()
    conn.close()
    return rows


def buscar_notas_producao(cnpj):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)
    query = "USE cmport_gerenciamento; " + QUERY.format(cnpj=cnpj).replace("\n", " ") + ";"
    cmd = "docker exec -i cmport_db sh -c 'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" -N'"
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    stdin.write(query)
    stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", errors="replace")
    ssh.close()
    rows = []
    for line in out.strip().splitlines():
        p = line.split("\t")
        if len(p) < 11:
            continue
        rows.append(tuple(None if v == "NULL" else v for v in p))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mes", type=int, required=True)
    parser.add_argument("--ano", type=int, default=2026)
    parser.add_argument("--empresa", choices=list(EMPRESAS), default="cmport")
    parser.add_argument("--ambiente", choices=["local", "producao"], default="producao")
    args = parser.parse_args()
    cfg = EMPRESAS[args.empresa]

    planilha = extrair_planilha(cfg["xlsx"], cfg["max_row"], args.mes, args.ano)
    print(f"Planilha ({args.empresa}, {args.mes}/{args.ano}): {len(planilha)} linhas de Manutencao/Assistencia com NF real\n")

    rows = buscar_notas_local(cfg["cnpj"]) if args.ambiente == "local" else buscar_notas_producao(cfg["cnpj"])
    notas = [{"id": r[0], "numero": r[1], "tipo": r[2], "condo": r[3], "boleto_id": r[4],
              "situacao": r[5], "parcela": r[6], "total": r[7], "valor": r[8], "venc": r[9], "pag": r[10]}
             for r in rows]

    resumo = {"aberto_igual": 0, "aberto_valor_diverge": 0, "sem_boleto": 0, "nao_achada": 0}
    for item in planilha:
        candidatos = numero_base(item["nf"])
        achados = [n for n in notas if set(numero_base(n["numero"])) & set(candidatos)]
        if not achados:
            print(f"NAO ACHADA     {item['nf']:16} {str(item['condo'])[:30]:30} R$ {item['valor']:>9.2f}  ({item['data']})")
            resumo["nao_achada"] += 1
            continue

        melhor = None
        for a in achados:
            if a["boleto_id"] is None:
                continue
            try:
                v = float(a["valor"])
            except (TypeError, ValueError):
                continue
            venc_mes = a["venc"] and str(a["venc"]).startswith(f"{args.ano}-{args.mes:02d}")
            bate_valor = abs(v - item["valor"]) < 0.02
            ja_pago = a["situacao"] == "PAGO" and a["pag"] and str(a["pag"]).startswith(f"{args.ano}-{args.mes:02d}")
            score = (ja_pago, bate_valor and venc_mes, bate_valor, venc_mes)
            if melhor is None or score > melhor[0]:
                melhor = (score, a)

        if melhor is None:
            ids = sorted(set(a["id"] for a in achados))
            print(f"SEM BOLETO     {item['nf']:16} {str(item['condo'])[:30]:30} R$ {item['valor']:>9.2f}  ids={ids}")
            resumo["sem_boleto"] += 1
            continue

        a = melhor[1]
        if a["situacao"] == "PAGO" and a["pag"] and str(a["pag"]).startswith(f"{args.ano}-{args.mes:02d}"):
            continue  # ja fechado, nao e pendencia

        diverge = abs(float(a["valor"]) - item["valor"]) >= 0.02
        marca = "  <VALOR DIVERGE>" if diverge else ""
        print(f"{a['situacao']:14} {item['nf']:16} {str(item['condo'])[:30]:30} "
              f"R$ {item['valor']:>9.2f}  -> boleto id={a['boleto_id']} venc={a['venc']} "
              f"sistema=R$ {a['valor']}{marca}")
        if diverge:
            resumo["aberto_valor_diverge"] += 1
        else:
            resumo["aberto_igual"] += 1

    print(f"\nResumo: {resumo}")


if __name__ == "__main__":
    main()
