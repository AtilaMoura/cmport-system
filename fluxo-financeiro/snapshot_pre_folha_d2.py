# -*- coding: utf-8 -*-
"""
Passo 0 da Fase D2 — tira uma FOTO (somente leitura) do estado de produção de
tudo que a migração vai tocar, pra poder comparar depois / reverter na mão.

Lê `folha_d2_input.json` e faz SELECT em produção de:
  - os 7 funcionarios + funcionario_variaveis (Passo 1 mexe em 4)
  - cada registro da lista `remover` (Passo 2 apaga — soft)
  - cada registro da lista `recategorizar` (Passo 4 troca categoria)
  - contagem das despesas RECORRENTE com funcionario_id (Passo NENHUM mexe — controle)

Saída: fluxo-financeiro/snapshot_pre_folha_d2_<ts>.txt

Uso: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/snapshot_pre_folha_d2.py
"""
import io
import json
import sys
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import paramiko

BASE = Path(__file__).resolve().parent
INP = json.load((BASE / "folha_d2_input.json").open(encoding="utf-8"))
TS = datetime.now().strftime("%Y%m%d_%H%M")
OUT = BASE / f"snapshot_pre_folha_d2_{TS}.txt"


def q(ssh, sql):
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
    i, o, _ = ssh.exec_command(cmd, timeout=120)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
    i.channel.shutdown_write()
    return [ln.split("\t") for ln in o.read().decode("utf-8", "replace").splitlines() if ln.strip()]


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("168.231.96.184", username="root", timeout=20)

    linhas = [f"SNAPSHOT PRÉ-FASE-D2 — {datetime.now():%Y-%m-%d %H:%M}", "=" * 90, ""]

    linhas.append("### FUNCIONARIOS (7) — Passo 1 corrige admissão/adiantamento de 4")
    for r in q(ssh, """SELECT id,nome,empresa_padrao_cnpj,cargo,data_admissao,data_demissao,ativo
                       FROM funcionarios ORDER BY id;"""):
        linhas.append("  " + " | ".join(r))
    linhas.append("")
    linhas.append("### FUNCIONARIO_VARIAVEIS")
    for r in q(ssh, """SELECT funcionario_id,salario_mensal,dia_pagamento_salario,adiantamento_tipo,
                       adiantamento_valor,dia_pagamento_adiantamento,vale_transporte,vale_refeicao,
                       tem_plantao,plantao_valor,tem_hora_extra,hora_extra_valor
                       FROM funcionario_variaveis ORDER BY funcionario_id;"""):
        linhas.append("  " + " | ".join(r))
    linhas.append("")

    mov_ids = [str(x["id"]) for x in INP["remover"] if x["fonte"] == "mov_orfa"]
    desp_ids = [str(x["id"]) for x in INP["remover"] if x["fonte"] == "despesa_avulsa"]

    linhas.append(f"### REMOVER — fin_movimentacoes ({len(mov_ids)}) — Passo 2 soft-delete")
    linhas.append("  id | data | valor | tipo | banco_id | categoria_id | deletado_em | descricao")
    for r in q(ssh, f"""SELECT id,data,valor,tipo,banco_id,categoria_id,deletado_em,LEFT(descricao,80)
                        FROM fin_movimentacoes WHERE id IN ({','.join(mov_ids)}) ORDER BY id;"""):
        linhas.append("  " + " | ".join(r))
    # checagem de vínculos (tem que ser tudo 0)
    linhas.append("")
    linhas.append("  -- vínculos que impediriam o delete (tem que ser 0):")
    for tab in ("despesa_parcelas", "fin_movimentacao_servicos", "fin_movimentacao_orcamentos",
                "fin_movimentacao_os_fornecedor"):
        col = "movimentacao_id"
        n = q(ssh, f"SELECT COUNT(*) FROM {tab} WHERE {col} IN ({','.join(mov_ids)});")
        linhas.append(f"     {tab}: {n[0][0] if n else '?'}")
    linhas.append("")

    linhas.append(f"### REMOVER — despesas ({len(desp_ids)}) + suas parcelas/movimentações — Passo 2")
    for r in q(ssh, f"""SELECT id,descricao,cnpj,valor_total,tipo_pagamento,categoria_id,funcionario_id,deletado_em
                        FROM despesas WHERE id IN ({','.join(desp_ids)}) ORDER BY id;"""):
        linhas.append("  DESP " + " | ".join(r))
    for r in q(ssh, f"""SELECT despesa_id,id,numero_parcela,valor,data_vencimento,status,data_pagamento,movimentacao_id
                        FROM despesa_parcelas WHERE despesa_id IN ({','.join(desp_ids)}) ORDER BY despesa_id,numero_parcela;"""):
        linhas.append("  PARC " + " | ".join(r))
    linhas.append("")

    rec_ids = [str(x["id"]) for x in INP["recategorizar"]]
    linhas.append(f"### RECATEGORIZAR — despesas ({len(rec_ids)}) — Passo 4 troca categoria_id")
    linhas.append("  id | categoria_id_atual | valor_total | deletado_em | descricao")
    for r in q(ssh, f"""SELECT id,categoria_id,valor_total,deletado_em,LEFT(descricao,70)
                        FROM despesas WHERE id IN ({','.join(rec_ids)}) ORDER BY id;"""):
        linhas.append("  " + " | ".join(r))
    linhas.append("")

    linhas.append("### INTOCÁVEL — despesas RECORRENTE com funcionario_id (Passo nenhum mexe)")
    for r in q(ssh, """SELECT funcionario_id,COUNT(*),SUM(valor_total)
                       FROM despesas WHERE funcionario_id IS NOT NULL AND deletado_em IS NULL
                       AND tipo_pagamento='RECORRENTE' GROUP BY funcionario_id ORDER BY funcionario_id;"""):
        linhas.append("  " + " | ".join(r))
    n = q(ssh, """SELECT COUNT(*),SUM(valor) FROM despesa_parcelas p JOIN despesas d ON d.id=p.despesa_id
                  WHERE d.funcionario_id IS NOT NULL AND d.deletado_em IS NULL;""")
    linhas.append(f"  parcelas dessas recorrentes: {n[0][0]} · R$ {n[0][1]}")
    linhas.append("")

    linhas.append("### CONTAGENS GERAIS (pra comparar pós-migração)")
    for label, sql in [
        ("despesas (deletado_em IS NULL)", "SELECT COUNT(*) FROM despesas WHERE deletado_em IS NULL;"),
        ("despesas c/ funcionario_id", "SELECT COUNT(*) FROM despesas WHERE funcionario_id IS NOT NULL AND deletado_em IS NULL;"),
        ("fin_movimentacoes SAIDA (deletado_em IS NULL)", "SELECT COUNT(*),SUM(valor) FROM fin_movimentacoes WHERE tipo='SAIDA' AND deletado_em IS NULL;"),
        ("registros_exclusoes", "SELECT COUNT(*) FROM registros_exclusoes;"),
    ]:
        r = q(ssh, sql)
        linhas.append(f"  {label}: {' | '.join(r[0]) if r else '?'}")

    ssh.close()
    OUT.write_text("\n".join(linhas), encoding="utf-8")
    print("\n".join(linhas))
    print(f"\n\nOK → {OUT.name}")


if __name__ == "__main__":
    main()
