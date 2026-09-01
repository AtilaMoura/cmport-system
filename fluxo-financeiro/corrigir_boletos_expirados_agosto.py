# -*- coding: utf-8 -*-
"""
Corrige os 7 boletos EXPIRADO investigados (ver verificar_expirados_vs_planilha.py):

  1) boleto 165 (NF 7717, Bambino) -- pagamento real, so' faltava registrar.
     Cliente pagou por PIX/transferencia direto na conta (nao pelo boleto),
     por isso ficou "solto" expirado. Marca PAGO, cria o registro em
     boleto_pagamentos (mesmo efeito de POST /boletos/165/registrar-pagamento,
     so' que direto no banco -- pedido explicito do Atila, sem passar pela API).

  2) boletos 92, 108, 117, 515, 575 -- duplicata de BOLETO: o pagamento ja'
     esta' registrado num boleto irmao da mesma nota (confirmado pela planilha
     mestre). So' cancela o registro solto, nao mexe em mais nada.

  3) boletos 1535 e 184 (NF 61-2, Bem Viver General Jardim) -- duplicata de
     PAGAMENTO: a planilha confirma só R$1.150,00 recebido (18/03), mas o
     sistema tem R$1.725,00 contados (boleto 1510 R$1.150 + 1535 R$575).
     Cancela 1535 (o R$575 a mais) e 184 (parcela que nunca foi paga de
     verdade, so' ficou expirada). Fica so' o 1510 = R$1.150 = bate com a planilha.

NUNCA deleta linha -- so' muda situacao/campos (soft, igual o resto do sistema
ja' faz com boletos CANCELADO). Idempotente: roda de novo e nao duplica.

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/corrigir_boletos_expirados_agosto.py
        (dry-run)
    ... --aplicar --ambiente local|producao
"""
import argparse
import io
import sys
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import pymysql
import paramiko

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")
PROD_HOST = "168.231.96.184"

OBS_7717 = ("Pagamento recebido via PIX/transferência direto na conta Inter TEC em "
            "27/08/2026 (não pelo boleto, por isso ficou expirado). Nota emitida no "
            "CNPJ CMPORT, mas o valor caiu na conta TEC -- registrado no banco onde "
            "realmente entrou. Conferido contra extrato bancário 27/08/2026.")

CANCELAR_DUPLICATA_BOLETO = {
    # id: (boleto_pago_irmao, valor_confirmado_planilha, data_planilha)
    92:  (895, "337,40 (28/04) + 176,62 (29/04)"),
    108: (912, "553,99 (29/04)"),
    117: (198, "236,18 (29/04) -- linha 1109 da planilha"),
    515: (543, "600,00 (29/06)"),
    575: (1438, "349,50 (15/07)"),
}

CANCELAR_BEM_VIVER = {
    1535: "Pagamento duplicado -- planilha confirma só R$1.150,00 recebido (18/03), já coberto pelo boleto 1510. Este R$575,00 estava sendo contado a mais no fluxo.",
    184: "Parcela nunca foi paga de verdade -- o valor cheio da nota (R$1.150) foi pago junto no boleto 1510. Ficou expirada sem uso.",
}


def montar_sql():
    sql = []

    # 1) registra pagamento real do 165
    sql.append(f"""UPDATE boletos SET situacao='PAGO', data_pagamento='2026-08-27',
        banco_id=4, forma_pagamento='PIX', observacao='{OBS_7717}'
        WHERE id=165;""")
    sql.append("""INSERT INTO boleto_pagamentos (boleto_id, valor, data_pagamento, forma_pagamento, banco_id, observacao)
        SELECT 165, 269.92, '2026-08-27', 'PIX', 4, 'Registrado retroativamente -- ver observacao do boleto.'
        WHERE NOT EXISTS (SELECT 1 FROM boleto_pagamentos WHERE boleto_id=165);""")

    # 2) cancela duplicatas de boleto
    for bid, (irmao, ref) in CANCELAR_DUPLICATA_BOLETO.items():
        obs = f"Duplicata -- pagamento já registrado no boleto {irmao} (R$ {ref}), confirmado pela planilha mestre. Cancelado 01/09/2026."
        sql.append(f"UPDATE boletos SET situacao='CANCELADO', observacao='{obs}' WHERE id={bid} AND situacao<>'CANCELADO';")

    # 3) Bem Viver -- duplicata de pagamento
    for bid, obs in CANCELAR_BEM_VIVER.items():
        sql.append(f"UPDATE boletos SET situacao='CANCELADO', observacao='{obs}' WHERE id={bid} AND situacao<>'CANCELADO';")

    return sql


def estado_atual(conectar):
    ids = [165, 92, 108, 117, 515, 575, 1535, 184]
    sql = f"SELECT id, situacao, data_pagamento, banco_id FROM boletos WHERE id IN ({','.join(map(str, ids))}) ORDER BY id;"
    return conectar(sql)


def rodar_local(sql_list, aplicar):
    conn = pymysql.connect(**LOCAL_DB)
    cur = conn.cursor()
    cur.execute("SET NAMES utf8mb4")

    def conectar(sql):
        cur.execute(sql)
        return cur.fetchall()

    print("--- estado ANTES (local) ---")
    for r in estado_atual(conectar):
        print(" ", r)

    if aplicar:
        for s in sql_list:
            cur.execute(s)
        conn.commit()
        print("\n✅ aplicado em local.")

        print("--- estado DEPOIS (local) ---")
        for r in estado_atual(conectar):
            print(" ", r)
    conn.close()


def rodar_producao(sql_list, aplicar):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)

    def run(sql, ler=True):
        flag = "-N --batch" if ler else ""
        cmd = (f"docker exec -i cmport_db sh -c "
               f"'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 {flag}'")
        i, o, e = ssh.exec_command(cmd, timeout=120)
        i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
        i.channel.shutdown_write()
        out = o.read().decode("utf-8", "replace")
        err = "\n".join(l for l in e.read().decode("utf-8", "replace").splitlines() if "Using a password" not in l)
        if o.channel.recv_exit_status() != 0:
            raise RuntimeError(err)
        return [ln.split("\t") for ln in out.splitlines()]

    print("--- estado ANTES (produção) ---")
    for r in estado_atual(lambda s: run(s + ";", ler=True)):
        print(" ", r)

    if aplicar:
        run("\n".join(sql_list) + "\n", ler=False)
        print("\n✅ aplicado em produção.")
        print("--- estado DEPOIS (produção) ---")
        for r in estado_atual(lambda s: run(s + ";", ler=True)):
            print(" ", r)
    ssh.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true")
    ap.add_argument("--ambiente", choices=["local", "producao"], default="local")
    args = ap.parse_args()

    sql_list = montar_sql()
    print(f"Ambiente: {args.ambiente} | modo: {'APLICAR' if args.aplicar else 'dry-run'}\n")
    print(f"{len(sql_list)} comandos SQL:\n")
    for s in sql_list:
        print(" ", " ".join(s.split()))
    print()

    if args.ambiente == "local":
        rodar_local(sql_list, args.aplicar)
    else:
        rodar_producao(sql_list, args.aplicar)

    if not args.aplicar:
        print("\n(dry-run -- nada alterado. Rode com --aplicar.)")


if __name__ == "__main__":
    main()
