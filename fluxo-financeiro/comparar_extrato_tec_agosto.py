# -*- coding: utf-8 -*-
"""
Compara o extrato bancario (CSV) da conta Inter TEC de Agosto/2026 com as
ENTRADAS TEC registradas na producao (boletos pagos + recibos ENTRADA +
fin_movimentacoes ENTRADA que cairam na conta 4/Inter TEC).

Objetivo: achar o que esta SOBRANDO (registrado no sistema mas nao caiu na
conta) e o que esta FALTANDO (caiu na conta mas nao tem registro).

CSV: data;tipo;descricao;valor;saldo   (`;` separador, valor pt-BR)
Uso: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/comparar_extrato_tec_agosto.py
"""
import io
import re
import sys
import unicodedata
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import paramiko

CSV_PATH = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\docs-e-planilhas\Planilha.csv"
TEC = "65756913000188"
TOL = 0.02  # centavos de arredondamento


def val(s):
    return round(float(s.strip().replace(".", "").replace(",", ".")), 2)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def ler_csv():
    itens = []
    with open(CSV_PATH, encoding="utf-8") as f:
        for ln in f:
            ln = ln.rstrip("\n")
            if not ln:
                continue
            p = ln.split(";")
            if len(p) < 4:
                continue
            d, m, y = p[0].split("/")
            itens.append({
                "data": date(int(y), int(m), int(d)),
                "tipo": p[0] and p[1].strip(),
                "desc": p[2].strip(),
                "valor": val(p[3]),
            })
    return itens


def q(ssh, sql):
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
    i, o, e = ssh.exec_command(cmd, timeout=60)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
    i.channel.shutdown_write()
    out = o.read().decode("utf-8", "replace")
    linhas = []
    for ln in out.splitlines():
        c = ln.split("\t")
        if len(c) >= 2:
            linhas.append(c)
    return linhas


def carregar_sistema():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("168.231.96.184", username="root", timeout=15)
    n = f'REPLACE(REPLACE(REPLACE(nf.cnpj_emitente,".",""),"/",""),"-","")="{TEC}"'
    nr = n.replace("nf.", "r.")

    # entradas TEC = nota emitida pela TEC OU dinheiro recebido na conta TEC
    # (banco_id 4/5) mesmo quando a nota e' de outro CNPJ (caso cross-empresa,
    # ex: nota CMPORT paga por engano/PIX direto na conta TEC).
    # PARCIAL: conta o que ja entrou (valor_total_recebido), nao o nominal cheio —
    # mesma regra do fluxo_mensal. Senao infla o lado do sistema.
    boletos = [
        {"origem": "boleto", "id": int(r[0]),
         "data": date(*map(int, r[1].split("-"))),
         "valor": round(float(r[6] if r[3] == "PARCIAL" and r[6] not in (None, "", "NULL") else r[2]), 2),
         "nome": r[4], "extra": f'NF {r[5]} ({r[3]})'}
        for r in q(ssh, f"""
            SELECT b.id, b.data_pagamento, b.valor_nominal, b.situacao,
                   COALESCE(c.nome,''), nf.numero_nota, b.valor_total_recebido
            FROM boletos b JOIN notas_fiscais nf ON nf.id=b.nota_fiscal_id
            LEFT JOIN condominios c ON c.id=nf.condominio_id
            WHERE ({n} OR b.banco_id IN (4,5)) AND b.situacao IN ('PAGO','BAIXADO','PARCIAL')
              AND YEAR(b.data_pagamento)=2026 AND MONTH(b.data_pagamento)=8;""")
    ]
    recibos = [
        {"origem": "recibo", "id": int(r[0]),
         "data": date(*map(int, r[1].split("-"))), "valor": round(float(r[2]), 2),
         "nome": r[3], "extra": r[4]}
        for r in q(ssh, f"""
            SELECT r.id, r.data_pagamento, r.valor,
                   COALESCE(c.nome, r.cliente_nome_avulso, ''), r.numero_recibo
            FROM recibos r LEFT JOIN condominios c ON c.id=r.condominio_id
            WHERE {nr} AND r.tipo='ENTRADA' AND r.status='PAGO' AND r.deletado_em IS NULL
              AND YEAR(r.data_pagamento)=2026 AND MONTH(r.data_pagamento)=8;""")
    ]
    movs = [
        {"origem": "movimentacao", "id": int(r[0]),
         "data": date(*map(int, r[1].split("-"))), "valor": round(float(r[2]), 2),
         "nome": r[3], "extra": "banco 4 (Inter TEC)"}
        for r in q(ssh, """
            SELECT m.id, m.data, m.valor, LEFT(m.descricao,50)
            FROM fin_movimentacoes m
            WHERE m.tipo='ENTRADA' AND m.deletado_em IS NULL AND m.banco_id=4
              AND YEAR(m.data)=2026 AND MONTH(m.data)=8;""")
    ]
    ssh.close()
    return boletos + recibos + movs


def casa(csv_item, sis_item, dias=6):
    if abs(csv_item["valor"] - sis_item["valor"]) > TOL:
        return False
    return abs((csv_item["data"] - sis_item["data"]).days) <= dias


def main():
    csv = ler_csv()
    sis = carregar_sistema()

    tot_csv = round(sum(c["valor"] for c in csv), 2)
    tot_sis = round(sum(s["valor"] for s in sis), 2)
    print(f"EXTRATO (CSV) : {len(csv):3} lançamentos  R$ {tot_csv:>12,.2f}")
    print(f"SISTEMA (TEC) : {len(sis):3} lançamentos  R$ {tot_sis:>12,.2f}")
    print(f"DIFERENÇA     :      {'':16} R$ {tot_csv - tot_sis:>12,.2f}\n")

    sis_livre = list(sis)
    csv_sem_par = []
    for c in csv:
        cand = [s for s in sis_livre if casa(c, s)]
        # desempata pelo nome mais parecido
        cand.sort(key=lambda s: 0 if norm(s["nome"])[:6] and norm(s["nome"])[:6] in norm(c["desc"]) else 1)
        if cand:
            sis_livre.remove(cand[0])
        else:
            csv_sem_par.append(c)

    print("=" * 78)
    print(f"❌ NO EXTRATO MAS SEM REGISTRO NO SISTEMA — {len(csv_sem_par)} · "
          f"R$ {sum(c['valor'] for c in csv_sem_par):,.2f}  (dinheiro que caiu e não foi lançado)")
    print("=" * 78)
    for c in sorted(csv_sem_par, key=lambda x: x["data"]):
        print(f"  {c['data']:%d/%m}  R$ {c['valor']:>9,.2f}  {c['tipo']:28} {c['desc'][:38]}")

    print()
    print("=" * 78)
    print(f"⚠️  NO SISTEMA MAS SEM CORRESPONDÊNCIA NO EXTRATO — {len(sis_livre)} · "
          f"R$ {sum(s['valor'] for s in sis_livre):,.2f}  (lançado mas não caiu nessa conta/mês)")
    print("=" * 78)
    for s in sorted(sis_livre, key=lambda x: x["data"]):
        print(f"  {s['data']:%d/%m}  R$ {s['valor']:>9,.2f}  {s['origem']:12} id={s['id']:<6} "
              f"{s['nome'][:32]:32} {s['extra']}")


if __name__ == "__main__":
    main()
