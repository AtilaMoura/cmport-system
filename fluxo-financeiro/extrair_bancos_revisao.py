# -*- coding: utf-8 -*-
"""
Extrai da PRODUCAO (read-only) os dados pra tela de revisao de banco:
- lista de bancos (dropdown)
- toda fin_movimentacao tipo SAIDA (nao deletada) com parcela/despesa vinculada
- toda despesa_parcela PAGO SEM movimentacao (orfas)

Gera fluxo-financeiro/dados_bancos_revisao.json

Uso:
    cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/extrair_bancos_revisao.py
"""
import io
import json
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import paramiko

PROD_HOST = "168.231.96.184"
OUT = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\fluxo-financeiro\dados_bancos_revisao.json"

Q_BANCOS = """
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'id', id, 'nome', nome, 'cnpj_titular', cnpj_titular,
  'razao', razao_social_titular, 'ativo', ativo)), JSON_ARRAY())
FROM bancos ORDER BY id;
"""

Q_MOV = """
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'mov_id', m.id, 'data', m.data, 'descricao', m.descricao, 'valor', m.valor,
  'banco_id', m.banco_id, 'banco_origem_id', m.banco_origem_id,
  'forma_pagamento', m.forma_pagamento, 'origem', m.origem, 'status', m.status,
  'mov_fornecedor_id', m.fornecedor_id,
  'id_externo_banco', m.id_externo_banco, 'observacao', LEFT(m.observacao, 160),
  'categoria', c.nome, 'categoria_grupo', c.grupo, 'fornecedor', f.nome,
  'parcela_id', p.id, 'despesa_id', p.despesa_id, 'despesa_desc', d.descricao,
  'despesa_cnpj', d.cnpj, 'despesa_banco_previsto_id', d.banco_previsto_id,
  'despesa_fornecedor_id', d.fornecedor_id,
  'numero_parcela', p.numero_parcela, 'total_parcelas', p.total_parcelas,
  'fornecedor_despesa', fd.nome, 'categoria_despesa', cd.nome,
  'categoria_despesa_grupo', cd.grupo)), JSON_ARRAY())
FROM fin_movimentacoes m
LEFT JOIN fin_categorias c  ON c.id = m.categoria_id
LEFT JOIN condominios    f  ON f.id = m.fornecedor_id
LEFT JOIN despesa_parcelas p ON p.movimentacao_id = m.id
LEFT JOIN despesas       d  ON d.id = p.despesa_id
LEFT JOIN condominios    fd ON fd.id = d.fornecedor_id
LEFT JOIN fin_categorias cd ON cd.id = d.categoria_id
WHERE m.tipo = 'SAIDA' AND m.deletado_em IS NULL;
"""

Q_PARC_ORFAS = """
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'parcela_id', p.id, 'data', COALESCE(p.data_pagamento, p.data_vencimento),
  'valor', p.valor, 'banco_id', p.banco_id, 'forma_pagamento', p.forma_pagamento,
  'despesa_id', p.despesa_id, 'descricao', d.descricao,
  'numero_parcela', p.numero_parcela, 'total_parcelas', p.total_parcelas,
  'fornecedor', f.nome, 'categoria', cat.nome)), JSON_ARRAY())
FROM despesa_parcelas p
JOIN despesas d ON d.id = p.despesa_id
LEFT JOIN condominios    f   ON f.id = d.fornecedor_id
LEFT JOIN fin_categorias cat ON cat.id = d.categoria_id
WHERE p.status = 'PAGO' AND p.movimentacao_id IS NULL AND d.deletado_em IS NULL;
"""


def run(sql):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(PROD_HOST, username="root", timeout=15)
    query = "USE cmport_gerenciamento; " + " ".join(sql.split())
    cmd = "docker exec -i cmport_db sh -c 'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" -N --default-character-set=utf8mb4'"
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    stdin.write(query)
    stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace")
    ssh.close()
    if not out:
        raise RuntimeError(f"Sem retorno. stderr: {err}")
    return json.loads(out)


def main():
    print("Extraindo bancos...")
    bancos = run(Q_BANCOS)
    print(f"  {len(bancos)} bancos")

    print("Extraindo movimentacoes SAIDA...")
    movs = run(Q_MOV)
    print(f"  {len(movs)} linhas (mov x parcela)")

    print("Extraindo parcelas PAGO orfas (sem movimentacao)...")
    orfas = run(Q_PARC_ORFAS)
    print(f"  {len(orfas)} parcelas orfas")

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"bancos": bancos, "movimentacoes": movs, "parcelas_orfas": orfas},
                  fh, ensure_ascii=False, indent=1, default=str)
    print(f"\nSalvo em {OUT}")

    # resumo rapido
    from collections import Counter
    bmap = {b["id"]: b["nome"] for b in bancos}
    c = Counter(bmap.get(m["banco_id"], f"id={m['banco_id']}") for m in movs)
    print("\nMovimentacoes SAIDA por banco atual:")
    for k, v in c.most_common():
        print(f"  {k:20} {v}")
    mig = sum(1 for m in movs if (m.get("id_externo_banco") or "").startswith("MIGRACAO"))
    print(f"\n  vindas da migracao (id_externo MIGRACAO-%): {mig}")


if __name__ == "__main__":
    main()
