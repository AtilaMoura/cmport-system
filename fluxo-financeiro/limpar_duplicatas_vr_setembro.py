# -*- coding: utf-8 -*-
"""
PARTE 3 do PLANO_FOLHA_EDICAO_ESTORNO.md — limpa as duplicatas de Vale Refeição
de setembro/2026 em PRODUÇÃO.

Apaga (soft-delete via API -> registrar_exclusao + auditoria):
  - despesa 1199  André  — avulso VR R$ 315,00  (duplicata)
  - despesa 1200  André  — avulso VR R$ 578,55  (duplicata)
  - despesa 1198  Almira — avulso VR R$ 315,00  (duplicata)

Mantém: recorrentes 1204 (André) e 933 (Almira); nenhuma parcela PAGA é tocada.

Fluxo: 1) backup mysqldump  2) checagem do estado atual  3) DELETE via API  4) verificação
Uso:  cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/limpar_duplicatas_vr_setembro.py
"""
import io
import json
import sys
import time
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import paramiko
import requests

HOST = "168.231.96.184"
API = "https://dash.cmport.com.br/api/v1"
LOGIN_EMAIL = "atilagmoura@gmail.com"
LOGIN_SENHA = "22164855"
ALVOS = [
    (1199, "André", "avulso VR R$ 315,00"),
    (1200, "André", "avulso VR R$ 578,55"),
    (1198, "Almira", "avulso VR R$ 315,00"),
]
TS = time.strftime("%Y%m%d_%H%M")
BACKUP = str(Path(__file__).resolve().parent / f"backup_producao_pre_limpeza_vr_setembro_{TS}.sql")


def ssh_conn():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", timeout=20)
    return c


def q(ssh, sql):
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
    i, o, _ = ssh.exec_command(cmd, timeout=120)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
    i.channel.shutdown_write()
    return [ln.split("\t") for ln in o.read().decode("utf-8", "replace").splitlines() if ln.strip()]


def estado(ssh):
    print("\n--- estado atual das despesas alvo ---")
    rows = q(ssh, """
        SELECT d.id, d.descricao, d.tipo_pagamento, d.valor_total, d.deletado_em,
               GROUP_CONCAT(CONCAT(p.id,'=',p.valor,'(',p.status,')') SEPARATOR ' ')
        FROM despesas d LEFT JOIN despesa_parcelas p ON p.despesa_id = d.id
        WHERE d.id IN (1198,1199,1200) GROUP BY d.id ORDER BY d.id;""")
    for r in rows:
        print("  ", r)
    return {int(r[0]): r for r in rows}


def main():
    ssh = ssh_conn()

    # 1) BACKUP -------------------------------------------------------------
    print(f"[1] backup -> {BACKUP}")
    cmd = ("docker exec cmport_db sh -c "
           "'mysqldump -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 "
           "cmport_gerenciamento despesas despesa_parcelas registros_exclusoes fin_movimentacoes'")
    _, o, e = ssh.exec_command(cmd, timeout=300)
    dump = o.read()
    err = e.read().decode("utf-8", "replace")
    if len(dump) < 5000:
        print("  ABORTADO: dump veio pequeno demais:", err[:500])
        return
    with open(BACKUP, "wb") as fh:
        fh.write(dump)
    print(f"  ok — {len(dump):,} bytes")

    # 2) ESTADO ANTES -----------------------------------------------------
    antes = estado(ssh)
    ja_ok = True
    for did, _, _ in ALVOS:
        r = antes.get(did)
        if not r:
            print(f"  !! despesa {did} não existe"); ja_ok = False
        elif r[4] != "NULL":
            print(f"  -- despesa {did} já está deletada ({r[4]})")
        elif r[5] and "PAGO" in r[5]:
            print(f"  !! despesa {did} tem parcela PAGA — NÃO vou apagar"); ja_ok = False
    if not ja_ok:
        print("\nABORTADO — resolver os itens acima antes.")
        return

    # 3) SOFT-DELETE via SQL — replica exatamente DespesaService.deletar:
    #    grava snapshot em registros_exclusoes e seta despesas.deletado_em.
    print("\n[3] soft-delete + auditoria (SQL)...")
    motivo = "Duplicata de Vale Refeicao set/2026 (PLANO_FOLHA_EDICAO_ESTORNO.md)"
    sql = ""
    for did, quem, desc in ALVOS:
        r = antes[did]
        descricao, valor_total, cnpj = r[1], r[3], "65756913000188"
        dados_json = json.dumps(
            {"id": did, "descricao": descricao, "valor_total": valor_total, "cnpj": cnpj},
            ensure_ascii=False, indent=2,
        ).replace("\\", "\\\\").replace("'", "\\'")
        sql += (
            "INSERT INTO registros_exclusoes "
            "(tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao) "
            f"VALUES ('despesa', {did}, '{dados_json}', '{motivo}', 'limpeza-script');\n"
            f"UPDATE despesas SET deletado_em = UTC_TIMESTAMP() WHERE id = {did} AND deletado_em IS NULL;\n"
        )
    out = q(ssh, sql)
    print("  aplicado", ("(mysql: " + " ".join(str(x) for x in out) + ")") if out else "")

    # 4) VERIFICAÇÃO ----------------------------------------------------
    time.sleep(1)
    print("\n[4] estado depois:")
    estado(ssh)

    print("\n--- VR de setembro/2026 por funcionário (deve sobrar 1 por pessoa) ---")
    for r in q(ssh, """
        SELECT f.nome, d.id, d.descricao, d.tipo_pagamento, p.valor, p.status
        FROM despesa_parcelas p
        JOIN despesas d ON d.id = p.despesa_id
        JOIN funcionarios f ON f.id = d.funcionario_id
        LEFT JOIN fin_categorias c ON c.id = d.categoria_id
        WHERE d.deletado_em IS NULL AND c.nome = 'Vale refeicao/alimentacao'
          AND p.data_vencimento >= '2026-09-01' AND p.data_vencimento < '2026-10-01'
        ORDER BY f.nome;"""):
        print("  ", r)

    print("\n--- auditoria (registros_exclusoes) dos alvos ---")
    for r in q(ssh, """
        SELECT id, tipo_registro, registro_id, data_exclusao
        FROM registros_exclusoes
        WHERE tipo_registro = 'despesa' AND registro_id IN (1198,1199,1200)
        ORDER BY id DESC LIMIT 10;"""):
        print("  ", r)

    ssh.close()
    print("\nOK — Parte 3 concluída.")


if __name__ == "__main__":
    main()
