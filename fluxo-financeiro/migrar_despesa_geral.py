# -*- coding: utf-8 -*-
"""
Fase 6 do plano em PLANO_DESPESA_GERAL.md: migra os 558 lancamentos de
despesas_geral.json (R$178.138,41, Jan-Ago/2026) pro banco como registros
ja PAGO -- cada linha do JSON vira uma Despesa independente (tipo UNICO,
1 parcela), sem tentar reconstruir series de parcela (e' historico, ja
aconteceu). Cada parcela PAGO gera tambem a MovimentacaoFinanceira
vinculada, pra contar no fluxo-mensal/dashboard igual qualquer despesa
paga pela tela.

Banco generico por CNPJ (decisao combinada com o Atila em 24/08/2026,
ja que o JSON nao tem banco por lancamento): Itau pra CMPORT, Inter pra
CMPORT TEC.

Idempotente: usa fin_movimentacoes.id_externo_banco = "MIGRACAO-DESPESA-GERAL-{cnpj}-{linha_planilha}"
como chave unica -- rodar de novo pula o que ja foi inserido.

Uso:
    cd backend && venv\\Scripts\\python.exe ..\\fluxo-financeiro\\migrar_despesa_geral.py
        --ambiente local            (dry-run por padrao, so mostra resumo)
        --ambiente local --aplicar  (efetivamente insere no banco local)
"""
import argparse
import json
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime

import pymysql

JSON_PATH = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\fluxo-financeiro\despesas_geral.json"

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")

CNPJ_MAP = {"CMPORT": "22761557000188", "TEC": "65756913000188"}
BANCO_MAP = {"CMPORT": 1, "TEC": 4}  # Itau (CMPORT) / Inter (CMPORT TEC) -- banco generico, ver docstring

CATEGORIA_DIVERSOS = 49       # "Diversos" -- usada pros "Nao classificado (revisar)"
CATEGORIA_CONTAS_FIXAS_DEFAULT = 42  # Agua/Luz, fallback se nenhuma palavra-chave bater


def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


# chaves normalizadas (sem acento) da subcategoria do JSON -> categoria_id do sistema
CATEGORIA_DIRETA = {
    normalizar("Aluguel"): 43,
    normalizar("Veículo — combustível"): 32,
    normalizar("Impostos/tributos da empresa"): 38,
    normalizar("Serviços de TI/sistemas/site"): 40,
    normalizar("Contabilidade"): 36,
    normalizar("Tarifa bancária"): 47,
    normalizar("Veículo — seguro"): 41,
    normalizar("Transporte urbano (Uber)"): 48,
    normalizar("Veículo — pedágio/zona azul"): 45,
    normalizar("Estacionamento em condomínio (operacional)"): 45,
    normalizar("Veículo — IPVA/licenciamento/multa"): 53,
    normalizar("Veículo — manutenção/oficina/acidente"): 54,
    normalizar("Veículo — garagem"): 55,
    normalizar("Cartão de crédito corporativo (fatura)"): 56,
    normalizar("Material de escritório/informática"): 57,
    normalizar("Material para condomínio (repassado)"): 58,
    normalizar("Repasse a zelador/síndico de condomínio cliente"): 59,
    normalizar("Acordos/dívidas/jurídico"): 60,
}
SUBCAT_NAO_CLASSIFICADO = normalizar("Não classificado (revisar)")
SUBCAT_CONTAS_FIXAS = normalizar("Contas fixas (água/luz/telefone/internet)")

# palavra-chave (normalizada) na descricao -> categoria_id, so' usado pra "Contas fixas"
CONTAS_FIXAS_KEYWORDS = [
    ("movel", 33),      # Celular (Vivo Movel)
    ("celular", 33),
    ("fixo", 34),        # Telefone/Fone (Vivo Fixo)
    ("telefone", 34),
    ("internet", 35),
    ("agua", 42),         # Agua/Luz
    ("luz", 42),
]


def resolver_categoria(subcategoria: str, descricao_normalizada: str) -> tuple[int, str]:
    """Retorna (categoria_id, observacao_extra)."""
    sub_norm = normalizar(subcategoria)
    if sub_norm == SUBCAT_NAO_CLASSIFICADO:
        return CATEGORIA_DIVERSOS, "MIGRACAO: revisar categoria (item nao classificado na planilha original)"
    if sub_norm == SUBCAT_CONTAS_FIXAS:
        desc_norm = normalizar(descricao_normalizada)
        for kw, cat_id in CONTAS_FIXAS_KEYWORDS:
            if kw in desc_norm:
                return cat_id, ""
        return CATEGORIA_CONTAS_FIXAS_DEFAULT, "MIGRACAO: subcategoria 'contas fixas' sem palavra-chave reconhecida, caiu em Agua/Luz por padrao"
    if sub_norm in CATEGORIA_DIRETA:
        return CATEGORIA_DIRETA[sub_norm], ""
    # nao deveria acontecer se o JSON so tiver as 20 subcategorias conhecidas
    return CATEGORIA_DIVERSOS, f"MIGRACAO: subcategoria '{subcategoria}' sem mapeamento -- caiu em Diversos"


def resolver_forma_pagamento(descricao: str) -> str:
    d = normalizar(descricao)
    if d.startswith("transf"):
        return "TRANSFERENCIA"
    return "PIX"


def conectar(ambiente: str):
    if ambiente == "local":
        return pymysql.connect(**LOCAL_DB)
    raise NotImplementedError("Ambiente 'producao' ainda nao implementado neste script -- rodar so depois de validar em local.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ambiente", choices=["local", "producao"], default="local")
    parser.add_argument("--aplicar", action="store_true", help="sem essa flag, so mostra o resumo (dry-run)")
    args = parser.parse_args()

    data = json.load(open(JSON_PATH, encoding="utf-8"))
    transacoes = data["transacoes"]

    conn = conectar(args.ambiente)
    cur = conn.cursor()

    resumo_categoria = Counter()
    resumo_valor_categoria = defaultdict(float)
    ja_existentes = 0
    inseridas = 0
    total_valor_inserido = 0.0
    avisos = []

    for t in transacoes:
        cnpj_label = t["cnpj"]
        cnpj = CNPJ_MAP[cnpj_label]
        banco_id = BANCO_MAP[cnpj_label]
        descricao = t["descricao_normalizada"] or t["descricao"]
        valor = round(abs(t["valor"]), 2)
        data_vencimento = t["vencto"]
        data_pagamento = t["pagto"] or t["vencto"]
        linha = t["linha_planilha"]
        id_externo = f"MIGRACAO-DESPESA-GERAL-{cnpj_label}-{linha}"
        forma_pagamento = resolver_forma_pagamento(descricao)

        categoria_id, obs_extra = resolver_categoria(t["subcategoria"], descricao)
        if obs_extra:
            avisos.append(f"linha {linha} ({cnpj_label}): {descricao[:60]} -> {obs_extra}")

        resumo_categoria[categoria_id] += 1
        resumo_valor_categoria[categoria_id] += valor

        cur.execute("SELECT id FROM fin_movimentacoes WHERE id_externo_banco = %s", (id_externo,))
        if cur.fetchone():
            ja_existentes += 1
            continue

        inseridas += 1
        total_valor_inserido += valor

        if not args.aplicar:
            continue

        observacao_mov = f"Migração histórica (Fase 6, planilha linha {linha})" + (f" — {obs_extra}" if obs_extra else "")

        cur.execute(
            """INSERT INTO fin_movimentacoes
               (data, descricao, valor, tipo, categoria_id, origem, status,
                id_externo_banco, observacao, banco_id, forma_pagamento)
               VALUES (%s,%s,%s,'SAIDA',%s,'MANUAL','VALIDADO',%s,%s,%s,%s)""",
            (data_pagamento, descricao, valor, categoria_id, id_externo, observacao_mov, banco_id, forma_pagamento),
        )
        movimentacao_id = cur.lastrowid

        observacao_despesa = f"Migração histórica (Fase 6, planilha linha {linha})" + (f" — {obs_extra}" if obs_extra else "")
        cur.execute(
            """INSERT INTO despesas
               (descricao, categoria_id, cnpj, tipo_pagamento, valor_total,
                total_parcelas, observacao, ativo)
               VALUES (%s,%s,%s,'UNICO',%s,1,%s,1)""",
            (descricao, categoria_id, cnpj, valor, observacao_despesa),
        )
        despesa_id = cur.lastrowid

        cur.execute(
            """INSERT INTO despesa_parcelas
               (despesa_id, numero_parcela, total_parcelas, valor, data_vencimento,
                status, data_pagamento, banco_id, forma_pagamento, movimentacao_id)
               VALUES (%s,1,1,%s,%s,'PAGO',%s,%s,%s,%s)""",
            (despesa_id, valor, data_vencimento, data_pagamento, banco_id, forma_pagamento, movimentacao_id),
        )

    if args.aplicar:
        conn.commit()
        print(f"APLICADO em '{args.ambiente}'.")
    else:
        print(f"DRY-RUN em '{args.ambiente}' -- nada foi gravado (use --aplicar pra gravar de verdade).")

    print(f"\nTotal de transações no JSON: {len(transacoes)}")
    print(f"Já existiam (id_externo_banco já cadastrado): {ja_existentes}")
    print(f"{'Inseridas' if args.aplicar else 'Seriam inseridas'}: {inseridas}")
    print(f"Valor total {'inserido' if args.aplicar else 'a inserir'}: R$ {total_valor_inserido:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    print(f"Valor total do JSON (referência): R$ {abs(data['total_valor']):,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))

    print("\n--- Resumo por categoria ---")
    cur.execute("SELECT id, nome FROM fin_categorias WHERE id IN %s", (tuple(resumo_categoria.keys()),))
    nomes = dict(cur.fetchall())
    for cat_id, qtd in sorted(resumo_categoria.items(), key=lambda x: -resumo_valor_categoria[x[0]]):
        nome = nomes.get(cat_id, f"id {cat_id}")
        print(f"  {qtd:3d}x  R$ {resumo_valor_categoria[cat_id]:>10,.2f}  {nome}".replace(",", "_").replace(".", ",").replace("_", "."))

    if avisos:
        print(f"\n--- Avisos ({len(avisos)}) ---")
        for a in avisos[:30]:
            print(" ", a)
        if len(avisos) > 30:
            print(f"  ... e mais {len(avisos) - 30}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
