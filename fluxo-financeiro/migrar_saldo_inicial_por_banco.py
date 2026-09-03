# -*- coding: utf-8 -*-
"""
Fase 2 do dashboard "por banco" — semeia o SALDO INICIAL por conta bancaria de
AGOSTO/2026, a partir dos saldos apurados no Passo 1 da reconciliacao de extratos
(fluxo-financeiro/extratos_agosto_normalizado.json).

Grava linhas em fin_movimentacoes... nao: em `fin_saldo_inicial` com banco_id
preenchido (a linha global banco_id=NULL continua intacta — o dashboard
consolidado antigo nao muda).

Valores (saldo em 01/08/2026, do proprio extrato):
  banco_id 1  Itau (CMPORT)      -342.35
  banco_id 2  Inter (CMPORT)      551.96
  banco_id 4  Inter (CMPORT TEC) 6740.19
  (Bradesco / BTG: sem extrato de agosto — cliente informa na tela se precisar)

Uso:
  dry-run:  ./venv/Scripts/python.exe ../fluxo-financeiro/migrar_saldo_inicial_por_banco.py
  aplicar:  ... migrar_saldo_inicial_por_banco.py --aplicar --ambiente producao

--ambiente local (default) usa o banco local via env do backend.
--ambiente producao aplica por SSH (docker exec cmport_db mysql), com backup.
"""
import os
import sys
from datetime import datetime

ANO, MES = 2026, 8
SALDOS = {1: "-342.35", 2: "551.96", 4: "6740.19"}   # banco_id -> saldo 01/08

APLICAR = "--aplicar" in sys.argv
AMBIENTE = "producao" if "--ambiente" in sys.argv and "producao" in sys.argv else "local"
HOST = "168.231.96.184"
BASE = os.path.dirname(os.path.abspath(__file__))


def _sql_upserts():
    linhas = []
    for banco_id, valor in SALDOS.items():
        linhas.append(
            "INSERT INTO fin_saldo_inicial (ano, mes, banco_id, valor, observacao, criado_em, atualizado_em) "
            f"VALUES ({ANO}, {MES}, {banco_id}, {valor}, 'Semeado do extrato de agosto (Passo 1 reconciliacao)', NOW(), NOW()) "
            f"ON DUPLICATE KEY UPDATE valor=VALUES(valor), observacao=VALUES(observacao), atualizado_em=NOW();"
        )
    return linhas


def run_local():
    sys.path.insert(0, os.path.join(BASE, "..", "backend"))
    import app.main  # noqa: F401  (registra models + migrations)
    from app.core.database import SessionLocal
    from app.repositories.fin_saldo_inicial_repository import FinSaldoInicialRepository

    db = SessionLocal()
    print("ANTES (linhas por banco do mes):")
    for s in FinSaldoInicialRepository.listar_por_mes(db, ANO, MES):
        print(f"  banco_id={s.banco_id} valor={s.valor}")
    if not APLICAR:
        print("\nUPSERTS que seriam feitos:")
        for bid, v in SALDOS.items():
            print(f"  banco_id={bid} -> {v}")
        print("\n(dry-run — rode com --aplicar)")
        return
    for bid, v in SALDOS.items():
        FinSaldoInicialRepository.upsert(db, ANO, MES, v, "Semeado do extrato de agosto (Passo 1 reconciliacao)", banco_id=bid)
    print("\nDEPOIS:")
    for s in FinSaldoInicialRepository.listar_por_mes(db, ANO, MES):
        print(f"  banco_id={s.banco_id} valor={s.valor}")
    db.close()


def run_producao():
    import paramiko

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

    ssh = ssh_conn()
    print(f"AMBIENTE PRODUCAO  ({'APLICAR' if APLICAR else 'DRY-RUN'})")
    print("\nANTES:")
    print(mysql(ssh, f"SELECT id,banco_id,valor,observacao FROM fin_saldo_inicial WHERE ano={ANO} AND mes={MES};"))
    print("\nUPSERTS:")
    for u in _sql_upserts():
        print("  " + u)
    if not APLICAR:
        print("\n(dry-run — nada aplicado. Rode com --aplicar --ambiente producao)")
        ssh.close()
        return
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    fn = os.path.join(BASE, f"backup_producao_pre_saldo_inicial_banco_{ts}.sql")
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysqldump -uroot -p\"$MYSQL_ROOT_PASSWORD\" --single-transaction cmport_gerenciamento fin_saldo_inicial'")
    i, o, e = ssh.exec_command(cmd, timeout=120)
    data = o.read()
    if b"CREATE TABLE" not in data:
        print("BACKUP FALHOU:", e.read().decode("utf-8", "replace")[:400])
        sys.exit(1)
    with open(fn, "wb") as f:
        f.write(data)
    print(f"\n  backup: {fn}  ({len(data)/1024:.0f} KB)")
    for u in _sql_upserts():
        mysql(ssh, u)
    print("\nDEPOIS:")
    print(mysql(ssh, f"SELECT id,banco_id,valor,observacao FROM fin_saldo_inicial WHERE ano={ANO} AND mes={MES};"))
    ssh.close()


if __name__ == "__main__":
    (run_producao if AMBIENTE == "producao" else run_local)()
