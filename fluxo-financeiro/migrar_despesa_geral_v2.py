# -*- coding: utf-8 -*-
"""
V2 da migracao da Fase 6 (ver PLANO_DESPESA_GERAL.md e V1 em migrar_despesa_geral.py).

A V1 tratou TODO lancamento como pagamento UNICO ja pago. O Atila pediu pra
separar direito: coisas que se repetem todo mes (aluguel, contas fixas,
sistemas por assinatura) viram RECORRENTE; coisas pagas em N vezes de um
mesmo acordo/compra (cartao parcelado, seguro, IPVA, acordo advogado) viram
PARCELADO com o total de parcelas real (mesmo que a planilha so tenha
capturado algumas) -- o que falta vira parcela PENDENTE, continuando a
cadencia mensal a partir da ultima parcela conhecida. O resto continua UNICO
ja pago, igual a V1.

Regras de classificacao (decididas com o Atila em 24/08/2026):
- RECORRENTE: familias com repeticao mensal clara (aluguel, celular, fixo,
  agua, luz, internet, sistemas por assinatura, contabilidade mensal).
  "Bem Mais Familiar"/"Berazil Medicina" NAO existem nesse JSON (sao
  beneficio de funcionario, ficam pro despesas_funcionario.json).
- PARCELADO: series com rotulo NN/DD explicito e denominador confiavel
  (Advogado Renatinho, Seguro Moto, IPVA Palio/Fiesta, Acordo Andre Porto,
  cartoes Clebinho/Armarinhos -- esses ultimos divididos em sub-series por
  denominador, ja que um mesmo cartao pode ter varias compras parceladas
  concorrentes). Rotulos "01/01" (parcela unica) viram UNICO, nao parcelado.
  Series com denominador inconsistente entre as proprias parcelas (ex: Pix
  Moya Acordo, que tem uma "01//05" e outra "02/10") ficam UNICO -- os dados
  se contradizem, nao da pra confiar num total.
- Zona Azul, Uber, Tarifa Boleto Inter: valor variando toda vez, muitos
  eventos por mes -- ficam UNICO cada lancamento (RECORRENTE so aceita 1
  valor fixo repetido, nao serve pra isso).
- Parcelas que faltam (ex: 8 de 10) viram PENDENTE, com data continuando a
  cadencia mensal (mesmo dia do mes da ultima parcela conhecida) e valor
  igual a media das parcelas conhecidas daquela serie -- nao e o valor real
  (nao temos como saber), e' so' uma estimativa pra nao deixar o campo vazio.

Idempotente por reinicio: ao rodar com --aplicar, primeiro APAGA tudo que a
V1 (ou uma rodada anterior da V2) inseriu (fin_movimentacoes com
id_externo_banco LIKE 'MIGRACAO-DESPESA-GERAL-%' + despesas com observacao
comecando com 'Migracao historica') antes de re-inserir do zero -- assim
pode rodar quantas vezes precisar sem duplicar nem misturar V1 com V2.

Uso:
    cd backend && venv\\Scripts\\python.exe ..\\fluxo-financeiro\\migrar_despesa_geral_v2.py
        --ambiente local            (dry-run por padrao, so mostra resumo)
        --ambiente local --aplicar  (apaga a migracao anterior e insere a V2 de verdade)
"""
import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, timedelta

import pymysql

JSON_PATH = r"C:\Users\amand\OneDrive\Documentos\CMport\cmport-system\fluxo-financeiro\despesas_geral.json"

LOCAL_DB = dict(host="localhost", port=3306, user="root", password="cmport2026",
                database="cmport_gerenciamento", charset="utf8mb4")

CNPJ_MAP = {"CMPORT": "22761557000188", "TEC": "65756913000188"}
BANCO_MAP = {"CMPORT": 1, "TEC": 4}  # Itau (CMPORT) / Inter (CMPORT TEC) -- banco generico

CATEGORIA_DIVERSOS = 49
CATEGORIA_CONTAS_FIXAS_DEFAULT = 42

CATEGORIA_DIRETA_UNICO = {
    "aluguel": 43,
    "veiculo - combustivel": 32,
    "impostos/tributos da empresa": 38,
    "servicos de ti/sistemas/site": 40,
    "contabilidade": 36,
    "tarifa bancaria": 47,
    "veiculo - seguro": 41,
    "transporte urbano (uber)": 48,
    "veiculo - pedagio/zona azul": 45,
    "estacionamento em condominio (operacional)": 45,
    "veiculo - ipva/licenciamento/multa": 53,
    "veiculo - manutencao/oficina/acidente": 54,
    "veiculo - garagem": 55,
    "cartao de credito corporativo (fatura)": 56,
    "material de escritorio/informatica": 57,
    "material para condominio (repassado)": 58,
    "repasse a zelador/sindico de condominio cliente": 59,
    "acordos/dividas/juridico": 60,
}
CONTAS_FIXAS_KEYWORDS = [
    ("movel", 33), ("celular", 33), ("fixo", 34), ("telefone", 34),
    ("internet", 35), ("agua", 42), ("luz", 42),
]


def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("—", "-").replace("–", "-")  # travessao/em-dash -> hifen comum
    return s.lower().strip()


def data_valida(vencto: str, pagto: str) -> str:
    """Corrige typo de ano na planilha (ex: vencto='2006-06-26' com pagto='2026-06-26')."""
    ano_v = int(vencto[:4])
    if ano_v < 2020 and pagto:
        return pagto
    return vencto


def add_meses(d: date, n: int) -> date:
    mes = d.month - 1 + n
    ano = d.year + mes // 12
    mes = mes % 12 + 1
    dia = min(d.day, 28)  # dia_vencimento do sistema so aceita 1-28 pra RECORRENTE; pra parcelas soltas nao ha essa trava, mas mantem consistente
    return date(ano, mes, dia)


# ── RECORRENTE: (nome, cnpj, prefixo_normalizado, categoria_id) ──
RECORRENTE_GRUPOS = [
    ("Aluguel Andre/Fabiana", "CMPORT", "aluguel andre/fabiana", 43),
    ("Aluguel Escritorio", "CMPORT", "aluguel escritorio", 43),
    ("Vivo Movel", "CMPORT", "vivo movel", 33),
    ("Vivo Fixo", "CMPORT", "vivo fixo", 34),
    ("Auvo Sistema", "CMPORT", "auvo sistema", 40),
    ("Quero Faturar Sistemas", "CMPORT", "quero faturar sistemas", 40),
    ("Quero Faturar Sistemas TEC", "TEC", "quero faturar sistemas", 40),
    ("Quisi Contabilidade", "CMPORT", "quisi contabilidade", 36),
    ("Quisi Contabilidade TEC", "TEC", "quisi contabilidade", 36),
    ("Conta de Luz", "CMPORT", "conta de luz", 42),
    ("Conta de Agua", "CMPORT", "conta de agua", 42),
    ("Conta de Internet", "CMPORT", "conta de internet", 35),
    ("JLA Servicos Prestados", "CMPORT", "jla servicos prestados", 40),
    ("Atila Sistemas TEC", "TEC", "atila (sistemas + manutencao)", 40),
]

# ── PARCELADO simples: (nome, cnpj, prefixo_normalizado, categoria_id) -- 1 serie so ──
PARCELADO_GRUPOS_SIMPLES = [
    ("Advogado Renatinho Acordo", "CMPORT", "advogado renatinho acordo", 60),
    ("Seguro Moto", "CMPORT", "seguro moto", 41),
    ("IPVA Carro Fiesta", "CMPORT", "ipva carro fiesta", 53),
    ("Acordo Andre Porto", "CMPORT", "acordo andre porto", 60),
]
# IPVA Carro Palio: 2 rotulos de descricao (typo "02''/05") apontam pra mesma serie
IPVA_PALIO_PREFIXOS = ["ipva carro palio mvz9i72"]

# Cartao: divide em sub-series por denominador (uma compra parcelada != outra)
CARTAO_GRUPOS = [
    ("Cartao Clebinho", "CMPORT", "cartao clebinho", 56),
    ("Cartao Armarinhos", "CMPORT", "armarinhos fern", 56),  # cobre "Fernades" e "Fernandes"
]


def parse_parcela(campo: str):
    """'02/10' -> (2, 10). Retorna None se nao parsear limpo."""
    if not campo:
        return None
    m = re.match(r"^0*(\d+)\s*/+\s*0*(\d+)$", campo.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def montar_parcelado(nome, cnpj_label, categoria_id, itens, total_parcelas):
    """Monta a estrutura de uma despesa PARCELADO a partir dos itens encontrados
    (ja ordenados por data), preenchendo o que falta como PENDENTE."""
    itens = sorted(itens, key=lambda x: x["vencto"])
    valores = [abs(x["valor"]) for x in itens]
    valor_medio = round(sum(valores) / len(valores), 2) if valores else 0

    parcelas = []
    for i, item in enumerate(itens, start=1):
        parcelas.append({
            "numero_parcela": i, "valor": round(abs(item["valor"]), 2),
            "data_vencimento": data_valida(item["vencto"], item["pagto"]),
            "data_pagamento": item["pagto"] or item["vencto"],
            "status": "PAGO", "linha_planilha": item["linha_planilha"],
        })

    faltam = total_parcelas - len(itens)
    if faltam > 0:
        ultima_data = date.fromisoformat(parcelas[-1]["data_vencimento"])
        for i in range(faltam):
            nova_data = add_meses(ultima_data, i + 1)
            parcelas.append({
                "numero_parcela": len(itens) + i + 1, "valor": valor_medio,
                "data_vencimento": nova_data.isoformat(), "data_pagamento": None,
                "status": "PENDENTE", "linha_planilha": None,
            })

    return {
        "nome": nome, "cnpj_label": cnpj_label, "categoria_id": categoria_id,
        "total_parcelas": total_parcelas, "encontradas": len(itens),
        "parcelas": parcelas,
    }


def montar_recorrente(nome, cnpj_label, categoria_id, itens):
    itens = sorted(itens, key=lambda x: x["vencto"])
    parcelas = []
    for i, item in enumerate(itens, start=1):
        vencto_corrigido = data_valida(item["vencto"], item["pagto"])
        parcelas.append({
            "numero_parcela": i, "valor": round(abs(item["valor"]), 2),
            "data_vencimento": vencto_corrigido,
            "data_pagamento": item["pagto"] or item["vencto"],
            "status": "PAGO", "linha_planilha": item["linha_planilha"],
        })
    ultimo_dia = min(date.fromisoformat(parcelas[-1]["data_vencimento"]).day, 28)
    valor_atual = parcelas[-1]["valor"]
    return {
        "nome": nome, "cnpj_label": cnpj_label, "categoria_id": categoria_id,
        "dia_vencimento": ultimo_dia, "valor_atual": valor_atual,
        "parcelas": parcelas,
    }


def classificar(transacoes):
    """Retorna (recorrentes[], parcelados[], unicos[]) -- cada transacao vai pra so um bucket."""
    usados = set()  # ids (linha_planilha, cnpj) ja alocados pra recorrente/parcelado
    recorrentes = []
    parcelados = []

    def chave(t):
        return (t["linha_planilha"], t["cnpj"])

    # 1) RECORRENTE
    for nome, cnpj_label, prefixo, categoria_id in RECORRENTE_GRUPOS:
        itens = [t for t in transacoes if t["cnpj"] == cnpj_label
                 and normalizar(t["descricao_normalizada"]).startswith(prefixo)
                 and chave(t) not in usados]
        if not itens:
            continue
        for t in itens:
            usados.add(chave(t))
        recorrentes.append(montar_recorrente(nome, cnpj_label, categoria_id, itens))

    # 2) PARCELADO simples (1 serie por familia)
    for nome, cnpj_label, prefixo, categoria_id in PARCELADO_GRUPOS_SIMPLES:
        itens = [t for t in transacoes if t["cnpj"] == cnpj_label
                 and normalizar(t["descricao_normalizada"]).startswith(prefixo)
                 and chave(t) not in usados]
        if not itens:
            continue
        denominadores = [parse_parcela(t["parcela"])[1] for t in itens if parse_parcela(t["parcela"])]
        total = max(max(denominadores), len(itens)) if denominadores else len(itens)
        for t in itens:
            usados.add(chave(t))
        parcelados.append(montar_parcelado(nome, cnpj_label, categoria_id, itens, total))

    # 2b) IPVA Carro Palio (funde variante com typo na descricao)
    itens = [t for t in transacoes if t["cnpj"] == "CMPORT"
             and any(normalizar(t["descricao_normalizada"]).startswith(p) for p in IPVA_PALIO_PREFIXOS)
             and chave(t) not in usados]
    if itens:
        denominadores = [parse_parcela(t["parcela"])[1] for t in itens if parse_parcela(t["parcela"])]
        total = max(max(denominadores), len(itens)) if denominadores else len(itens)
        for t in itens:
            usados.add(chave(t))
        parcelados.append(montar_parcelado("IPVA Carro Palio MVZ9I72", "CMPORT", 53, itens, total))

    # 3) Cartoes -- divide por denominador (cada denominador = 1 compra parcelada distinta;
    #    "01/01" nao e parcelado de verdade, fica pro bucket UNICO)
    for nome, cnpj_label, prefixo, categoria_id in CARTAO_GRUPOS:
        itens = [t for t in transacoes if t["cnpj"] == cnpj_label
                 and prefixo in normalizar(t["descricao_normalizada"])
                 and chave(t) not in usados]
        por_denom = defaultdict(list)
        for t in itens:
            p = parse_parcela(t["parcela"])
            if p and p[1] > 1:
                por_denom[p[1]].append(t)
        for denom, sub_itens in por_denom.items():
            for t in sub_itens:
                usados.add(chave(t))
            total_final = max(denom, len(sub_itens))
            parcelados.append(montar_parcelado(f"{nome} ({denom}x)", cnpj_label, categoria_id, sub_itens, total_final))

    unicos = [t for t in transacoes if chave(t) not in usados]
    return recorrentes, parcelados, unicos


def resolver_categoria_unico(subcategoria: str, descricao_normalizada: str):
    sub_norm = normalizar(subcategoria)
    if sub_norm == normalizar("Não classificado (revisar)"):
        return CATEGORIA_DIVERSOS, "MIGRACAO: revisar categoria (item nao classificado na planilha original)"
    if sub_norm == normalizar("Contas fixas (água/luz/telefone/internet)"):
        desc_norm = normalizar(descricao_normalizada)
        for kw, cat_id in CONTAS_FIXAS_KEYWORDS:
            if kw in desc_norm:
                return cat_id, ""
        return CATEGORIA_CONTAS_FIXAS_DEFAULT, "MIGRACAO: subcategoria 'contas fixas' sem palavra-chave reconhecida"
    if sub_norm in CATEGORIA_DIRETA_UNICO:
        return CATEGORIA_DIRETA_UNICO[sub_norm], ""
    return CATEGORIA_DIVERSOS, f"MIGRACAO: subcategoria '{subcategoria}' sem mapeamento -- caiu em Diversos"


def resolver_forma_pagamento(descricao: str) -> str:
    return "TRANSFERENCIA" if normalizar(descricao).startswith("transf") else "PIX"


def limpar_migracao_anterior(cur):
    cur.execute("SELECT id FROM despesas WHERE observacao LIKE 'Migra%histórica%' OR observacao LIKE 'Migra%historica%'")
    ids = [r[0] for r in cur.fetchall()]
    if not ids:
        return 0, 0
    formato = ",".join(["%s"] * len(ids))
    cur.execute(f"SELECT movimentacao_id FROM despesa_parcelas WHERE despesa_id IN ({formato}) AND movimentacao_id IS NOT NULL", ids)
    mov_ids = [r[0] for r in cur.fetchall()]
    if mov_ids:
        formato_mov = ",".join(["%s"] * len(mov_ids))
        cur.execute(f"DELETE FROM fin_movimentacoes WHERE id IN ({formato_mov})", mov_ids)
    cur.execute(f"DELETE FROM despesa_parcelas WHERE despesa_id IN ({formato})", ids)
    cur.execute(f"DELETE FROM despesas WHERE id IN ({formato})", ids)
    # sobra de seguranca: qualquer movimentacao migrada que nao tenha sido pega acima
    cur.execute("DELETE FROM fin_movimentacoes WHERE id_externo_banco LIKE 'MIGRACAO-DESPESA-GERAL-%'")
    return len(ids), len(mov_ids)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ambiente", choices=["local"], default="local")
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    data = json.load(open(JSON_PATH, encoding="utf-8"))
    transacoes = data["transacoes"]

    recorrentes, parcelados, unicos = classificar(transacoes)

    print(f"=== Classificacao ===")
    print(f"RECORRENTE: {len(recorrentes)} despesas, {sum(len(r['parcelas']) for r in recorrentes)} parcelas historicas")
    for r in recorrentes:
        print(f"  [{r['cnpj_label']}] {r['nome']}: {len(r['parcelas'])} parcelas ja pagas, dia_vencimento={r['dia_vencimento']}")
    print(f"\nPARCELADO: {len(parcelados)} despesas")
    for p in parcelados:
        faltam = p["total_parcelas"] - p["encontradas"]
        print(f"  [{p['cnpj_label']}] {p['nome']}: {p['encontradas']}/{p['total_parcelas']} pagas" + (f", {faltam} pendente(s)" if faltam else ""))
    print(f"\nUNICO: {len(unicos)} lancamentos (igual V1)")

    total_geral = (sum(sum(x["valor"] for x in r["parcelas"] if x["status"] == "PAGO") for r in recorrentes)
                   + sum(sum(x["valor"] for x in p["parcelas"] if x["status"] == "PAGO") for p in parcelados)
                   + sum(abs(t["valor"]) for t in unicos))
    print(f"\nTotal PAGO (recorrente+parcelado+unico): R$ {total_geral:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    print(f"Total do JSON (referencia): R$ {abs(data['total_valor']):,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))

    if not args.aplicar:
        print("\nDRY-RUN -- nada foi gravado (use --aplicar pra gravar de verdade).")
        return

    conn = pymysql.connect(**LOCAL_DB)
    cur = conn.cursor()

    n_desp, n_mov = limpar_migracao_anterior(cur)
    print(f"\nMigracao anterior removida: {n_desp} despesas, {n_mov} movimentacoes.")

    def inserir_movimentacao(descricao, valor, data_pag, categoria_id, banco_id, forma_pagamento, id_externo, observacao):
        cur.execute(
            """INSERT INTO fin_movimentacoes
               (data, descricao, valor, tipo, categoria_id, origem, status,
                id_externo_banco, observacao, banco_id, forma_pagamento)
               VALUES (%s,%s,%s,'SAIDA',%s,'MANUAL','VALIDADO',%s,%s,%s,%s)""",
            (data_pag, descricao, valor, categoria_id, id_externo, observacao, banco_id, forma_pagamento),
        )
        return cur.lastrowid

    # RECORRENTE
    for r in recorrentes:
        cnpj = CNPJ_MAP[r["cnpj_label"]]
        banco_id = BANCO_MAP[r["cnpj_label"]]
        cur.execute(
            """INSERT INTO despesas (descricao, categoria_id, cnpj, tipo_pagamento, valor_total,
                total_parcelas, dia_vencimento, observacao, ativo)
               VALUES (%s,%s,%s,'RECORRENTE',%s,0,%s,%s,1)""",
            (r["nome"], r["categoria_id"], cnpj, r["valor_atual"], r["dia_vencimento"],
             "Migração histórica (Fase 6 V2) — recorrente"),
        )
        despesa_id = cur.lastrowid
        for p in r["parcelas"]:
            id_externo = f"MIGRACAO-DESPESA-GERAL-REC-{r['cnpj_label']}-{p['linha_planilha']}"
            forma = resolver_forma_pagamento(r["nome"])
            mov_id = inserir_movimentacao(r["nome"], p["valor"], p["data_pagamento"], r["categoria_id"],
                                           banco_id, forma, id_externo,
                                           "Migração histórica (Fase 6 V2, recorrente)")
            cur.execute(
                """INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor,
                    data_vencimento, status, data_pagamento, banco_id, forma_pagamento, movimentacao_id)
                   VALUES (%s,%s,0,%s,%s,'PAGO',%s,%s,%s,%s)""",
                (despesa_id, p["numero_parcela"], p["valor"], p["data_vencimento"],
                 p["data_pagamento"], banco_id, forma, mov_id),
            )

    # PARCELADO
    for pd in parcelados:
        cnpj = CNPJ_MAP[pd["cnpj_label"]]
        banco_id = BANCO_MAP[pd["cnpj_label"]]
        valor_total = sum(x["valor"] for x in pd["parcelas"])
        faltam = pd["total_parcelas"] - pd["encontradas"]
        obs = "Migração histórica (Fase 6 V2) — parcelado"
        if faltam:
            obs += f" — {faltam} parcela(s) da série original não encontrada(s) na planilha, criada(s) como PENDENTE (data/valor estimados)"
        cur.execute(
            """INSERT INTO despesas (descricao, categoria_id, cnpj, tipo_pagamento, valor_total,
                total_parcelas, observacao, ativo)
               VALUES (%s,%s,%s,'PARCELADO',%s,%s,%s,1)""",
            (pd["nome"], pd["categoria_id"], cnpj, valor_total, pd["total_parcelas"], obs),
        )
        despesa_id = cur.lastrowid
        for p in pd["parcelas"]:
            forma = resolver_forma_pagamento(pd["nome"])
            if p["status"] == "PAGO":
                id_externo = f"MIGRACAO-DESPESA-GERAL-PARC-{pd['cnpj_label']}-{p['linha_planilha']}"
                mov_id = inserir_movimentacao(pd["nome"], p["valor"], p["data_pagamento"], pd["categoria_id"],
                                               banco_id, forma, id_externo,
                                               "Migração histórica (Fase 6 V2, parcelado)")
                cur.execute(
                    """INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor,
                        data_vencimento, status, data_pagamento, banco_id, forma_pagamento, movimentacao_id)
                       VALUES (%s,%s,%s,%s,%s,'PAGO',%s,%s,%s,%s)""",
                    (despesa_id, p["numero_parcela"], pd["total_parcelas"], p["valor"], p["data_vencimento"],
                     p["data_pagamento"], banco_id, forma, mov_id),
                )
            else:
                cur.execute(
                    """INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor,
                        data_vencimento, status)
                       VALUES (%s,%s,%s,%s,%s,'PENDENTE')""",
                    (despesa_id, p["numero_parcela"], pd["total_parcelas"], p["valor"], p["data_vencimento"]),
                )

    # UNICO (igual V1)
    resumo_categoria = Counter()
    resumo_valor_categoria = defaultdict(float)
    for t in unicos:
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
        categoria_id, obs_extra = resolver_categoria_unico(t["subcategoria"], descricao)
        resumo_categoria[categoria_id] += 1
        resumo_valor_categoria[categoria_id] += valor

        observacao = "Migração histórica (Fase 6 V2)" + (f" — {obs_extra}" if obs_extra else "")
        mov_id = inserir_movimentacao(descricao, valor, data_pagamento, categoria_id, banco_id, forma_pagamento,
                                       id_externo, observacao)
        cur.execute(
            """INSERT INTO despesas (descricao, categoria_id, cnpj, tipo_pagamento, valor_total,
                total_parcelas, observacao, ativo)
               VALUES (%s,%s,%s,'UNICO',%s,1,%s,1)""",
            (descricao, categoria_id, cnpj, valor, observacao),
        )
        despesa_id = cur.lastrowid
        cur.execute(
            """INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor,
                data_vencimento, status, data_pagamento, banco_id, forma_pagamento, movimentacao_id)
               VALUES (%s,1,1,%s,%s,'PAGO',%s,%s,%s,%s)""",
            (despesa_id, valor, data_vencimento, data_pagamento, banco_id, forma_pagamento, mov_id),
        )

    conn.commit()
    print("\nAPLICADO.")

    cur.execute("SELECT COUNT(*), COALESCE(SUM(valor),0) FROM fin_movimentacoes WHERE id_externo_banco LIKE 'MIGRACAO-DESPESA-GERAL-%'")
    n, soma = cur.fetchone()
    print(f"Movimentacoes migradas (total): {n}, soma R$ {soma}")
    cur.execute("SELECT COUNT(*) FROM despesa_parcelas dp JOIN despesas d ON d.id=dp.despesa_id WHERE d.observacao LIKE 'Migra%'")
    print(f"Parcelas migradas (total, inclui PENDENTE): {cur.fetchone()[0]}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
