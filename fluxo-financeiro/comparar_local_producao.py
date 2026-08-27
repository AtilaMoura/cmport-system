# -*- coding: utf-8 -*-
"""
Compara a contagem de registros (COUNT(*)) de todas as tabelas do schema
cmport_gerenciamento entre o banco local e producao, sem precisar de
dump/restore manual (Passo 1 do PROCESSO_RECONCILIACAO_MENSAL.md).

Nao mede conteudo (valores, checksum) -- so quantidade de linhas por tabela.
Serve pra pegar dessincronia grosseira (local desatualizado, insercao feita
so num lado, etc) antes de confiar em qualquer outra validacao que compare
contra o local. Se a contagem bater mas houver suspeita de valor divergente,
usar verificar_fechamento_mes.py ou validar_mes_detalhado.py.

Tabelas que existem só num dos dois lados (ex: tabela nova criada local que
ainda nao foi deployada) sao reportadas à parte e excluidas da contagem --
nao travam o script.

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/comparar_local_producao.py
"""
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import pymysql
import paramiko

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")

PROD_HOST = "168.231.96.184"
SCHEMA = "cmport_gerenciamento"


def listar_tabelas_local():
    conn = pymysql.connect(**LOCAL_DB)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema=%s AND table_type='BASE TABLE' ORDER BY table_name",
            (SCHEMA,),
        )
        tabelas = [r[0] for r in cur.fetchall()]
    conn.close()
    return tabelas


def montar_query_contagem(tabelas):
    # Sem aspas (simples, duplas OU crase) na query: o comando SSH ja usa aspas
    # simples pro "sh -c" e aspas duplas pro "-e" do mysql, entao qualquer aspa
    # dentro da query quebra o parsing -- inclusive crase, que o `sh -c` do
    # container interpreta como substituicao de comando mesmo dentro de aspas
    # duplas (so aspas simples bloqueiam isso, e essas ja estao ocupadas pelo
    # nivel externo). Nomes de tabela do information_schema sao identificadores
    # simples (snake_case), nao precisam de crase. Contagem e' posicional
    # (mesma ordem de `tabelas` nos dois lados), sem precisar do nome como string.
    partes = [f"SELECT COUNT(*) FROM {t}" for t in tabelas]
    return " UNION ALL ".join(partes)


def contar_local(query):
    conn = pymysql.connect(**LOCAL_DB)
    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()
    conn.close()
    return [int(r[0]) for r in rows]


def listar_tabelas_producao():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)
    cmd = (
        "docker exec cmport_db sh -c "
        "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" -N -e \"USE $MYSQL_DATABASE; SHOW TABLES;\"'"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    ssh.close()
    if not out:
        raise RuntimeError("Sem retorno de producao ao listar tabelas.")
    return set(out.splitlines())


def contar_producao(query):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)
    query_sql = query.replace("\n", " ")
    cmd = (
        "docker exec cmport_db sh -c "
        "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" -N -e \"USE $MYSQL_DATABASE; "
        + query_sql + "\"'"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace")
    ssh.close()
    if not out:
        raise RuntimeError(f"Sem retorno de producao. stderr: {err}")
    return [int(linha) for linha in out.splitlines()]


def main():
    print("Listando tabelas do schema local...")
    tabelas_local = set(listar_tabelas_local())
    print("Listando tabelas do schema producao (via SSH)...")
    tabelas_prod = listar_tabelas_producao()

    so_local = sorted(tabelas_local - tabelas_prod)
    so_prod = sorted(tabelas_prod - tabelas_local)
    if so_local:
        print(f"\n⚠️  Tabela(s) só no LOCAL (ainda não existem em produção, fora da contagem): {', '.join(so_local)}")
    if so_prod:
        print(f"\n⚠️  Tabela(s) só em PRODUÇÃO (fora da contagem): {', '.join(so_prod)}")

    tabelas = sorted(tabelas_local & tabelas_prod)
    query = montar_query_contagem(tabelas)

    print(f"\nContando {len(tabelas)} tabelas em comum (local)...")
    local_vals = contar_local(query)
    local = dict(zip(tabelas, local_vals))

    print("Contando tabelas em comum (producao, via SSH)...")
    producao_vals = contar_producao(query)
    producao = dict(zip(tabelas, producao_vals))

    print(f"\n{'Tabela':35}{'Local':>10}{'Producao':>12}{'Diferenca':>12}")
    print("-" * 69)
    divergentes = []
    for tbl in tabelas:
        l = local.get(tbl, 0)
        p = producao.get(tbl, 0)
        diff = l - p
        marca = "" if diff == 0 else "  <<<"
        print(f"{tbl:35}{l:>10}{p:>12}{diff:>12}{marca}")
        if diff != 0:
            divergentes.append((tbl, l, p, diff))

    print("-" * 69)
    if not divergentes:
        print("\n✅ Local e producao com a mesma contagem em todas as tabelas.")
    else:
        print(f"\n🔶 {len(divergentes)} tabela(s) divergente(s):")
        for tbl, l, p, diff in divergentes:
            print(f"  {tbl}: local={l} producao={p} (diff={diff:+d})")


if __name__ == "__main__":
    main()
