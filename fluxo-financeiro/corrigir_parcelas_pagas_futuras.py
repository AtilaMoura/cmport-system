# -*- coding: utf-8 -*-
"""
Corrige parcelas de despesa que a migracao historica (migrar_despesa_geral_v2.py,
"Migracao historica (Fase 6 V2)") gravou como PAGO indevidamente.

Contexto (investigado em 08/09/2026):
  O script de migracao marcava `status='PAGO'` pra TODA linha presente na planilha
  `despesas_geral.json` e, quando a linha nao tinha data de pagamento real, usava a
  data de vencimento como `data_pagamento` (`pagto or vencto`). Algumas linhas eram
  na verdade lancamentos FUTUROS/agendados (mensalidades TEC de setembro + DAS ref.
  05/2026 venc. 20/09). Elas entraram como "pagas" com data de pagamento no futuro e
  ainda geraram uma `fin_movimentacao` de SAIDA fake.

Alvo (criterio, nao lista fixa):
  despesa_parcelas com
    - status = 'PAGO'
    - data_vencimento > CURDATE()            (vence no futuro -> nao pode estar paga)
    - despesa.observacao LIKE 'Migra%'        (veio da migracao historica)
    - despesa.deletado_em IS NULL

O que faz em cada parcela alvo:
  1. Snapshot da parcela + da movimentacao em `registros_exclusoes` (soft delete / auditoria).
  2. `fin_movimentacoes.deletado_em = NOW()` na movimentacao fake (nao apaga a linha).
  3. Reverte a parcela: status='PENDENTE', data_pagamento=NULL, banco_id=NULL,
     forma_pagamento=NULL, movimentacao_id=NULL.

Uso:
    cd backend
    ./venv/Scripts/python.exe ../fluxo-financeiro/corrigir_parcelas_pagas_futuras.py --ambiente local
    ./venv/Scripts/python.exe ../fluxo-financeiro/corrigir_parcelas_pagas_futuras.py --ambiente local --aplicar
    ./venv/Scripts/python.exe ../fluxo-financeiro/corrigir_parcelas_pagas_futuras.py --ambiente producao --aplicar
    # sem --aplicar e' dry-run: so' lista o que seria alterado.
    # producao precisa de paramiko no venv (pip install paramiko).
"""
import argparse
import json
import os

import pymysql

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")

PROD_HOST = "168.231.96.184"
PROD_SSH_KEY = os.path.expanduser("~/.ssh/id_ed25519")

SELECT_ALVOS = """
SELECT dp.id            AS parcela_id,
       dp.despesa_id,
       d.descricao,
       d.tipo_pagamento,
       dp.numero_parcela,
       dp.total_parcelas,
       dp.valor,
       dp.data_vencimento,
       dp.data_pagamento,
       dp.status,
       dp.banco_id,
       dp.forma_pagamento,
       dp.movimentacao_id,
       m.valor           AS mov_valor,
       m.data            AS mov_data,
       m.descricao       AS mov_descricao,
       m.tipo            AS mov_tipo,
       m.deletado_em     AS mov_deletado_em
FROM despesa_parcelas dp
JOIN despesas d           ON d.id = dp.despesa_id
LEFT JOIN fin_movimentacoes m ON m.id = dp.movimentacao_id
WHERE dp.status = 'PAGO'
  AND dp.data_vencimento > CURDATE()
  AND d.deletado_em IS NULL
  AND (d.observacao LIKE 'Migra%historica%' OR d.observacao LIKE 'Migra%hist_rica%')
ORDER BY dp.data_vencimento;
"""


# ─────────────────────────── execucao local ───────────────────────────

def rodar_local(aplicar: bool):
    conn = pymysql.connect(**LOCAL_DB, cursorclass=pymysql.cursors.DictCursor)
    try:
        with conn.cursor() as cur:
            cur.execute(SELECT_ALVOS)
            alvos = cur.fetchall()
            _print_alvos(alvos)
            if not aplicar or not alvos:
                if not aplicar:
                    print("\nDRY-RUN — nada alterado (use --aplicar).")
                return
            for a in alvos:
                _aplicar_um_local(cur, a)
        conn.commit()
        print(f"\nAPLICADO em local: {len(alvos)} parcela(s) revertida(s) pra PENDENTE.")
    finally:
        conn.close()


def _aplicar_um_local(cur, a):
    mov_id = a["movimentacao_id"]
    if mov_id and a["mov_deletado_em"] is None:
        cur.execute(
            """INSERT INTO registros_exclusoes
               (tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao)
               VALUES ('fin_movimentacao', %s, %s, %s, 'sistema')""",
            (mov_id, _snapshot(a), _MOTIVO),
        )
        cur.execute(
            "UPDATE fin_movimentacoes SET deletado_em = NOW() WHERE id = %s AND deletado_em IS NULL",
            (mov_id,),
        )
    cur.execute(
        """UPDATE despesa_parcelas
           SET status = 'PENDENTE', data_pagamento = NULL, banco_id = NULL,
               forma_pagamento = NULL, movimentacao_id = NULL
           WHERE id = %s AND status = 'PAGO'""",
        (a["parcela_id"],),
    )


# ───────────────────────── execucao producao (SSH) ─────────────────────

def rodar_producao(aplicar: bool):
    import paramiko

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", key_filename=PROD_SSH_KEY, timeout=15)

    def run(sql: str, ler: bool):
        cmd = ("docker exec -i cmport_db sh -c "
               "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 "
               + ("-N --batch" if ler else "") + "'")
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
        stdin.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
        stdin.channel.shutdown_write()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
        if rc != 0:
            raise RuntimeError(f"mysql producao rc={rc}: {err}")
        return out

    try:
        # dry-run: le os alvos em formato JSON pra exibir
        out = run(
            "SELECT JSON_ARRAYAGG(JSON_OBJECT("
            "'parcela_id', t.parcela_id, 'despesa_id', t.despesa_id, 'descricao', t.descricao,"
            "'numero_parcela', t.numero_parcela, 'valor', t.valor, 'data_vencimento', t.data_vencimento,"
            "'status', t.status, 'movimentacao_id', t.movimentacao_id, 'mov_deletado_em', t.mov_deletado_em"
            f")) FROM ({SELECT_ALVOS.strip().rstrip(';')}) t;",
            ler=True,
        ).strip()
        alvos = json.loads(out) if out and out != "NULL" else []
        _print_alvos(alvos)
        if not aplicar or not alvos:
            if not aplicar:
                print("\nDRY-RUN — nada alterado (use --aplicar).")
            return

        stmts = ["START TRANSACTION;"]
        for a in alvos:
            mov_id = a["movimentacao_id"]
            if mov_id and not a.get("mov_deletado_em"):
                dados = json.dumps(a, ensure_ascii=False, default=str).replace("\\", "\\\\").replace("'", "\\'")
                stmts.append(
                    "INSERT INTO registros_exclusoes "
                    "(tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao) "
                    f"VALUES ('fin_movimentacao', {mov_id}, '{dados}', '{_MOTIVO}', 'sistema');"
                )
                stmts.append(
                    f"UPDATE fin_movimentacoes SET deletado_em = NOW() WHERE id = {mov_id} AND deletado_em IS NULL;"
                )
            stmts.append(
                "UPDATE despesa_parcelas SET status='PENDENTE', data_pagamento=NULL, banco_id=NULL, "
                f"forma_pagamento=NULL, movimentacao_id=NULL WHERE id = {a['parcela_id']} AND status='PAGO';"
            )
        stmts.append("COMMIT;")
        run("\n".join(stmts), ler=False)
        print(f"\nAPLICADO em producao: {len(alvos)} parcela(s) revertida(s) pra PENDENTE.")
    finally:
        ssh.close()


# ─────────────────────────────── helpers ──────────────────────────────

_MOTIVO = ("Movimentacao fake criada pela migracao historica (Fase 6 V2) pra parcela de "
           "vencimento futuro marcada como PAGO indevidamente — revertida pra PENDENTE em 08/09/2026")


def _snapshot(a: dict) -> str:
    return json.dumps(a, ensure_ascii=False, indent=2, default=str)


def _print_alvos(alvos):
    print(f"=== {len(alvos)} parcela(s) alvo (PAGO + vencimento futuro + origem migracao) ===")
    for a in alvos:
        print(f"  parcela {a['parcela_id']:>5} | despesa {a['despesa_id']:>4} | "
              f"{str(a['descricao'])[:38]:<38} | parc {a['numero_parcela']} | "
              f"R$ {a['valor']} | venc {str(a['data_vencimento'])[:10]} | mov {a['movimentacao_id']}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ambiente", choices=["local", "producao"], default="local")
    p.add_argument("--aplicar", action="store_true")
    args = p.parse_args()
    if args.ambiente == "local":
        rodar_local(args.aplicar)
    else:
        rodar_producao(args.aplicar)


if __name__ == "__main__":
    main()
