# -*- coding: utf-8 -*-
"""
Helper compartilhado dos scripts da Fase D2 (migração da folha histórica).

- `conectar(ambiente)` → objeto com `.q(sql)` (SELECT, devolve lista de linhas já
  splitadas por TAB) e `.exec(sql)` (INSERT/UPDATE, devolve stdout cru).
- Local: PyMySQL direto, lendo `backend/.env`.
- Produção: SSH + `docker exec cmport_db mysql`, mesmo padrão de
  `comparar_extrato_tec_agosto.py` / `conferir_folha_funcionarios.py`.

SET NAMES utf8mb4 em toda conexão. NUNCA faz DELETE — quem usa isto só manda
UPDATE ... deletado_em = NOW() e INSERT.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
HOST = "168.231.96.184"

CNPJ = {"CMPORT": "22761557000188", "TEC": "65756913000188"}


def _env_local():
    """Lê DB_* do backend/.env."""
    envf = BASE.parent / "backend" / ".env"
    dados = {}
    for ln in envf.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*([A-Z_]+)\s*=\s*(.*)\s*$", ln)
        if m:
            dados[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return dados


class _Local:
    ambiente = "local"

    def __init__(self):
        import pymysql
        e = _env_local()
        self.conn = pymysql.connect(
            host=e.get("DB_HOST", "127.0.0.1"),
            port=int(e.get("DB_PORT", "3306")),
            user=e.get("DB_USER", "root"),
            password=e.get("DB_PASSWORD", ""),
            database=e.get("DB_NAME", "cmport_gerenciamento"),
            charset="utf8mb4",
            autocommit=False,
        )
        with self.conn.cursor() as c:
            c.execute("SET NAMES utf8mb4")

    def q(self, sql):
        with self.conn.cursor() as c:
            c.execute(sql)
            return [list(map(_s, row)) for row in c.fetchall()]

    def exec(self, sql):
        with self.conn.cursor() as c:
            c.execute(sql)
            return c.lastrowid

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()


class _Prod:
    ambiente = "producao"

    def __init__(self):
        import paramiko
        self.ssh = paramiko.SSHClient()
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.ssh.connect(HOST, username="root", timeout=20)

    def _run(self, sql):
        cmd = ("docker exec -i cmport_db sh -c "
               "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" "
               "--default-character-set=utf8mb4 -N --batch cmport_gerenciamento'")
        i, o, e = self.ssh.exec_command(cmd, timeout=120)
        i.write("SET NAMES utf8mb4;\n" + sql)
        i.channel.shutdown_write()
        out = o.read().decode("utf-8", "replace")
        err = e.read().decode("utf-8", "replace")
        # o cliente mysql joga um aviso de senha no stderr — só é erro de verdade
        # se aparecer "ERROR" (ex: "ERROR 1064 (42000) ...")
        if "ERROR " in err:
            raise RuntimeError(f"MySQL erro: {err.strip()}\nSQL: {sql[:400]}")
        return out

    def q(self, sql):
        return [ln.split("\t") for ln in self._run(sql).splitlines() if ln.strip()]

    def exec(self, sql):
        # devolve LAST_INSERT_ID() se o INSERT gerou id.
        # precisa do ';' separando o statement do caller do SELECT final,
        # senão o cliente mysql --batch junta os dois e dá erro de sintaxe.
        sql = sql.rstrip().rstrip(";")
        out = self._run(sql + ";\nSELECT LAST_INSERT_ID();")
        linhas = [ln for ln in out.splitlines() if ln.strip()]
        try:
            return int(linhas[-1])
        except (ValueError, IndexError):
            return None

    def commit(self):
        pass  # cada _run é autocommit no mysql client

    def rollback(self):
        pass

    def close(self):
        self.ssh.close()


def _s(v):
    return "NULL" if v is None else str(v)


def conectar(ambiente):
    return _Prod() if ambiente == "producao" else _Local()


def sql_str(v):
    """Escapa string pra literal SQL. None → NULL."""
    if v is None:
        return "NULL"
    return "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


def parse_args(descricao):
    import argparse
    p = argparse.ArgumentParser(description=descricao)
    p.add_argument("--ambiente", choices=["local", "producao"], default="local")
    p.add_argument("--aplicar", action="store_true",
                   help="sem esta flag = dry-run (só imprime, não altera nada)")
    return p.parse_args()


def carregar_input():
    import json
    return json.load((BASE / "folha_d2_input.json").open(encoding="utf-8"))
