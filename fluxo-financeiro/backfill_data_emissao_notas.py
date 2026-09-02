# -*- coding: utf-8 -*-
"""
Backfill de notas_fiscais.data_emissao a partir do xml_original ja salvo.

Regra (decidida com o Atila):
  - Nota COM XML real  -> grava data_emissao lida do XML
    (NFSe=<DataEmissaoNFe>, NFe=<ide><dhEmi>). Fica a data certa.
  - Nota SEM XML real (ex: xml_original='ENTRADA_MANUAL') -> NAO grava nada,
    deixa data_emissao NULL. O front cai no fallback servico.data_servico.

Roda SEMPRE a partir da maquina local (nao deixa nada no servidor):
  - --ambiente local     -> conecta no MySQL local (pymysql)
  - --ambiente producao  -> SSH -> `docker exec cmport_db mysql` (sem tunel,
                            sem copiar arquivo pro servidor)

Uso (a partir da pasta backend, com a venv):
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/backfill_data_emissao_notas.py
        -> DRY-RUN local
    ... --aplicar                       -> grava local
    ... --ambiente producao             -> DRY-RUN producao
    ... --ambiente producao --aplicar   -> grava producao
    ... --force   -> reprocessa tambem as notas que ja tem data_emissao
"""
import argparse
import io
import os
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# poe backend/ no sys.path pra achar o pacote `app` (so a funcao pura de parse).
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
except NameError:
    pass

import pymysql

from app.services.nota_fiscal_service import extrair_data_emissao

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")

PROD_HOST = "168.231.96.184"
PROD_SSH_KEY = os.path.expanduser("~/.ssh/id_ed25519")
PROD_DB_NAME = "cmport_gerenciamento"


class ProdMySQL:
    """Executa SQL em producao via SSH -> `docker exec -i cmport_db mysql`.
    Nao abre tunel, nao copia nada pro servidor."""

    def __init__(self):
        import paramiko
        self.ssh = paramiko.SSHClient()
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.ssh.connect(PROD_HOST, username="root", key_filename=PROD_SSH_KEY, timeout=15)

    def run(self, sql: str, ler: bool) -> str:
        flags = "-N --batch " if ler else ""
        cmd = ("docker exec -i cmport_db sh -c "
               f"'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 {flags}{PROD_DB_NAME}'")
        stdin, stdout, stderr = self.ssh.exec_command(cmd, timeout=600)
        stdin.write(sql if sql.endswith("\n") else sql + "\n")
        stdin.channel.shutdown_write()
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        rc = stdout.channel.recv_exit_status()
        if rc != 0:
            raise RuntimeError(f"mysql producao rc={rc}: {err.strip()}")
        return out

    def close(self):
        self.ssh.close()


def _contagens_local(cur) -> tuple:
    cur.execute("SELECT COUNT(*), SUM(data_emissao IS NOT NULL) FROM notas_fiscais")
    total, com = cur.fetchone()
    return int(total), int(com or 0)


def _linhas_local(cur, force: bool):
    where = "xml_original IS NOT NULL" + ("" if force else " AND data_emissao IS NULL")
    cur.execute(f"SELECT id, numero_nota, xml_original FROM notas_fiscais WHERE {where}")
    return cur.fetchall()


def _contagens_prod(pc: "ProdMySQL") -> tuple:
    out = pc.run("SELECT COUNT(*), COALESCE(SUM(data_emissao IS NOT NULL),0) FROM notas_fiscais;", ler=True)
    total, com = out.split("\n")[0].split("\t")
    return int(total), int(com)


def _linhas_prod(pc: "ProdMySQL", force: bool):
    where = "xml_original IS NOT NULL" + ("" if force else " AND data_emissao IS NULL")
    out = pc.run(f"SELECT id, numero_nota, HEX(xml_original) FROM notas_fiscais WHERE {where};", ler=True)
    linhas = []
    for ln in out.split("\n"):
        if not ln.strip():
            continue
        p = ln.split("\t")
        if len(p) != 3:
            continue
        try:
            xml = bytes.fromhex(p[2]).decode("utf-8", "replace")
        except ValueError:
            xml = ""
        linhas.append((int(p[0]), p[1], xml))
    return linhas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ambiente", choices=["local", "producao"], default="local")
    ap.add_argument("--aplicar", action="store_true", help="grava no banco (default: dry-run)")
    ap.add_argument("--force", action="store_true", help="reprocessa notas que ja tem data_emissao")
    args = ap.parse_args()

    print(f"Ambiente: {args.ambiente}  |  modo: {'APLICAR' if args.aplicar else 'dry-run'}"
          f"{'  |  --force' if args.force else ''}\n")

    conn = pc = None
    if args.ambiente == "local":
        conn = pymysql.connect(**LOCAL_DB)
        cur = conn.cursor()
        cur.execute("SET NAMES utf8mb4;")
        total, ja_com = _contagens_local(cur)
        linhas = _linhas_local(cur, args.force)
    else:
        pc = ProdMySQL()
        total, ja_com = _contagens_prod(pc)
        linhas = _linhas_prod(pc, args.force)

    via_xml = sem_xml = 0
    updates = []          # [(id, 'YYYY-MM-DD')]
    amostra = []
    for nid, numero, xml in linhas:
        d = extrair_data_emissao(xml)
        if not d:
            sem_xml += 1
            continue
        via_xml += 1
        updates.append((nid, d.isoformat()))
        if len(amostra) < 15:
            amostra.append((nid, numero, d.isoformat()))

    if args.aplicar and updates:
        if args.ambiente == "local":
            cur.executemany("UPDATE notas_fiscais SET data_emissao = %s WHERE id = %s",
                            [(d, i) for i, d in updates])
            conn.commit()
        else:
            # manda em blocos pra nao estourar 1 comando gigante
            for k in range(0, len(updates), 300):
                bloco = updates[k:k + 300]
                sql = "\n".join(f"UPDATE notas_fiscais SET data_emissao = '{d}' WHERE id = {i};"
                                for i, d in bloco)
                pc.run(sql, ler=False)

    print(f"Total de notas .................. {total}")
    print(f"Ja tinham data_emissao ......... {ja_com}")
    print(f"Candidatas neste run .......... {len(linhas)}"
          + ("  (todas, --force)" if args.force else "  (data_emissao NULL + tem xml_original)"))
    print(f"  -> preenchidas via XML ...... {via_xml}")
    print(f"  -> sem XML real (fica NULL) . {sem_xml}")
    print()
    print("Amostra (nota_id | numero | data_emissao):")
    for r in amostra:
        print(f"  {r[0]:>6} | {r[1]:<14} | {r[2]}")
    print()
    print(f"APLICADO em {args.ambiente} ({len(updates)} UPDATE)." if args.aplicar
          else "DRY-RUN — nada foi gravado. Rode com --aplicar.")

    if conn:
        conn.close()
    if pc:
        pc.close()


if __name__ == "__main__":
    sys.exit(main())
