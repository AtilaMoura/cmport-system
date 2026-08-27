# -*- coding: utf-8 -*-
"""
Migracao incremental: 19 itens (207 lancamentos, R$35.012,51) que estavam em
despesas_funcionario.json e foram reclassificados como despesa GERAL apos
validacao manual do Atila (checklist HTML, 25/08/2026). A Fase 6 V2 (25/08,
gerar_sql_migracao_producao.py) ja migrou os outros 429 unicos + recorrentes +
parcelados do despesas_geral.json original -- este script NAO mexe nisso, so
insere os 207 lancamentos novos, cada um como despesa UNICO (mesmo padrao dos
itens de alta frequencia como Uber/Zona Azul).

Mapeamento de categoria decidido com o Atila (25/08):
- Adiantamento de salario (3 itens avulsos, nao os adiantamentos recorrentes
  por pessoa que continuam Funcionario) -> categoria 30 "Adiantamento de Salario"
- Encargos trabalhistas GPS-Acordo/FGTS-Acordo -> categoria 38 "Impostos (FGTS/GPS/ISS)"
- Convenio medico (Convenio Medico, Amil, Amil Plano Odontologico) -> categoria 39 "Convenio"
- Cafe/lanche funcionarios -> categoria 46 "Alimentacao"
- Emprestimo de salario, Passagem/reembolso pessoal, Uniforme/EPI -> categoria 49 "Diversos"
  (baixo volume, sem categoria dedicada que valha a pena criar)

Nao conecta direto em producao -- so gera o .sql pra aplicar via
`docker exec -i cmport_db mysql ... < arquivo.sql` na VPS.

Uso:
    cd backend && venv\\Scripts\\python.exe ..\\fluxo-financeiro\\gerar_sql_incremento_funcionario.py
"""
import json
import sys
from datetime import datetime

sys.path.insert(0, ".")
sys.path.insert(0, "../fluxo-financeiro")

import pymysql.converters as conv

from migrar_despesa_geral_v2 import CNPJ_MAP, BANCO_MAP, data_valida, resolver_forma_pagamento

JSON_PATH = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\fluxo-financeiro\despesas_geral.json"

# descricoes exatas (descricao_normalizada) que formam os 19 itens reclassificados
DESCRICOES_INCREMENTO = {
    "Adiantamento Fabiana Pedretti Moreira Rosa (Transferencia CARRO)",
    "Adiantamento Fabiana Pedretti Moreira Rosa (Conserto Maquina)",
    "Pix André (Adiantamento Salário)",
    "GPS - Acordo",
    "FGTS - Acordo 2025023010",
    "Convenio Medico",
    "Convenio Medico - (Mês de Dezembro)",
    "Convenio Medico - Mês",
    "Amil",
    "Amil Plano Odontologico",
    "Emprestimo de Salario Fabiana Pedretti Moreira Rosa (Referente ao Mês Abril)",
    "Cartão de debito - (Café da manha funcionarios)",
    "Pix Acessorios Industriais (Material de Segurança dos funcionarios)",
    "Pix Cacau Show (Chocolate para Funcionários)",
    "Pix Maria Lima(Gracha Funcionarios)",
    "Cartão de debito - (Café da tarde funcionarios)",
    "Pix Almira Salomão (Café da manha funcionários)",
    "Pix Almira Salomão (Pagar café da manhã)",
    "Pix Almira Moreira Rosa Salomão (Limpeza Escritorio)",
    "Pix Sabor do Bolo 9Bolo aniversario do Pedro)",
    "Pix Kontes Express (Uniformes do Tecnicos)",
}

CATEGORIA_POR_SUBCATEGORIA = {
    "Adiantamento de salário": 30,
    "Encargos trabalhistas (FGTS/GPS/Sindicato)": 38,
    "Benefício — convênio médico/odontológico": 39,
    "Empréstimo de salário": 49,
    "Café/lanche/confraternização para funcionários": 46,
    "Passagem/reembolso pessoal a funcionário nomeado": 49,
    "Uniforme/EPI funcionários": 49,
}


def s(valor) -> str:
    """Escapa string pra SQL (aspas simples), ou NULL se None."""
    if valor is None:
        return "NULL"
    return "'" + conv.escape_string(str(valor)) + "'"


def main():
    data = json.load(open(JSON_PATH, encoding="utf-8"))
    itens = [t for t in data["transacoes"] if t["descricao_normalizada"] in DESCRICOES_INCREMENTO]

    faltando = DESCRICOES_INCREMENTO - {t["descricao_normalizada"] for t in itens}
    if faltando:
        print("ERRO: descricoes nao encontradas no JSON:", faltando)
        return

    linhas = []
    linhas.append("-- Migracao incremental: 19 itens reclassificados de Funcionario -> Despesa Geral")
    linhas.append("-- gerado em " + datetime.now().isoformat())
    linhas.append(f"-- {len(itens)} lancamentos, R$ {sum(t['valor'] for t in itens):,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    linhas.append("START TRANSACTION;")
    linhas.append("")

    resumo_categoria = {}
    for t in itens:
        cnpj_label = t["cnpj"]
        cnpj = CNPJ_MAP[cnpj_label]
        banco_id = BANCO_MAP[cnpj_label]
        descricao = t["descricao_normalizada"] or t["descricao"]
        valor = round(abs(t["valor"]), 2)
        data_vencimento = data_valida(t["vencto"], t["pagto"])
        data_pagamento = t["pagto"] or data_vencimento
        linha = t["linha_planilha"]
        id_externo = f"MIGRACAO-DESPESA-GERAL-{cnpj_label}-{linha}"
        forma_pagamento = resolver_forma_pagamento(descricao)
        categoria_id = CATEGORIA_POR_SUBCATEGORIA[t["subcategoria"]]
        resumo_categoria[categoria_id] = resumo_categoria.get(categoria_id, 0) + valor

        observacao = "Migração histórica (Fase 6 V2) — reclassificado de Funcionário para Despesa Geral (validação 25/08/2026)"

        linhas.append(
            f"INSERT INTO fin_movimentacoes (data, descricao, valor, tipo, categoria_id, origem, "
            f"status, id_externo_banco, observacao, banco_id, forma_pagamento) VALUES "
            f"({s(data_pagamento)}, {s(descricao)}, {valor}, 'SAIDA', {categoria_id}, "
            f"'MANUAL', 'VALIDADO', {s(id_externo)}, {s(observacao)}, {banco_id}, {s(forma_pagamento)});"
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

    nome_arquivo = f"migracao_incremento_funcionario_{datetime.now().strftime('%Y%m%d_%H%M')}.sql"
    with open(nome_arquivo, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    print(f"Gerado: {nome_arquivo}")
    print(f"Total: {len(itens)} lancamentos, R$ {sum(t['valor'] for t in itens):,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    print("Por categoria:")
    for cat_id, valor in sorted(resumo_categoria.items()):
        print(f"  categoria {cat_id}: R$ {valor:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))


if __name__ == "__main__":
    main()
