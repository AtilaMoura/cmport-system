# -*- coding: utf-8 -*-
"""
Aplica um relatorio da tela "Conferencia de Bancos" (item B1 da Fase 1):
troca o banco_id das SAIDAS que a cliente marcou como erradas.

Cada alteracao do relatorio tem mov_id (+ parcela_id + despesa_id). Aplica:
    UPDATE fin_movimentacoes SET banco_id = <para> WHERE id = <mov_id>;
    UPDATE despesa_parcelas   SET banco_id = <para> WHERE id = <parcela_id>;   (se houver parcela)

Antes de aplicar, confere o estado atual de cada linha e classifica:
    OK       -> banco_id atual == banco_de do relatorio  (pode aplicar)
    JA_FEITO -> banco_id atual == banco_para              (nada a fazer)
    DIVERGE  -> banco_id atual e' outra coisa             (NAO aplica, reporta)
    SUMIU    -> id nao existe mais                        (NAO aplica, reporta)

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/aplicar_relatorio_bancos.py RELATORIO.json
        (dry-run)
    ... aplicar_relatorio_bancos.py RELATORIO.json --aplicar
    ... aplicar_relatorio_bancos.py RELATORIO.json --sql-only
    ... --ambiente producao   (default: local)
"""
import argparse
import io
import json
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


def carregar_estado_local():
    conn = pymysql.connect(**LOCAL_DB)
    cur = conn.cursor()
    cur.execute("SET NAMES utf8mb4")
    cur.execute("SELECT id, banco_id FROM fin_movimentacoes")
    mov = dict(cur.fetchall())
    cur.execute("SELECT id, banco_id FROM despesa_parcelas")
    parc = dict(cur.fetchall())
    conn.close()
    return mov, parc


def carregar_estado_producao():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)

    def q(sql):
        cmd = ("docker exec -i cmport_db sh -c "
               "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
        i, o, e = ssh.exec_command(cmd, timeout=60)
        i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
        i.channel.shutdown_write()
        out = o.read().decode("utf-8", "replace")
        d = {}
        for ln in out.splitlines():
            p = ln.split("\t")
            if len(p) == 2:
                d[int(p[0])] = None if p[1] == "NULL" else int(p[1])
        return d

    mov = q("SELECT id, banco_id FROM fin_movimentacoes;")
    parc = q("SELECT id, banco_id FROM despesa_parcelas;")
    ssh.close()
    return mov, parc


def aplicar_producao(sql_text):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4'")
    i, o, e = ssh.exec_command(cmd, timeout=180)
    i.write(sql_text)
    i.channel.shutdown_write()
    err = "\n".join(l for l in e.read().decode("utf-8", "replace").splitlines()
                    if "Using a password" not in l)
    rc = o.channel.recv_exit_status()
    ssh.close()
    if rc != 0:
        raise RuntimeError(f"mysql rc={rc}: {err}")
    return err


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("relatorio", help="caminho do JSON gerado pela tela")
    ap.add_argument("--ambiente", choices=["local", "producao"], default="local")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--aplicar", action="store_true")
    g.add_argument("--sql-only", action="store_true")
    args = ap.parse_args()

    rel = json.load(open(args.relatorio, encoding="utf-8"))
    alts = rel["alteracoes"]
    print(f"Relatorio: {os.path.basename(args.relatorio)}")
    print(f"  gerado_em={rel.get('gerado_em')}  linhas_conferidas={rel.get('linhas_conferidas')}"
          f"  alteracoes={len(alts)}")
    print(f"Ambiente: {args.ambiente}  |  modo: "
          f"{'APLICAR' if args.aplicar else ('SQL-ONLY' if args.sql_only else 'dry-run')}\n")

    mov_estado, parc_estado = (carregar_estado_local() if args.ambiente == "local"
                               else carregar_estado_producao())

    buckets = {"OK": [], "JA_FEITO": [], "DIVERGE": [], "SUMIU": []}
    for a in alts:
        mid, pid = a["mov_id"], a.get("parcela_id")
        de, para = a["banco_de"], a["banco_para"]
        if mid not in mov_estado:
            buckets["SUMIU"].append((a, "mov nao existe"))
            continue
        atual = mov_estado[mid]
        if atual == para:
            buckets["JA_FEITO"].append((a, atual))
        elif atual == de or (de is None and atual is None):
            buckets["OK"].append((a, atual))
        else:
            buckets["DIVERGE"].append((a, atual))

    for nome in ("DIVERGE", "SUMIU"):
        if buckets[nome]:
            print(f"⚠️  {nome} ({len(buckets[nome])}) — NAO serao aplicados:")
            for a, info in buckets[nome]:
                print(f"    mov {a['mov_id']} / parc {a.get('parcela_id')}  {a['data']}  "
                      f"{a['descricao'][:40]}  R$ {a['valor']}  "
                      f"(relatorio: {a['banco_de']}→{a['banco_para']}, atual no banco: {info})")
            print()

    if buckets["JA_FEITO"]:
        print(f"ℹ️  JA_FEITO ({len(buckets['JA_FEITO'])}) — banco ja esta no destino, pulando.\n")

    aplicaveis = buckets["OK"]
    print(f"✅ A APLICAR: {len(aplicaveis)} alteracoes "
          f"({len(aplicaveis)} UPDATE em fin_movimentacoes + "
          f"{sum(1 for a,_ in aplicaveis if a.get('parcela_id'))} em despesa_parcelas)\n")

    linhas_sql = ["SET NAMES utf8mb4;", "USE cmport_gerenciamento;", ""]
    for a, atual in aplicaveis:
        para = a["banco_para"]
        print(f"  mov {a['mov_id']:>5} parc {str(a.get('parcela_id')):>5}  "
              f"{a['data']}  {a['descricao'][:44]:44}  R$ {a['valor']:>9}  "
              f"{a['banco_de_nome']} → {a['banco_para_nome']}")
        linhas_sql.append(f"UPDATE fin_movimentacoes SET banco_id = {para} WHERE id = {a['mov_id']};")
        if a.get("parcela_id"):
            linhas_sql.append(f"UPDATE despesa_parcelas SET banco_id = {para} WHERE id = {a['parcela_id']};")

    print()
    if args.aplicar and aplicaveis:
        sql_text = "\n".join(linhas_sql) + "\n"
        if args.ambiente == "local":
            conn = pymysql.connect(**LOCAL_DB)
            cur = conn.cursor()
            cur.execute("SET NAMES utf8mb4")
            for a, _ in aplicaveis:
                cur.execute("UPDATE fin_movimentacoes SET banco_id=%s WHERE id=%s",
                            (a["banco_para"], a["mov_id"]))
                if a.get("parcela_id"):
                    cur.execute("UPDATE despesa_parcelas SET banco_id=%s WHERE id=%s",
                                (a["banco_para"], a["parcela_id"]))
            conn.commit()
            conn.close()
        else:
            aplicar_producao(sql_text)
        print(f"✅ Aplicado em {args.ambiente}: {len(aplicaveis)} alteracoes.")
    elif args.sql_only and aplicaveis:
        nome = f"aplicar_bancos_{args.ambiente}_{datetime.now():%Y%m%d_%H%M}.sql"
        with open(os.path.join(DEST_DIR, nome), "w", encoding="utf-8") as fh:
            fh.write("\n".join(linhas_sql) + "\n")
        print(f"📄 SQL: fluxo-financeiro/{nome}")
    else:
        print("(dry-run — nada alterado.)")

    print(f"\nResumo: OK={len(buckets['OK'])} JA_FEITO={len(buckets['JA_FEITO'])} "
          f"DIVERGE={len(buckets['DIVERGE'])} SUMIU={len(buckets['SUMIU'])}")


if __name__ == "__main__":
    main()
