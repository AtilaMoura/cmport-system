# -*- coding: utf-8 -*-
"""
Cria pendencias de pagamento (fin_movimentacoes status=PENDENTE) pros 49
lancamentos de Fornecedor que estao na planilha mas faltam em producao
(achados em 25/08/2026, ver fornecedores_faltando_view.json).

Nomes de fornecedor validados com o Atila (25/08):
- "Diproseg" / "Telman Vila Prudente" / "Snapar" = mesmos fornecedores ja
  cadastrados (DIPROSSEG VILA PRUDENTE / TELMAN MOOCA / SINAPAR)
- "Linear Sao Caetano" = na verdade LSC NICE (ja cadastrado)
- Demais nomes novos (Abriu Portas, Tugumi, Clautec, HCJ, WR Gama, Eduana Com.
  de Materiais, Companhia Brasileira de Distribuicao, Mauricio Motores,
  Construcao da Oficina, Mercado Livre, JT Thenorio) = fornecedores novos,
  cadastro em condominios (tipo=FORNECEDOR). Tugumi/Mauricio Motores/JT
  Thenorio ja tem categoria financeira antiga (fin_categorias) e reaproveitam
  ela; os outros 8 ganham categoria financeira nova (grupo=FORNECEDOR).

Nao conecta direto em producao -- so gera o .sql pra aplicar via
`docker exec -i cmport_db mysql ... < arquivo.sql` na VPS.
"""
import json
from datetime import datetime

import pymysql.converters as conv

JSON_PATH = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\fluxo-financeiro\fornecedores_faltando_view.json"

CNPJ_MAP = {"CMPORT": "22761557000188", "TEC": "65756913000188"}
BANCO_MAP = {"CMPORT": 1, "TEC": 4}  # Itau (CMPORT) / Inter (TEC)

# categorias FORNECEDOR ja existentes reaproveitadas (id fixo em producao)
CATEGORIA_EXISTENTE = {
    "tugumi": 9,
    "jt thenorio": 10,
    "mauricio motores": 18,
    "sinapar": 25,
    "diprosseg vila prudente": 50,
    "telman mooca": 51,
    "lsc nice": 52,
    "disfer": 55,
}
PROXIMA_ORDEM_CATEGORIA = 29  # max ordem atual (28) + 1

# condominios (tipo=FORNECEDOR) ja existentes em producao (id fixo)
CONDOMINIO_EXISTENTE = {
    "diprosseg vila prudente": 966,
    "telman mooca": 967,
    "lsc nice": 968,
    "sinapar": 971,
    "disfer": 973,
}

# nome exibido -> nome canonico (usado pra resolver categoria/condominio)
CANONICO = {
    "diproseg": "diprosseg vila prudente",
    "telman vila prudente": "telman mooca",
    "snapar": "sinapar",
    "linear são caetano": "lsc nice",
    "mauricio": "mauricio motores",
    "thenorio": "jt thenorio",
}

NOME_EXIBICAO = {
    "diprosseg vila prudente": "DIPROSSEG VILA PRUDENTE",
    "telman mooca": "TELMAN MOOCA",
    "sinapar": "SINAPAR",
    "lsc nice": "LSC NICE",
    "disfer": "DISFER",
    "tugumi": "Tugumi",
    "jt thenorio": "JT Thenório",
    "mauricio motores": "Mauricio Motores",
    "abriu portas": "Abriu Portas",
    "clautec": "Clautec",
    "hcj": "HCJ",
    "wr gama": "WR Gama",
    "eduana com. de materiais": "Eduana Com. de Materiais",
    "companhia brasileira de distribuição": "Companhia Brasileira de Distribuição",
    "construção da oficina": "Construção da Oficina",
    "mercado livre": "Mercado Livre",
}

FORNECEDOR_POR_NOME = {
    "abriu portas": "Abriu Portas",
    "tugumi": "Tugumi",
    "diprosseg vila prudente": "Diprosseg Vila Prudente",
    "diproseg": "Diprosseg Vila Prudente",
    "telman mooca": "Telman Mooca",
    "telman vila prudente": "Telman Mooca",
    "clautec": "Clautec",
    "hcj": "HCJ",
    "disfer": "Disfer",
    "wr gama": "WR Gama",
    "eduana com. de materiais": "Eduana Com. de Materiais",
    "companhia brasileira de distribuição": "Companhia Brasileira de Distribuição",
    "mauricio": "Mauricio Motores",
    "construção da oficina": "Construção da Oficina",
    "mercado livre": "Mercado Livre",
    "linear são caetano": "LSC NICE",
    "snapar": "Sinapar",
    "sinapar": "Sinapar",
}


def s(valor) -> str:
    if valor is None:
        return "NULL"
    return "'" + conv.escape_string(str(valor)) + "'"


def extrai_fornecedor(descricao: str) -> str:
    """Identifica o nome do fornecedor dentro da descricao (heuristica simples,
    ja validada manualmente item a item pro conjunto desses 49 lancamentos)."""
    d = descricao
    for prefixo in ("Pix ", "Boleto "):
        if d.startswith(prefixo):
            d = d[len(prefixo):]
    # corta no primeiro parenteses (resto e' o detalhe do material/condominio)
    idx = d.find("(")
    nome = d[:idx].strip() if idx >= 0 else d.strip()
    # remove sufixos tipo "LUIS" colados sem parenteses (caso especifico ja
    # tratado via mapeamento manual abaixo por linha, nao aqui)
    return nome


# Mapeamento manual final: linha da planilha (mes+data+valor+descricao) -> chave canonica
# (evita heuristica de nome errar nos casos com sufixo/typo)
MAPA_MANUAL = {
    (2026 * 100 + 4, "2026-04-30", 1504.20): "telman mooca",
    (2026 * 100 + 5, "2026-05-14", 3936.57): "diprosseg vila prudente",
    (2026 * 100 + 5, "2026-05-14", 704.17): "telman mooca",
    (2026 * 100 + 5, "2026-05-21", 1201.99): "telman mooca",
    (2026 * 100 + 5, "2026-05-25", 85.54): "telman mooca",
    (2026 * 100 + 5, "2026-05-25", 77.00): "abriu portas",
    (2026 * 100 + 5, "2026-05-26", 970.81): "telman mooca",
    (2026 * 100 + 5, "2026-05-29", 1259.35): "telman mooca",
    (2026 * 100 + 6, "2026-06-02", 344.44): "tugumi",
    (2026 * 100 + 6, "2026-06-05", 75.00): "telman mooca",
    (2026 * 100 + 6, "2026-06-08", 888.23): "telman mooca",
    (2026 * 100 + 6, "2026-06-10", 173.17): "telman mooca",
    (2026 * 100 + 6, "2026-06-10", 253.40): "diprosseg vila prudente",
    (2026 * 100 + 6, "2026-06-19", 91.92): "telman mooca",
    (2026 * 100 + 6, "2026-06-25", 230.00): "clautec",
    (2026 * 100 + 6, "2026-06-29", 132.40): "hcj",
    (2026 * 100 + 6, "2026-06-30", 554.17): "disfer",
    (2026 * 100 + 7, "2026-07-21", 68.10): "diprosseg vila prudente",
    (2026 * 100 + 7, "2026-07-21", 70.00): "wr gama",
    (2026 * 100 + 7, "2026-07-23", 1460.35): "diprosseg vila prudente",
    (2026 * 100 + 7, "2026-07-23", 181.67): "telman mooca",
    (2026 * 100 + 7, "2026-07-23", 114.81): "tugumi",
    (2026 * 100 + 7, "2026-07-27", 41.50): "eduana com. de materiais",
    (2026 * 100 + 7, "2026-07-27", 34.99): "companhia brasileira de distribuição",
    (2026 * 100 + 7, "2026-07-27", 1347.42): "disfer",
    (2026 * 100 + 7, "2026-07-28", 273.40): "diprosseg vila prudente",
    (2026 * 100 + 7, "2026-07-29", 1273.20): "telman mooca",
    (2026 * 100 + 7, "2026-07-30", 394.36): "diprosseg vila prudente",
    (2026 * 100 + 7, "2026-07-30", 25.00): "telman mooca",
    (2026 * 100 + 7, "2026-07-31", 140.00): "lsc nice",
    (2026 * 100 + 7, "2026-07-03", 456.60): "telman mooca",
    (2026 * 100 + 7, "2026-07-07", 838.91): "diprosseg vila prudente",
    (2026 * 100 + 7, "2026-07-09", 120.00): "mauricio motores",
    (2026 * 100 + 7, "2026-07-14", 1330.27): "telman mooca",
    (2026 * 100 + 7, "2026-07-14", 1892.39): "diprosseg vila prudente",
    (2026 * 100 + 7, "2026-07-21", 228.30): "telman mooca",
    (2026 * 100 + 7, "2026-07-21", 65.60): "construção da oficina",
    (2026 * 100 + 7, "2026-07-27", 56.05): "mercado livre",
    (2026 * 100 + 7, "2026-07-27", 79.80): "mercado livre",
    (2026 * 100 + 7, "2026-07-29", 182.61): "telman mooca",
    (2026 * 100 + 8, "2026-08-17", 18.00): "sinapar",
    (2026 * 100 + 8, "2026-08-07", 1338.62): "diprosseg vila prudente",
    (2026 * 100 + 8, "2026-08-07", 148.06): "diprosseg vila prudente",
    (2026 * 100 + 8, "2026-08-11", 92.92): "diprosseg vila prudente",
    (2026 * 100 + 8, "2026-08-14", 539.11): "disfer",
    (2026 * 100 + 8, "2026-08-14", 235.36): "telman mooca",
    (2026 * 100 + 8, "2026-08-17", 2035.00): "telman mooca",
    (2026 * 100 + 8, "2026-08-18", 110.00): "jt thenorio",
    (2026 * 100 + 8, "2026-08-27", 536.44): "disfer",
}


def resolver_forma_pagamento(descricao: str, cnpj_label: str) -> str:
    if descricao.startswith("Boleto"):
        return "BOLETO_INTER" if cnpj_label == "TEC" else "BOLETO_ITAU"
    if descricao.lower().startswith("transf"):
        return "TRANSFERENCIA"
    return "PIX"


def main():
    itens = json.load(open(JSON_PATH, encoding="utf-8"))

    chaves_usadas = set()
    for it in itens:
        mes = int(it["mes"].split("-")[1])
        chave = (2026 * 100 + mes, it["data"], round(it["valor"], 2))
        if chave not in MAPA_MANUAL:
            raise SystemExit(f"SEM MAPEAMENTO: {chave} -- {it['descricao']}")
        chaves_usadas.add(chave)

    canonicos_no_lote = sorted(set(MAPA_MANUAL[k] for k in chaves_usadas))
    novos_condominios = [c for c in canonicos_no_lote if c not in CONDOMINIO_EXISTENTE]
    novas_categorias = [c for c in novos_condominios if c not in CATEGORIA_EXISTENTE]

    linhas = []
    linhas.append("-- Pendencias de pagamento Fornecedor -- 49 itens faltando (validado 25/08/2026)")
    linhas.append("-- gerado em " + datetime.now().isoformat())
    linhas.append("START TRANSACTION;")
    linhas.append("")

    var_categoria = {}
    for canon in CATEGORIA_EXISTENTE:
        var_categoria[canon] = str(CATEGORIA_EXISTENTE[canon])

    if novas_categorias:
        linhas.append("-- Categorias financeiras novas (grupo FORNECEDOR)")
        for i, canon in enumerate(novas_categorias):
            ordem = PROXIMA_ORDEM_CATEGORIA + i
            nome = NOME_EXIBICAO[canon]
            linhas.append(
                f"INSERT INTO fin_categorias (nome, grupo, tipo, ativo, ordem) VALUES "
                f"({s(nome)}, 'FORNECEDOR', 'SAIDA', 1, {ordem});"
            )
            varname = f"@cat_{i}"
            linhas.append(f"SET {varname} = LAST_INSERT_ID();")
            var_categoria[canon] = varname
        linhas.append("")

    var_condominio = {}
    for canon in CONDOMINIO_EXISTENTE:
        var_condominio[canon] = str(CONDOMINIO_EXISTENTE[canon])

    if novos_condominios:
        linhas.append("-- Fornecedores novos (condominios tipo=FORNECEDOR)")
        for i, canon in enumerate(novos_condominios):
            nome = NOME_EXIBICAO[canon]
            linhas.append(
                f"INSERT INTO condominios (nome, tipo, ativo, criado_em, atualizado_em) VALUES "
                f"({s(nome)}, 'FORNECEDOR', 1, NOW(), NOW());"
            )
            varname = f"@forn_{i}"
            linhas.append(f"SET {varname} = LAST_INSERT_ID();")
            var_condominio[canon] = varname
        linhas.append("")

    linhas.append("-- 49 pendencias de pagamento (fin_movimentacoes, status=PENDENTE)")
    for it in itens:
        mes = int(it["mes"].split("-")[1])
        chave = (2026 * 100 + mes, it["data"], round(it["valor"], 2))
        canon = MAPA_MANUAL[chave]
        cnpj_label = it["cnpj"]
        banco_id = BANCO_MAP[cnpj_label]
        forma = resolver_forma_pagamento(it["descricao"], cnpj_label)
        categoria_ref = var_categoria[canon]
        fornecedor_ref = var_condominio[canon]
        observacao = "Pendência criada a partir da reconciliação planilha × produção (25/08/2026) — fornecedor: " + NOME_EXIBICAO[canon]
        linhas.append(
            f"INSERT INTO fin_movimentacoes (data, descricao, valor, tipo, categoria_id, "
            f"origem, status, banco_id, forma_pagamento, fornecedor_id, observacao) VALUES "
            f"({s(it['data'])}, {s(it['descricao'])}, {it['valor']}, 'SAIDA', {categoria_ref}, "
            f"'MANUAL', 'PENDENTE', {banco_id}, {s(forma)}, {fornecedor_ref}, {s(observacao)});"
        )

    linhas.append("")
    linhas.append("COMMIT;")

    nome_arquivo = f"pendencias_fornecedores_{datetime.now().strftime('%Y%m%d_%H%M')}.sql"
    with open(nome_arquivo, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    print("Categorias novas:", len(novas_categorias), [NOME_EXIBICAO[c] for c in novas_categorias])
    print("Fornecedores novos:", len(novos_condominios), [NOME_EXIBICAO[c] for c in novos_condominios])
    print("Movimentacoes pendentes:", len(itens))
    print(f"Total: R$ {sum(i['valor'] for i in itens):,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    print("Gerado:", nome_arquivo)


if __name__ == "__main__":
    main()
