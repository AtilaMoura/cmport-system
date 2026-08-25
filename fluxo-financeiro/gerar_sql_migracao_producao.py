# -*- coding: utf-8 -*-
"""
Reaproveita a classificacao ja validada do migrar_despesa_geral_v2.py (14
RECORRENTE + 10 PARCELADO + 429 UNICO, R$178.138,41) e gera um arquivo .sql
pronto pra aplicar em PRODUCAO via `docker exec -i cmport_db mysql ... < arquivo.sql`
na VPS -- nao conecta direto no banco de producao (sem tunel MySQL configurado),
so gera o SQL.

Categorias novas tem IDs diferentes entre local (53-60) e producao (56-63,
ja que producao tem mais categorias de fornecedor no meio) -- REMAPEIA antes
de gerar o SQL. Bancos batem igual (Itau=1, Inter CMPORT=2, Inter TEC=4).

Tambem gera o UPDATE de soft-delete dos 839 lancamentos antigos de DESPESA
(fin_movimentacoes.deletado_em) -- SOFT delete, nunca hard, por padrao do
projeto (registrar_exclusao nao se aplica aqui pq nao e via API, mas
deletado_em preserva o registro pra auditoria/reversao).

Uso:
    cd backend && venv\\Scripts\\python.exe ..\\fluxo-financeiro\\gerar_sql_migracao_producao.py

Gera: fluxo-financeiro/migracao_producao_YYYYMMDD_HHMM.sql
"""
import json
import sys
from datetime import datetime

sys.path.insert(0, ".")
sys.path.insert(0, "../fluxo-financeiro")

import pymysql.converters as conv

from migrar_despesa_geral_v2 import (
    JSON_PATH, classificar, CNPJ_MAP, BANCO_MAP, resolver_forma_pagamento,
)

# categoria_id LOCAL -> categoria_id PRODUCAO (so as 8 novas; as 21 originais
# (29-49) batem igual nos dois lados)
REMAP_CATEGORIA = {
    53: 56,  # Veiculo IPVA/multa
    54: 57,  # Veiculo manutencao
    55: 58,  # Veiculo garagem
    56: 59,  # Cartao de credito corporativo
    57: 60,  # Material escritorio
    58: 61,  # Material condominio
    59: 62,  # Repasse zelador/sindico
    60: 63,  # Acordos/juridico
}


def cat(categoria_id_local: int) -> int:
    return REMAP_CATEGORIA.get(categoria_id_local, categoria_id_local)


def s(valor) -> str:
    """Escapa string pra SQL (aspas simples), ou NULL se None."""
    if valor is None:
        return "NULL"
    return "'" + conv.escape_string(str(valor)) + "'"


def main():
    data = json.load(open(JSON_PATH, encoding="utf-8"))
    transacoes = data["transacoes"]
    recorrentes, parcelados, unicos = classificar(transacoes)

    linhas = []
    linhas.append("-- Migracao Fase 6 V2 para PRODUCAO -- gerado em " + datetime.now().isoformat())
    linhas.append("-- 14 RECORRENTE + 10 PARCELADO + 429 UNICO, R$178.138,41")
    linhas.append("START TRANSACTION;")
    linhas.append("")

    linhas.append("-- 1) Soft-delete dos 839 lancamentos antigos de DESPESA (mal categorizados, tela antiga)")
    linhas.append(
        "UPDATE fin_movimentacoes m JOIN fin_categorias c ON c.id = m.categoria_id "
        "SET m.deletado_em = NOW() WHERE c.grupo = 'DESPESA' AND m.deletado_em IS NULL "
        "AND m.categoria_id NOT IN (29,30);"
    )
    linhas.append("-- (categorias 29/30 = Salarios/Adiantamento de Salario, escopo Funcionario, NAO mexe)")
    linhas.append("")

    linhas.append("-- 2) RECORRENTE")
    for r in recorrentes:
        cnpj = CNPJ_MAP[r["cnpj_label"]]
        banco_id = BANCO_MAP[r["cnpj_label"]]
        categoria_id = cat(r["categoria_id"])
        linhas.append(
            f"INSERT INTO despesas (descricao, categoria_id, cnpj, tipo_pagamento, valor_total, "
            f"total_parcelas, dia_vencimento, observacao, ativo) VALUES "
            f"({s(r['nome'])}, {categoria_id}, {s(cnpj)}, 'RECORRENTE', {r['valor_atual']}, 0, "
            f"{r['dia_vencimento']}, {s('Migração histórica (Fase 6 V2) — recorrente')}, 1);"
        )
        linhas.append("SET @desp_id = LAST_INSERT_ID();")
        for p in r["parcelas"]:
            forma = resolver_forma_pagamento(r["nome"])
            linhas.append(
                f"INSERT INTO fin_movimentacoes (data, descricao, valor, tipo, categoria_id, origem, "
                f"status, observacao, banco_id, forma_pagamento) VALUES "
                f"({s(p['data_pagamento'])}, {s(r['nome'])}, {p['valor']}, 'SAIDA', {categoria_id}, "
                f"'MANUAL', 'VALIDADO', {s('Migração histórica (Fase 6 V2, recorrente)')}, {banco_id}, {s(forma)});"
            )
            linhas.append("SET @mov_id = LAST_INSERT_ID();")
            linhas.append(
                f"INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor, "
                f"data_vencimento, status, data_pagamento, banco_id, forma_pagamento, movimentacao_id) VALUES "
                f"(@desp_id, {p['numero_parcela']}, 0, {p['valor']}, {s(p['data_vencimento'])}, 'PAGO', "
                f"{s(p['data_pagamento'])}, {banco_id}, {s(forma)}, @mov_id);"
            )
        linhas.append("")

    linhas.append("-- 3) PARCELADO")
    for pd in parcelados:
        cnpj = CNPJ_MAP[pd["cnpj_label"]]
        banco_id = BANCO_MAP[pd["cnpj_label"]]
        categoria_id = cat(pd["categoria_id"])
        valor_total = sum(x["valor"] for x in pd["parcelas"])
        faltam = pd["total_parcelas"] - pd["encontradas"]
        obs = "Migração histórica (Fase 6 V2) — parcelado"
        if faltam:
            obs += f" — {faltam} parcela(s) da série original não encontrada(s) na planilha, criada(s) como PENDENTE (data/valor estimados)"
        linhas.append(
            f"INSERT INTO despesas (descricao, categoria_id, cnpj, tipo_pagamento, valor_total, "
            f"total_parcelas, observacao, ativo) VALUES "
            f"({s(pd['nome'])}, {categoria_id}, {s(cnpj)}, 'PARCELADO', {valor_total}, "
            f"{pd['total_parcelas']}, {s(obs)}, 1);"
        )
        linhas.append("SET @desp_id = LAST_INSERT_ID();")
        for p in pd["parcelas"]:
            forma = resolver_forma_pagamento(pd["nome"])
            if p["status"] == "PAGO":
                linhas.append(
                    f"INSERT INTO fin_movimentacoes (data, descricao, valor, tipo, categoria_id, origem, "
                    f"status, observacao, banco_id, forma_pagamento) VALUES "
                    f"({s(p['data_pagamento'])}, {s(pd['nome'])}, {p['valor']}, 'SAIDA', {categoria_id}, "
                    f"'MANUAL', 'VALIDADO', {s('Migração histórica (Fase 6 V2, parcelado)')}, {banco_id}, {s(forma)});"
                )
                linhas.append("SET @mov_id = LAST_INSERT_ID();")
                linhas.append(
                    f"INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor, "
                    f"data_vencimento, status, data_pagamento, banco_id, forma_pagamento, movimentacao_id) VALUES "
                    f"(@desp_id, {p['numero_parcela']}, {pd['total_parcelas']}, {p['valor']}, "
                    f"{s(p['data_vencimento'])}, 'PAGO', {s(p['data_pagamento'])}, {banco_id}, {s(forma)}, @mov_id);"
                )
            else:
                linhas.append(
                    f"INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor, "
                    f"data_vencimento, status) VALUES "
                    f"(@desp_id, {p['numero_parcela']}, {pd['total_parcelas']}, {p['valor']}, "
                    f"{s(p['data_vencimento'])}, 'PENDENTE');"
                )
        linhas.append("")

    linhas.append("-- 4) UNICO")
    for t in unicos:
        cnpj_label = t["cnpj"]
        cnpj = CNPJ_MAP[cnpj_label]
        banco_id = BANCO_MAP[cnpj_label]
        descricao = t["descricao_normalizada"] or t["descricao"]
        valor = round(abs(t["valor"]), 2)
        from migrar_despesa_geral_v2 import data_valida, resolver_categoria_unico
        data_vencimento = data_valida(t["vencto"], t["pagto"])
        data_pagamento = t["pagto"] or data_vencimento
        forma_pagamento = resolver_forma_pagamento(descricao)
        categoria_id_local, obs_extra = resolver_categoria_unico(t["subcategoria"], descricao)
        categoria_id = cat(categoria_id_local)
        observacao = "Migração histórica (Fase 6 V2)" + (f" — {obs_extra}" if obs_extra else "")

        linhas.append(
            f"INSERT INTO fin_movimentacoes (data, descricao, valor, tipo, categoria_id, origem, "
            f"status, observacao, banco_id, forma_pagamento) VALUES "
            f"({s(data_pagamento)}, {s(descricao)}, {valor}, 'SAIDA', {categoria_id}, "
            f"'MANUAL', 'VALIDADO', {s(observacao)}, {banco_id}, {s(forma_pagamento)});"
        )
        linhas.append("SET @mov_id = LAST_INSERT_ID();")
        linhas.append(
            f"INSERT INTO despesas (descricao, categoria_id, cnpj, tipo_pagamento, valor_total, "
            f"total_parcelas, observacao, ativo) VALUES "
            f"({s(descricao)}, {categoria_id}, {s(cnpj)}, 'UNICO', {valor}, 1, {s(observacao)}, 1);"
        )
        linhas.append("SET @desp_id = LAST_INSERT_ID();")
        linhas.append(
            f"INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor, "
            f"data_vencimento, status, data_pagamento, banco_id, forma_pagamento, movimentacao_id) VALUES "
            f"(@desp_id, 1, 1, {valor}, {s(data_vencimento)}, 'PAGO', {s(data_pagamento)}, {banco_id}, "
            f"{s(forma_pagamento)}, @mov_id);"
        )

    linhas.append("")
    linhas.append("COMMIT;")

    nome_arquivo = f"migracao_producao_{datetime.now().strftime('%Y%m%d_%H%M')}.sql"
    with open(nome_arquivo, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    print(f"Gerado: {nome_arquivo}")
    print(f"RECORRENTE: {len(recorrentes)} despesas")
    print(f"PARCELADO: {len(parcelados)} despesas")
    print(f"UNICO: {len(unicos)} lancamentos")
    total = (sum(sum(x["valor"] for x in r["parcelas"] if x["status"] == "PAGO") for r in recorrentes)
             + sum(sum(x["valor"] for x in p["parcelas"] if x["status"] == "PAGO") for p in parcelados)
             + sum(abs(t["valor"]) for t in unicos))
    print(f"Total PAGO: R$ {total:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))


if __name__ == "__main__":
    main()
