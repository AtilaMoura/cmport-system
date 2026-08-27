# -*- coding: utf-8 -*-
"""
Cria backup (mysqldump) do banco local e/ou de producao, com nome de arquivo
padronizado e timestamp -- substitui os comandos manuais do Passo 1.1/Passo 6
do PROCESSO_RECONCILIACAO_MENSAL.md, que ate agora eram sempre digitados na mao.

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/backup_bd.py --local --label pre_deploy_bancos
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/backup_bd.py --producao --label pre_deploy_bancos
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/backup_bd.py --ambos --label pre_deploy_bancos

--label e opcional (default "manual") -- vira parte do nome do arquivo, ex:
    fluxo-financeiro/backup_local_pre_deploy_bancos_20260815_1530.sql
    fluxo-financeiro/backup_producao_pre_deploy_bancos_20260815_1530.sql

Nao apaga nem sobrescreve backups antigos (nome sempre tem timestamp novo).
Producao usa a mesma flag --no-tablespaces do runbook (evita erro de
permissao PROCESS com o usuario nao-root do container).
"""
import argparse
import io
import os
import subprocess
import sys
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import paramiko

DEST_DIR = os.path.dirname(os.path.abspath(__file__))

LOCAL_DB_USER = "root"
LOCAL_DB_PASS = "cmport2026"
LOCAL_DB_NAME = "cmport_gerenciamento"
LOCAL_CONTAINER = "cmport_db"

PROD_HOST = "168.231.96.184"
PROD_SSH_KEY = os.path.expanduser("~/.ssh/id_ed25519")
PROD_DB_NAME = "cmport_gerenciamento"
PROD_CONTAINER = "cmport_db"


def _timestamp():
    return datetime.now().strftime("%Y%m%d_%H%M")


def backup_local(label: str) -> str:
    nome = f"backup_local_{label}_{_timestamp()}.sql"
    destino = os.path.join(DEST_DIR, nome)
    print(f"[local] Rodando mysqldump no container {LOCAL_CONTAINER}...")
    cmd = [
        "docker", "exec", LOCAL_CONTAINER,
        "mysqldump", f"-u{LOCAL_DB_USER}", f"-p{LOCAL_DB_PASS}",
        "--no-tablespaces", LOCAL_DB_NAME,
    ]
    with open(destino, "wb") as f:
        resultado = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE)
    if resultado.returncode != 0:
        os.remove(destino)
        raise RuntimeError(f"mysqldump local falhou: {resultado.stderr.decode('utf-8', errors='replace')}")
    tamanho_mb = os.path.getsize(destino) / (1024 * 1024)
    print(f"[local] OK -> {nome} ({tamanho_mb:.1f} MB)")
    return destino


def backup_producao(label: str) -> str:
    nome = f"backup_producao_{label}_{_timestamp()}.sql"
    destino = os.path.join(DEST_DIR, nome)
    print(f"[producao] Conectando via SSH em {PROD_HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", key_filename=PROD_SSH_KEY, timeout=15)
    cmd = (
        f"docker exec {PROD_CONTAINER} sh -c "
        "'exec mysqldump -uroot -p\"$MYSQL_ROOT_PASSWORD\" "
        f"--single-transaction --no-tablespaces --routines --triggers {PROD_DB_NAME}'"
    )
    print("[producao] Rodando mysqldump remoto (pode levar alguns segundos)...")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    conteudo = stdout.read()
    erro = stderr.read().decode("utf-8", errors="replace")
    exit_status = stdout.channel.recv_exit_status()
    ssh.close()

    if exit_status != 0 or not conteudo:
        raise RuntimeError(f"mysqldump producao falhou (exit={exit_status}): {erro}")

    with open(destino, "wb") as f:
        f.write(conteudo)
    tamanho_mb = os.path.getsize(destino) / (1024 * 1024)
    print(f"[producao] OK -> {nome} ({tamanho_mb:.1f} MB)")
    if erro.strip():
        print(f"[producao] stderr (aviso, geralmente so o warning de senha na linha de comando):\n{erro.strip()}")
    return destino


def main():
    parser = argparse.ArgumentParser(description="Backup do banco local e/ou producao, com timestamp.")
    grupo = parser.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--local", action="store_true", help="Backup só do banco local")
    grupo.add_argument("--producao", action="store_true", help="Backup só de producao")
    grupo.add_argument("--ambos", action="store_true", help="Backup dos dois")
    parser.add_argument("--label", default="manual", help="Rotulo curto pra identificar o motivo do backup (ex: pre_deploy_bancos)")
    args = parser.parse_args()

    label = args.label.strip().replace(" ", "_")

    if args.local or args.ambos:
        backup_local(label)
    if args.producao or args.ambos:
        backup_producao(label)

    print("\nConcluido.")


if __name__ == "__main__":
    main()
