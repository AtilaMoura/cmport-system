# -*- coding: utf-8 -*-
"""
B3.1 da Fase 1 — backfill AUTOMATICO do banco_id das ENTRADAS que nasceram
da API do Banco Inter (logo o dinheiro caiu na conta Inter do CNPJ emitente).

Regra:
  boletos  : situacao PAGO/BAIXADO/PARCIAL, banco_id NULL, codigo_solicitacao != NULL
             -> banco_id = conta Inter do cnpj_emitente da nota
  recibos  : tipo ENTRADA, status PAGO, nao deletado, banco_id NULL,
             configuracao_inter_id != NULL
             -> banco_id = conta Inter ligada aquela configuracao_inter

O resto das entradas sem banco (boletos "Transferencia" sem codigo, recibos
sem config) NAO entra aqui — vai pra tela de conferencia da cliente (B3.2).

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/backfill_banco_entradas.py
        (dry-run)
    ... backfill_banco_entradas.py --aplicar
    ... backfill_banco_entradas.py --sql-only
    ... --ambiente producao   (default: local)
"""
import argparse
import io
import os
import sys
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import pymysql
import paramiko

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")
PROD_HOST = "168.231.96.184"
DEST_DIR = os.path.dirname(os.path.abspath(__file__))

NORM = "REPLACE(REPLACE(REPLACE({c},'.',''),'/',''),'-','')"

Q_PREVIEW_BOLETOS = f"""
SELECT b.id, nf.numero_nota, c.nome, b.valor_nominal, b.data_pagamento, bk.id, bk.nome
FROM boletos b
JOIN notas_fiscais nf ON nf.id = b.nota_fiscal_id
LEFT JOIN condominios c ON c.id = nf.condominio_id
JOIN configuracao_inter ci ON {NORM.format(c='ci.cnpj')} = {NORM.format(c='nf.cnpj_emitente')}
JOIN bancos bk ON bk.configuracao_inter_id = ci.id
WHERE b.situacao IN ('PAGO','BAIXADO','PARCIAL') AND b.banco_id IS NULL
  AND b.codigo_solicitacao IS NOT NULL
ORDER BY b.data_pagamento
"""

Q_PREVIEW_RECIBOS = """
SELECT r.id, r.numero_recibo, COALESCE(c.nome, r.cliente_nome_avulso), r.valor, r.data_pagamento, bk.id, bk.nome
FROM recibos r
JOIN bancos bk ON bk.configuracao_inter_id = r.configuracao_inter_id
LEFT JOIN condominios c ON c.id = r.condominio_id
WHERE r.tipo = 'ENTRADA' AND r.status = 'PAGO' AND r.deletado_em IS NULL
  AND r.banco_id IS NULL AND r.configuracao_inter_id IS NOT NULL
ORDER BY r.data_pagamento
"""

U_BOLETOS = f"""
UPDATE boletos b
JOIN notas_fiscais nf ON nf.id = b.nota_fiscal_id
JOIN configuracao_inter ci ON {NORM.format(c='ci.cnpj')} = {NORM.format(c='nf.cnpj_emitente')}
JOIN bancos bk ON bk.configuracao_inter_id = ci.id
SET b.banco_id = bk.id
WHERE b.situacao IN ('PAGO','BAIXADO','PARCIAL') AND b.banco_id IS NULL
  AND b.codigo_solicitacao IS NOT NULL
"""

U_RECIBOS = """
UPDATE recibos r
JOIN bancos bk ON bk.configuracao_inter_id = r.configuracao_inter_id
SET r.banco_id = bk.id
WHERE r.tipo = 'ENTRADA' AND r.status = 'PAGO' AND r.deletado_em IS NULL
  AND r.banco_id IS NULL AND r.configuracao_inter_id IS NOT NULL
"""


def run_local(sqls, commit):
    conn = pymysql.connect(**LOCAL_DB)
    cur = conn.cursor()
    cur.execute("SET NAMES utf8mb4")
    out = []
    for s in sqls:
        cur.execute(s)
        out.append(cur.fetchall() if s.strip().upper().startswith("SELECT") else cur.rowcount)
    if commit:
        conn.commit()
    conn.close()
    return out


def run_prod(sql_text, ler):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)
    flag = "-N --batch" if ler else ""
    cmd = (f"docker exec -i cmport_db sh -c "
           f"'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 {flag}'")
    i, o, e = ssh.exec_command(cmd, timeout=120)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql_text)
    i.channel.shutdown_write()
    out = o.read().decode("utf-8", "replace")
    err = "\n".join(l for l in e.read().decode("utf-8", "replace").splitlines()
                    if "Using a password" not in l)
    rc = o.channel.recv_exit_status()
    ssh.close()
    if rc != 0:
        raise RuntimeError(f"mysql rc={rc}: {err}")
    return out


def preview(ambiente):
    if ambiente == "local":
        r = run_local([Q_PREVIEW_BOLETOS, Q_PREVIEW_RECIBOS], commit=False)
        return r[0], r[1]
    def parse(txt):
        linhas = []
        for ln in txt.splitlines():
            p = ln.split("\t")
            if len(p) == 7:
                linhas.append(p)
        return linhas
    bol = parse(run_prod(Q_PREVIEW_BOLETOS.strip() + ";", ler=True))
    rec = parse(run_prod(Q_PREVIEW_RECIBOS.strip() + ";", ler=True))
    return bol, rec


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ambiente", choices=["local", "producao"], default="local")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--aplicar", action="store_true")
    g.add_argument("--sql-only", action="store_true")
    args = ap.parse_args()

    print(f"B3.1 backfill banco das entradas Inter — ambiente={args.ambiente}  modo="
          f"{'APLICAR' if args.aplicar else ('SQL-ONLY' if args.sql_only else 'dry-run')}\n")

    bol, rec = preview(args.ambiente)

    print(f"### BOLETOS ({len(bol)}) — situacao paga, sem banco, com codigo_solicitacao (API Inter)")
    tot = 0.0
    for row in bol:
        bid, nota, nome, valor, dpag, bk_id, bk_nome = row
        tot += float(valor)
        print(f"  boleto {str(bid):>5}  {str(dpag):10}  nota {str(nota)[:12]:12}  "
              f"{str(nome or '')[:28]:28}  R$ {float(valor):>10.2f}  -> {bk_nome} (id {bk_id})")
    print(f"  total: R$ {tot:.2f}\n")

    print(f"### RECIBOS ({len(rec)}) — ENTRADA paga, sem banco, com configuracao_inter_id")
    totr = 0.0
    for row in rec:
        rid, num, nome, valor, dpag, bk_id, bk_nome = row
        totr += float(valor)
        print(f"  recibo {str(rid):>5}  {str(dpag):10}  {str(num)[:14]:14}  "
              f"{str(nome or '')[:28]:28}  R$ {float(valor):>10.2f}  -> {bk_nome} (id {bk_id})")
    print(f"  total: R$ {totr:.2f}\n")

    if not bol and not rec:
        print("(nada a fazer.)")
        return

    if args.aplicar:
        if args.ambiente == "local":
            r = run_local([U_BOLETOS, U_RECIBOS], commit=True)
            print(f"✅ Aplicado em local: {r[0]} boletos + {r[1]} recibos.")
        else:
            run_prod(U_BOLETOS.strip() + ";\n" + U_RECIBOS.strip() + ";\n", ler=False)
            print(f"✅ Aplicado em producao: {len(bol)} boletos + {len(rec)} recibos "
                  f"(rowcount confirmado pelo preview).")
    elif args.sql_only:
        nome = f"backfill_banco_entradas_{args.ambiente}_{datetime.now():%Y%m%d_%H%M}.sql"
        with open(os.path.join(DEST_DIR, nome), "w", encoding="utf-8") as fh:
            fh.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n\n"
                     + U_BOLETOS.strip() + ";\n\n" + U_RECIBOS.strip() + ";\n")
        print(f"📄 SQL: fluxo-financeiro/{nome}")
    else:
        print("(dry-run — nada alterado.)")


if __name__ == "__main__":
    main()
