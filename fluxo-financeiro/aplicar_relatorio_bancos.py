# -*- coding: utf-8 -*-
"""
Aplica um relatorio da tela "Conferencia de Bancos" (item B1 da Fase 1):
corrige o BANCO e/ou o VALOR das SAIDAS que a cliente marcou como errados.

Cada alteracao tem mov_id (+ parcela_id + despesa_id) e pode carregar:
  - troca de banco : banco_de -> banco_para
  - troca de valor : valor_de -> valor_para
(campos mudou_banco / mudou_valor; se ausentes, infere pelo *_para nao-nulo)

Aplica:
  banco -> UPDATE fin_movimentacoes.banco_id + UPDATE despesa_parcelas.banco_id (mesmo par)
  valor -> UPDATE fin_movimentacoes.valor + UPDATE despesa_parcelas.valor
           + recalcula despesas.valor_total = SUM(parcelas daquela despesa)

Antes de aplicar, confere o estado atual e classifica cada campo:
  OK       -> valor/banco atual == *_de do relatorio  (aplica)
  JA_FEITO -> ja esta no destino                       (pula)
  DIVERGE  -> atual e' outra coisa                      (NAO aplica, reporta)
  SUMIU    -> id nao existe                             (NAO aplica, reporta)

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/aplicar_relatorio_bancos.py RELATORIO.json
        (dry-run)
    ... RELATORIO.json --aplicar          (aplica de verdade no --ambiente)
    ... RELATORIO.json --sql-only         (so gera .sql)
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
TOL = 0.005  # tolerancia de comparacao de valor


# ---------------------------------------------------------------- leitura de estado
def _parse_tsv(out, ncols):
    linhas = []
    for ln in out.splitlines():
        p = ln.split("\t")
        if len(p) == ncols:
            linhas.append([None if x == "NULL" else x for x in p])
    return linhas


def carregar_estado(ambiente):
    """Devolve (mov, parc) onde:
       mov[id]  = {'banco_id': int|None, 'valor': float}
       parc[id] = {'banco_id': int|None, 'valor': float, 'despesa_id': int}"""
    q_mov = "SELECT id, banco_id, valor, DATE_FORMAT(data,'%Y-%m-%d') FROM fin_movimentacoes"
    q_parc = ("SELECT p.id, p.banco_id, p.valor, p.despesa_id, "
              "DATE_FORMAT(p.data_pagamento,'%Y-%m-%d'), d.tipo_pagamento, p.status, p.movimentacao_id "
              "FROM despesa_parcelas p JOIN despesas d ON d.id = p.despesa_id")

    if ambiente == "local":
        conn = pymysql.connect(**LOCAL_DB)
        cur = conn.cursor()
        cur.execute("SET NAMES utf8mb4")
        cur.execute(q_mov)
        mov = {r[0]: {"banco_id": r[1], "valor": float(r[2]), "data": r[3]} for r in cur.fetchall()}
        cur.execute(q_parc)
        parc = {r[0]: {"banco_id": r[1], "valor": float(r[2]), "despesa_id": r[3],
                       "data_pagamento": r[4], "tipo_pg": r[5], "status": r[6],
                       "movimentacao_id": r[7]} for r in cur.fetchall()}
        conn.close()
        return mov, parc

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)

    def run(sql):
        cmd = ("docker exec -i cmport_db sh -c "
               "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
        i, o, e = ssh.exec_command(cmd, timeout=60)
        i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql + ";")
        i.channel.shutdown_write()
        return o.read().decode("utf-8", "replace")

    mov = {int(r[0]): {"banco_id": None if r[1] is None else int(r[1]), "valor": float(r[2]),
                       "data": None if r[3] in (None, "NULL") else r[3]}
           for r in _parse_tsv(run(q_mov), 4)}
    parc = {int(r[0]): {"banco_id": None if r[1] is None else int(r[1]), "valor": float(r[2]),
                        "despesa_id": None if r[3] is None else int(r[3]),
                        "data_pagamento": None if r[4] in (None, "NULL") else r[4],
                        "tipo_pg": r[5], "status": r[6],
                        "movimentacao_id": None if r[7] in (None, "NULL") else int(r[7])}
            for r in _parse_tsv(run(q_parc), 8)}
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


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("relatorio")
    ap.add_argument("--ambiente", choices=["local", "producao"], default="local")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--aplicar", action="store_true")
    g.add_argument("--sql-only", action="store_true")
    args = ap.parse_args()

    rel = json.load(open(args.relatorio, encoding="utf-8"))
    alts = rel["alteracoes"]
    modo = "APLICAR" if args.aplicar else ("SQL-ONLY" if args.sql_only else "dry-run")
    print(f"Relatorio: {os.path.basename(args.relatorio)}  "
          f"(gerado_em={rel.get('gerado_em')}  alteracoes={len(alts)})")
    print(f"Ambiente: {args.ambiente}  |  modo: {modo}\n")

    mov_e, parc_e = carregar_estado(args.ambiente)

    updates = []          # (tabela, coluna, valor_novo, id)   tabela in {"mov","parc"}
    despesas_recalc = set()
    problemas = []        # (a, texto)
    ja_feito = 0

    for a in alts:
        mid, pid = a["mov_id"], a.get("parcela_id")
        if mid not in mov_e:
            problemas.append((a, "mov nao existe (SUMIU)"))
            continue

        quer_banco = a.get("mudou_banco", a.get("banco_para") is not None)
        quer_valor = a.get("mudou_valor", a.get("valor_para") is not None)
        quer_data = a.get("mudou_data", a.get("data_para") is not None)

        # ---- BANCO
        if quer_banco:
            de, para = a.get("banco_de"), a.get("banco_para")
            atual = mov_e[mid]["banco_id"]
            if atual == para:
                ja_feito += 1
            elif atual == de or (de is None and atual is None):
                updates.append(("mov", "banco_id", para, mid))
                if pid and pid in parc_e:
                    updates.append(("parc", "banco_id", para, pid))
                a["_banco"] = f"{a.get('banco_de_nome') or 'vazio'} -> {a.get('banco_para_nome')}"
            else:
                problemas.append((a, f"banco DIVERGE: relatorio {de}->{para}, atual {atual}"))

        # ---- VALOR (com convencao: valor_para == 0 => "ainda nao foi pago")
        if quer_valor:
            de, para = float(a["valor_de"]), float(a["valor_para"])
            atual = mov_e[mid]["valor"]
            pe = parc_e.get(pid) if pid else None

            if para < 0.01:
                # nao e' valor zero — e' "nao foi pago": reverte parcela pra PENDENTE
                # e faz soft-delete da movimentacao. NAO mexe no valor.
                if not pe:
                    problemas.append((a, "valor 0 (=nao pago) mas sem parcela vinculada"))
                elif pe.get("status") and pe["status"] != "PAGO":
                    ja_feito += 1
                elif abs(pe["valor"] - de) > TOL and abs(atual - de) > TOL:
                    problemas.append((a, f"nao-pago: valor atual {pe['valor']:.2f} nao bate com de={de:.2f}"))
                else:
                    updates.append(("parc", "__unpay__", None, pid))
                    updates.append(("mov", "__softdel__", None, mid))
                    a["_naopago"] = f"R$ {de:.2f} -> PENDENTE (soft-delete mov)"
                continue

            if abs(atual - para) < TOL:
                ja_feito += 1
            elif abs(atual - de) < TOL:
                updates.append(("mov", "valor", para, mid))
                if pid and pid in parc_e:
                    updates.append(("parc", "valor", para, pid))
                    did, tp = parc_e[pid].get("despesa_id"), parc_e[pid].get("tipo_pg")
                    if did and tp == "UNICO":
                        despesas_recalc.add(("set", did, para))       # valor_total = valor novo
                    elif did and tp == "PARCELADO":
                        despesas_recalc.add(("sum", did, None))       # valor_total = SUM(parcelas)
                    # RECORRENTE: nao mexe em valor_total (la e' so sugestao)
                a["_valor"] = f"R$ {de:.2f} -> R$ {para:.2f}"
            else:
                problemas.append((a, f"valor DIVERGE: relatorio {de:.2f}->{para:.2f}, atual {atual:.2f}"))

        # ---- DATA (mov.data + parcela.data_pagamento)
        if quer_data:
            de, para = a.get("data_de"), a["data_para"]
            atual = mov_e[mid]["data"]
            if atual == para:
                ja_feito += 1
            elif atual == de:
                updates.append(("mov", "data", para, mid))
                if pid and pid in parc_e:
                    updates.append(("parc", "data_pagamento", para, pid))
                a["_data"] = f"{de} -> {para}"
            else:
                problemas.append((a, f"data DIVERGE: relatorio {de}->{para}, atual {atual}"))

    # ---- relatorio de problemas
    if problemas:
        print(f"⚠️  {len(problemas)} NAO serao aplicados:")
        for a, txt in problemas:
            print(f"    mov {a['mov_id']:>5} parc {str(a.get('parcela_id')):>5}  {a.get('data')}  "
                  f"{(a.get('descricao') or '')[:38]:38}  {txt}")
        print()
    if ja_feito:
        print(f"ℹ️  {ja_feito} campo(s) ja no destino — pulando.\n")

    # ---- montar SQL
    TABELA = {"mov": "fin_movimentacoes", "parc": "despesa_parcelas"}
    linhas = ["SET NAMES utf8mb4;", "USE cmport_gerenciamento;", ""]
    cont = {"banco_id": 0, "valor": 0, "data": 0, "data_pagamento": 0, "__unpay__": 0, "__softdel__": 0}
    for tab, col, val, rid in updates:
        if col == "__unpay__":
            linhas.append(f"UPDATE despesa_parcelas SET status='PENDENTE', data_pagamento=NULL, "
                          f"banco_id=NULL, forma_pagamento=NULL, movimentacao_id=NULL WHERE id = {rid};")
        elif col == "__softdel__":
            linhas.append(f"UPDATE fin_movimentacoes SET deletado_em = NOW() "
                          f"WHERE id = {rid} AND deletado_em IS NULL;")
        else:
            if val is None:
                v = "NULL"
            elif col == "banco_id":
                v = str(int(val))
            elif col == "valor":
                v = f"{float(val):.2f}"
            else:  # data / data_pagamento
                v = "'" + str(val) + "'"
            linhas.append(f"UPDATE {TABELA[tab]} SET {col} = {v} WHERE id = {rid};")
        cont[col] += 1
    for kind, did, val in sorted(despesas_recalc, key=lambda x: x[1]):
        if kind == "set":
            linhas.append(f"UPDATE despesas SET valor_total = {float(val):.2f} WHERE id = {did};")
        else:
            linhas.append(f"UPDATE despesas SET valor_total = "
                          f"(SELECT COALESCE(SUM(valor),0) FROM despesa_parcelas WHERE despesa_id = {did}) "
                          f"WHERE id = {did};")

    print("✅ A APLICAR:")
    print(f"    banco    : {cont['banco_id']} updates")
    print(f"    valor    : {cont['valor']} updates + {len(despesas_recalc)} despesas.valor_total")
    print(f"    data     : {cont['data'] + cont['data_pagamento']} updates")
    print(f"    nao-pago : {cont['__unpay__']} parcelas -> PENDENTE + {cont['__softdel__']} mov soft-delete\n")
    for a in alts:
        if any(a.get(k) for k in ("_banco", "_valor", "_data", "_naopago")):
            det = " | ".join(x for x in (a.get("_data"), a.get("_banco"), a.get("_valor"), a.get("_naopago")) if x)
            print(f"  mov {a['mov_id']:>5} parc {str(a.get('parcela_id')):>5}  {a.get('data')}  "
                  f"{(a.get('descricao') or '')[:38]:38}  {det}")

    print()
    if not updates:
        print("(nada a aplicar.)")
    elif args.aplicar:
        if args.ambiente == "local":
            conn = pymysql.connect(**LOCAL_DB)
            cur = conn.cursor()
            cur.execute("SET NAMES utf8mb4")
            for ln in linhas:
                if ln.startswith("UPDATE"):
                    cur.execute(ln)
            conn.commit()
            conn.close()
        else:
            aplicar_producao("\n".join(linhas) + "\n")
        print(f"✅ Aplicado em {args.ambiente}.")
    elif args.sql_only:
        nome = f"aplicar_relatorio_{args.ambiente}_{datetime.now():%Y%m%d_%H%M}.sql"
        with open(os.path.join(DEST_DIR, nome), "w", encoding="utf-8") as fh:
            fh.write("\n".join(linhas) + "\n")
        print(f"📄 SQL: fluxo-financeiro/{nome}")
    else:
        print("(dry-run — nada alterado.)")

    print(f"\nResumo: updates={len(updates)}  ja_feito={ja_feito}  problemas={len(problemas)}")


if __name__ == "__main__":
    main()
