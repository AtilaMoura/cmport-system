# -*- coding: utf-8 -*-
"""
Passo 2 da reconciliacao de agosto/2026 — ajuste de banco_id em ENTRADAS ja
registradas que estao na conta errada (ou sem conta).

NAO muda situacao, valor nem data. So preenche/corrige banco_id.

Itens (todos conferidos: extrato + planilha mestre):
  recibo 61  banco_id 2 -> 4  (Jose Erivaldo / Cond. Jussara, TEC, Pix caiu na Inter TEC 04/08)
  recibo 62  banco_id 2 -> 4  (Joao Garcia / Cond. Jussara, TEC, Pix caiu na Inter TEC 06/08)
  boleto 284 banco_id NULL -> 2  (Olivais NF 117-2 p4/10, PAGO, baixa automatica Inter,
                                  parcelas 1-3 ja tem banco_id 2)  [so com --com-boleto-284]

Uso:
  dry-run:  ./venv/Scripts/python.exe ../fluxo-financeiro/aplicar_ajuste_banco_passo2.py
  aplicar:  ... aplicar_ajuste_banco_passo2.py --aplicar [--com-boleto-284]

Backup automatico das tabelas recibos+boletos antes de aplicar.
"""
import io
import os
import sys
import time
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import paramiko

HOST = "168.231.96.184"
BASE = os.path.dirname(os.path.abspath(__file__))

APLICAR = "--aplicar" in sys.argv
COM_284 = "--com-boleto-284" in sys.argv

RECIBOS = [(61, 2, 4), (62, 2, 4)]          # (id, de, para)
BOLETO_284 = (284, None, 2)


def ssh_conn():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=15)
    return c


def mysql(ssh, sql, silent=False):
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
    i, o, e = ssh.exec_command(cmd, timeout=120)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
    i.channel.shutdown_write()
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if err.strip() and "Warning" not in err and not silent:
        print("SQL ERR:", err.strip()[:400])
    return out.strip()


def estado(ssh):
    print("  RECIBOS 61/62 (esperado banco_id=2 antes):")
    print(mysql(ssh, "SELECT id,numero_recibo,valor,data_pagamento,status,banco_id "
                     "FROM recibos WHERE id IN (61,62);"))
    print("  BOLETO 284 + parcelas 1-3 (esperado 284 NULL, 281-283 = 2):")
    print(mysql(ssh, "SELECT id,numero_parcela,situacao,valor_nominal,data_pagamento,banco_id "
                     "FROM boletos WHERE nota_fiscal_id=(SELECT nota_fiscal_id FROM boletos WHERE id=284) "
                     "AND numero_parcela<=4 ORDER BY numero_parcela;"))


def backup(ssh):
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    fn = os.path.join(BASE, f"backup_producao_pre_ajuste_banco_passo2_{ts}.sql")
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysqldump -uroot -p\"$MYSQL_ROOT_PASSWORD\" --single-transaction "
           "cmport_gerenciamento recibos boletos'")
    i, o, e = ssh.exec_command(cmd, timeout=180)
    data = o.read()
    err = e.read().decode("utf-8", "replace")
    if b"CREATE TABLE" not in data:
        print("BACKUP FALHOU:", err[:400])
        sys.exit(1)
    with open(fn, "wb") as f:
        f.write(data)
    print(f"  backup: {fn}  ({len(data)/1024:.0f} KB)")
    return fn


def main():
    ssh = ssh_conn()
    print("=" * 70)
    print(f"AJUSTE DE BANCO — Passo 2  ({'APLICAR' if APLICAR else 'DRY-RUN'}"
          f"{' + boleto 284' if COM_284 else ''})")
    print("=" * 70)

    print("\nANTES:")
    estado(ssh)

    updates = [f"UPDATE recibos SET banco_id={p} WHERE id={i} AND banco_id={d};"
               for (i, d, p) in RECIBOS]
    if COM_284:
        i, d, p = BOLETO_284
        updates.append(f"UPDATE boletos SET banco_id={p} WHERE id={i} AND banco_id IS NULL;")

    print("\nUPDATES:")
    for u in updates:
        print("  " + u)

    if not APLICAR:
        print("\n(dry-run — nada aplicado. Rode com --aplicar)")
        ssh.close()
        return

    print("\nBACKUP:")
    backup(ssh)

    print("\nAPLICANDO...")
    for u in updates:
        mysql(ssh, u)
        time.sleep(0.3)

    print("\nDEPOIS:")
    estado(ssh)
    ssh.close()
    print("\nOK.")


if __name__ == "__main__":
    main()
