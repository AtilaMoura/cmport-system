# -*- coding: utf-8 -*-
"""
Passo 2 da reconciliacao ago/2026 — baixa do boleto 1152 (Fortezza, NF 7895,
manutencao JULHO/2026, vencida 20/08, paga por Pix avulso em 31/08 na conta
Inter CMPORT).

Replica o que o BoletoService.registrar_pagamento + _atualizar_data_pagamento_nota
+ _atualizar_corpo_nota_para_pago + CicloNotaService.atualizar_status_pelo_corpo
fariam:
  1. boleto_pagamentos  <- INSERT (valor 590.46, PIX, banco 2, 31/08)
  2. boletos 1152        -> situacao PAGO, data_pagamento, valor_total_recebido,
                            forma_pagamento PIX, banco_id 2
  3. notas_fiscais 1413  -> data_pagamento 2026-08-31 (todos os boletos da nota pagos)
  4. corpos_nota 262     -> status PAGO
  5. ciclos_nota 191     -> status_ciclo CONCLUIDO (regra: qualquer corpo PAGO => CONCLUIDO)

NAO mexe na NF 7883 (cancelada) nem no boleto 1465 (pendencia solta ja mapeada).
NAO cancela a cobranca no Inter (codigo a9c2aeb2) — isso e' feito a parte via
inter_client.cancelar_boleto ou no app do Inter.

Uso:
  dry-run:  ./venv/Scripts/python.exe ../fluxo-financeiro/aplicar_baixa_fortezza_passo2.py
  aplicar:  ... --aplicar
"""
import io
import os
import sys
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import paramiko

HOST = "168.231.96.184"
BASE = os.path.dirname(os.path.abspath(__file__))
APLICAR = "--aplicar" in sys.argv

BOLETO_ID = 1152
NOTA_ID = 1413
CORPO_ID = 262
CICLO_ID = 191
VALOR = "590.46"
DATA_PAG = "2026-08-31"
BANCO_ID = 2
OBS = "Baixa manual - Pix recebido na chave da empresa (reconciliacao extrato agosto/2026)"

UPDATES = [
    (f"INSERT INTO boleto_pagamentos (boleto_id, valor, data_pagamento, forma_pagamento, banco_id, observacao, criado_em) "
     f"SELECT {BOLETO_ID}, {VALOR}, '{DATA_PAG}', 'PIX', {BANCO_ID}, '{OBS}', NOW() "
     f"FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM boleto_pagamentos WHERE boleto_id={BOLETO_ID});"),
    (f"UPDATE boletos SET situacao='PAGO', data_pagamento='{DATA_PAG}', valor_total_recebido={VALOR}, "
     f"forma_pagamento='PIX', banco_id={BANCO_ID}, atualizado_em=NOW() "
     f"WHERE id={BOLETO_ID} AND situacao='EMABERTO';"),
    (f"UPDATE notas_fiscais SET data_pagamento='{DATA_PAG}' "
     f"WHERE id={NOTA_ID} AND data_pagamento IS NULL;"),
    (f"UPDATE corpos_nota SET status='PAGO', atualizado_em=NOW() "
     f"WHERE id={CORPO_ID} AND status NOT IN ('PAGO','CANCELADO') AND deletado_em IS NULL;"),
    (f"UPDATE ciclos_nota SET status_ciclo='CONCLUIDO', atualizado_em=NOW() "
     f"WHERE id={CICLO_ID} AND status_ciclo <> 'CONCLUIDO';"),
]


def ssh_conn():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=15)
    return c


def mysql(ssh, sql, table=False):
    fmt = "--table" if table else "-N --batch"
    cmd = ("docker exec -i cmport_db sh -c "
           f"'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 {fmt}'")
    i, o, e = ssh.exec_command(cmd, timeout=120)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
    i.channel.shutdown_write()
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if err.strip() and "Warning" not in err:
        print("SQL ERR:", err.strip()[:400])
    return out.strip()


def estado(ssh):
    print(mysql(ssh, f"""
      SELECT 'boleto' t, id, situacao, valor_total_recebido, data_pagamento, banco_id, forma_pagamento
        FROM boletos WHERE id={BOLETO_ID}
      UNION ALL SELECT 'nota', id, status, NULL, data_pagamento, NULL, NULL FROM notas_fiscais WHERE id={NOTA_ID}
      UNION ALL SELECT 'corpo', id, status, NULL, NULL, NULL, NULL FROM corpos_nota WHERE id={CORPO_ID}
      UNION ALL SELECT 'ciclo', id, status_ciclo, NULL, NULL, NULL, NULL FROM ciclos_nota WHERE id={CICLO_ID}
      UNION ALL SELECT 'pagto', id, CAST(valor AS CHAR), data_pagamento, NULL, banco_id, forma_pagamento
        FROM boleto_pagamentos WHERE boleto_id={BOLETO_ID};""", table=True))


def backup(ssh):
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    fn = os.path.join(BASE, f"backup_producao_pre_baixa_fortezza_{ts}.sql")
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysqldump -uroot -p\"$MYSQL_ROOT_PASSWORD\" --single-transaction cmport_gerenciamento "
           "boletos boleto_pagamentos notas_fiscais corpos_nota ciclos_nota'")
    i, o, e = ssh.exec_command(cmd, timeout=300)
    data = o.read()
    if b"CREATE TABLE" not in data:
        print("BACKUP FALHOU:", e.read().decode("utf-8", "replace")[:400])
        sys.exit(1)
    with open(fn, "wb") as f:
        f.write(data)
    print(f"  backup: {fn}  ({len(data)/1024/1024:.1f} MB)")


def main():
    ssh = ssh_conn()
    print("=" * 70)
    print(f"BAIXA boleto {BOLETO_ID} (Fortezza NF 7895)  —  {'APLICAR' if APLICAR else 'DRY-RUN'}")
    print("=" * 70)
    print("\nANTES:")
    estado(ssh)
    print("\nUPDATES:")
    for u in UPDATES:
        print("  " + u.replace("\n", " "))

    if not APLICAR:
        print("\n(dry-run — rode com --aplicar)")
        ssh.close()
        return

    print("\nBACKUP:")
    backup(ssh)
    print("\nAPLICANDO...")
    for u in UPDATES:
        mysql(ssh, u)
    print("\nDEPOIS:")
    estado(ssh)
    ssh.close()
    print("\nOK. Falta cancelar a cobranca no Inter (codigo a9c2aeb2-180c-4aa6-aa10-d69357fe02a4).")


if __name__ == "__main__":
    main()
