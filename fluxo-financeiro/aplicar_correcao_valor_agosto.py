# -*- coding: utf-8 -*-
"""
Aplica o 2o relatorio de Agosto da tela Conferencia de Bancos (B1), que so
tem correcoes de VALOR. Convencao combinada com o Atila:

  valor_para  > 0  -> correcao real do valor da parcela
  valor_para == 0  -> "esse ainda nao foi pago" -> reverter a parcela pra
                      PENDENTE (NAO zerar valor)

GRUPO A (valor_para > 0):
  UPDATE despesa_parcelas.valor  + fin_movimentacoes.valor (a mov ligada)
  despesas.valor_total: UNICO -> = valor novo ; PARCELADO -> SUM(parcelas) ;
                        RECORRENTE -> nao mexe (la e' so sugestao do proximo mes)

GRUPO B (valor_para == 0):
  parcela  : status=PENDENTE, data_pagamento=NULL, banco_id=NULL,
             forma_pagamento=NULL, movimentacao_id=NULL
  mov      : deletado_em = NOW()  (soft delete, nunca DELETE)
  valor da parcela e despesas.valor_total: NAO mexe

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/aplicar_correcao_valor_agosto.py REL.json
        (dry-run)
    ... REL.json --aplicar
    ... --ambiente producao   (default local)
"""
import argparse
import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import pymysql
import paramiko

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")
PROD_HOST = "168.231.96.184"
TOL = 0.005


def conectar(ambiente):
    if ambiente == "local":
        c = pymysql.connect(**LOCAL_DB)
        c.cursor().execute("SET NAMES utf8mb4")
        return c
    return None  # producao usa SSH em run_prod


class Prod:
    def __init__(self):
        self.ssh = paramiko.SSHClient()
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.ssh.connect(PROD_HOST, username="root", timeout=15)

    def run(self, sql, ler):
        flag = "-N --batch" if ler else ""
        cmd = (f"docker exec -i cmport_db sh -c "
               f"'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 {flag}'")
        i, o, e = self.ssh.exec_command(cmd, timeout=120)
        i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
        i.channel.shutdown_write()
        out = o.read().decode("utf-8", "replace")
        err = "\n".join(l for l in e.read().decode("utf-8", "replace").splitlines()
                        if "Using a password" not in l)
        if o.channel.recv_exit_status() != 0:
            raise RuntimeError(err)
        return out

    def close(self):
        self.ssh.close()


def carregar_estado(ambiente, pids):
    ids = ",".join(str(p) for p in pids)
    sql = (f"SELECT p.id, p.status, p.valor, p.movimentacao_id, "
           f"d.id, d.tipo_pagamento, m.id, m.valor, m.deletado_em IS NOT NULL "
           f"FROM despesa_parcelas p JOIN despesas d ON d.id=p.despesa_id "
           f"LEFT JOIN fin_movimentacoes m ON m.id=p.movimentacao_id "
           f"WHERE p.id IN ({ids})")
    est = {}
    if ambiente == "local":
        c = pymysql.connect(**LOCAL_DB)
        cur = c.cursor()
        cur.execute("SET NAMES utf8mb4")
        cur.execute(sql)
        for r in cur.fetchall():
            est[r[0]] = dict(status=r[1], valor=float(r[2]), mov_id=r[3], despesa_id=r[4],
                             tipo_pg=r[5], mov_valor=None if r[7] is None else float(r[7]),
                             mov_del=bool(r[8]))
        c.close()
    else:
        p = Prod()
        for ln in p.run(sql + ";", ler=True).splitlines():
            f = ln.split("\t")
            if len(f) != 9:
                continue
            est[int(f[0])] = dict(status=f[1], valor=float(f[2]),
                                  mov_id=None if f[3] == "NULL" else int(f[3]),
                                  despesa_id=int(f[4]), tipo_pg=f[5],
                                  mov_valor=None if f[7] == "NULL" else float(f[7]),
                                  mov_del=(f[8] == "1"))
        p.close()
    return est


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("relatorio")
    ap.add_argument("--ambiente", choices=["local", "producao"], default="local")
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    rel = json.load(open(args.relatorio, encoding="utf-8"))
    alts = rel["alteracoes"]
    pids = [a["parcela_id"] for a in alts]
    est = carregar_estado(args.ambiente, pids)

    grupo_a, grupo_b, problemas = [], [], []
    for a in alts:
        pid = a["parcela_id"]
        e = est.get(pid)
        if not e:
            problemas.append((a, "parcela nao encontrada"))
            continue
        vpara = float(a["valor_para"])
        vde = float(a["valor_de"])
        if abs(e["valor"] - vde) > TOL and abs(e["valor"] - vpara) > TOL:
            problemas.append((a, f"valor atual {e['valor']:.2f} nao bate com de={vde:.2f}"))
            continue
        if vpara < 0.01:
            if e["status"] != "PAGO":
                problemas.append((a, f"grupo B mas parcela ja esta {e['status']}"))
                continue
            grupo_b.append((a, e))
        else:
            if abs(e["valor"] - vpara) < TOL:
                problemas.append((a, "grupo A ja aplicado (valor ja e o novo)"))
                continue
            grupo_a.append((a, e))

    # ---- relatorio
    print("=== GRUPO A — correcao de valor ===")
    for a, e in grupo_a:
        print(f"  parc {a['parcela_id']:>4} mov {e['mov_id']}  {a['descricao'][:26]:26}  "
              f"{e['tipo_pg']:10}  R$ {a['valor_de']:.2f} -> R$ {a['valor_para']:.2f}")
    print(f"\n=== GRUPO B — reverter pra PENDENTE (nao foi pago) ===")
    for a, e in grupo_b:
        print(f"  parc {a['parcela_id']:>4} mov {e['mov_id']}  {a['descricao'][:26]:26}  "
              f"{e['tipo_pg']:10}  R$ {e['valor']:.2f}  (mov soft-delete)")
    if problemas:
        print(f"\n⚠️  {len(problemas)} NAO aplicados:")
        for a, txt in problemas:
            print(f"    parc {a['parcela_id']}  {a['descricao'][:28]}  -> {txt}")

    # ---- SQL
    sql = []
    for a, e in grupo_a:
        v = f"{float(a['valor_para']):.2f}"
        sql.append(f"UPDATE despesa_parcelas SET valor = {v} WHERE id = {a['parcela_id']};")
        if e["mov_id"]:
            sql.append(f"UPDATE fin_movimentacoes SET valor = {v} WHERE id = {e['mov_id']};")
        if e["tipo_pg"] == "UNICO":
            sql.append(f"UPDATE despesas SET valor_total = {v} WHERE id = {e['despesa_id']};")
        elif e["tipo_pg"] == "PARCELADO":
            sql.append(f"UPDATE despesas SET valor_total = "
                       f"(SELECT COALESCE(SUM(valor),0) FROM despesa_parcelas WHERE despesa_id = {e['despesa_id']}) "
                       f"WHERE id = {e['despesa_id']};")
        # RECORRENTE: nao mexe em valor_total
    for a, e in grupo_b:
        sql.append(f"UPDATE despesa_parcelas SET status='PENDENTE', data_pagamento=NULL, "
                   f"banco_id=NULL, forma_pagamento=NULL, movimentacao_id=NULL "
                   f"WHERE id = {a['parcela_id']};")
        if e["mov_id"] and not e["mov_del"]:
            sql.append(f"UPDATE fin_movimentacoes SET deletado_em = NOW() WHERE id = {e['mov_id']};")

    print(f"\n--- {len(sql)} comandos SQL ---")
    for s in sql:
        print("  " + s)

    if not sql:
        print("\n(nada a aplicar.)")
        return
    if not args.aplicar:
        print("\n(dry-run — nada alterado.)")
        return

    if args.ambiente == "local":
        c = pymysql.connect(**LOCAL_DB)
        cur = c.cursor()
        cur.execute("SET NAMES utf8mb4")
        for s in sql:
            cur.execute(s)
        c.commit()
        c.close()
    else:
        p = Prod()
        p.run("\n".join(sql) + "\n", ler=False)
        p.close()
    print(f"\n✅ Aplicado em {args.ambiente}: grupo A={len(grupo_a)}  grupo B={len(grupo_b)}")


if __name__ == "__main__":
    main()
