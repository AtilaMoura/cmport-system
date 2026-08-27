"""Agrupa os lancamentos brutos de 'Despesas Escritorio' em series de parcelas
(ex.: janeiro 01/03, fevereiro 02/03, marco 03/03 -> um unico item com o total),
gera o JSON final por categoria/variavel e um MD com as pendencias/observacoes
que precisam de revisao manual (series incompletas, inconsistentes, etc.)."""
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime

MESES = {
    "JANEIRO": 1, "FEVEREIRO": 2, "MARCO": 3, "MARÇO": 3, "ABRIL": 4, "MAIO": 5,
    "JUNHO": 6, "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9, "OUTUBRO": 10,
    "NOVEMBRO": 11, "DEZEMBRO": 12,
}

PARCELA_RE = re.compile(r"^(\d{2})/(\d{2})$")


def normaliza_desc(desc: str) -> str:
    s = desc.strip()
    # remove padrao "NN/NN" ou "NN e NN" ou "N e N" colado no final da descricao
    s = re.sub(r"\s*-?\s*\d{1,2}\s*(/|e)\s*\d{1,2}\s*$", "", s)
    # remove padrao "Nº/Nª parcela" no meio/inicio (ex.: "PRL 1ª parcela - Fulano")
    s = re.sub(r"\d+[ªº]\s*(e\s*\d+[ªº]\s*)?parcela\s*-?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s{2,}", " ", s).strip()
    s2 = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return s2.lower().strip()


def mes_do_bloco(bloco: str) -> int | None:
    bloco_up = bloco.upper()
    for nome, num in MESES.items():
        if nome in bloco_up.replace("�", "C") or nome[:4] in bloco_up:
            return num
    return None


def main():
    data = json.load(open("fluxo-financeiro/despesas_brutas.json", encoding="utf-8"))

    for d in data:
        d["_mes_bloco_num"] = mes_do_bloco(d["bloco_mes"] or "")
        p = d["parcela"]
        m = PARCELA_RE.match(p) if isinstance(p, str) else None
        d["_parcela_num"] = int(m.group(1)) if m else None
        d["_parcela_den"] = int(m.group(2)) if m else None
        d["_desc_norm"] = normaliza_desc(d["descricao"])

    unicas = [d for d in data if d["_parcela_den"] in (None, 1)]
    recorrentes_12 = [d for d in data if d["_parcela_den"] == 12]
    candidatos_parcela = [d for d in data if d["_parcela_den"] not in (None, 1, 12)]
    formato_invalido = [d for d in data if isinstance(d["parcela"], str) and not PARCELA_RE.match(d["parcela"])]

    # agrupa candidatos por cnpj + categoria + descricao normalizada + denominador
    grupos = defaultdict(list)
    for d in candidatos_parcela:
        chave = (d["cnpj"], d["_desc_norm"], d["_parcela_den"])
        grupos[chave].append(d)

    series_completas = []
    series_incompletas = []

    for (cnpj, desc_norm, den), itens in grupos.items():
        itens.sort(key=lambda x: (x["_mes_bloco_num"] or 0, x["_parcela_num"] or 0))
        numeros = [i["_parcela_num"] for i in itens]
        esperado = list(range(1, den + 1))
        completa = (
            len(itens) == den
            and sorted(numeros) == esperado
            and len(set(numeros)) == len(numeros)
        )
        registro = {
            "cnpj": cnpj,
            "descricao_base": itens[0]["descricao"],
            "descricao_normalizada": desc_norm,
            "categoria": itens[0]["categoria"],
            "total_parcelas": den,
            "parcelas_encontradas": len(itens),
            "valor_total": round(sum(float(i["pagos"] or 0) for i in itens), 2),
            "primeiro_pagto": min((i["pagto"] for i in itens if i["pagto"]), default=None),
            "ultimo_pagto": max((i["pagto"] for i in itens if i["pagto"]), default=None),
            "itens": [
                {
                    "linha_planilha": i["linha_planilha"],
                    "parcela": i["parcela"],
                    "descricao_original": i["descricao"],
                    "pagto": i["pagto"],
                    "vencto": i["vencto"],
                    "pagos": i["pagos"],
                    "valor": i["valor"],
                }
                for i in itens
            ],
        }
        if completa:
            series_completas.append(registro)
        else:
            motivos = []
            if len(itens) != den:
                motivos.append(f"encontradas {len(itens)} de {den} parcelas esperadas")
            if sorted(numeros) != esperado:
                motivos.append(f"numeros de parcela nao batem com 1..{den}: {sorted(numeros)}")
            if len(set(numeros)) != len(numeros):
                motivos.append(f"numero de parcela duplicado: {numeros}")
            registro["motivo_pendencia"] = "; ".join(motivos)
            series_incompletas.append(registro)

    # ---- JSON final ----
    saida = {
        "gerado_em": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "fonte": [
            "docs-e-planilhas/FLUXO FINANCEIRO - 2026.xlsx (CMPORT)",
            "docs-e-planilhas/FLUXO FINANCEIRO CMPORT TEC - 2026.xlsx (TEC)",
        ],
        "periodo": "Janeiro/2026 ate o ultimo mes disponivel em cada planilha",
        "schema_variaveis": {
            "descricao": "Texto livre do lancamento (usado como CONDOMINIO na planilha, mas para despesas de escritorio funciona como descricao do gasto)",
            "categoria": "Sempre 'Escritorio' nesta secao da planilha",
            "nf": "Numero da nota fiscal, quase sempre vazio em despesas de escritorio",
            "parcela": "Formato NN/NN = numero da parcela / total de parcelas. NN/01 = pagamento unico. NN/12 = recorrencia mensal (ex.: tarifa bancaria, aluguel), NAO e parcela de uma mesma compra.",
            "pagto": "Data em que o pagamento foi efetivamente feito",
            "vencto": "Data de vencimento do pagamento",
            "pagos": "Valor efetivamente pago (negativo = saida)",
            "valor": "Valor total do lancamento (normalmente igual a 'pagos')",
            "cnpj": "Qual CNPJ/planilha essa despesa pertence: CMPORT ou TEC",
        },
        "categorias": {
            "escritorio": {
                "descricao": "Despesas Escritorio (salarios, aluguel, tarifas bancarias, combustivel, seguros, acordos, etc.)",
                "pagamentos_unicos": len(unicas),
                "recorrentes_mensais_ate12x": len(recorrentes_12),
                "series_de_parcela_completas": len(series_completas),
                "series_de_parcela_com_pendencia": len(series_incompletas),
            }
        },
        "pagamentos_unicos": [
            {
                "cnpj": d["cnpj"], "descricao": d["descricao"], "nf": d["nf"],
                "pagto": d["pagto"], "vencto": d["vencto"], "pagos": d["pagos"],
                "valor": d["valor"], "linha_planilha": d["linha_planilha"],
            }
            for d in unicas
        ],
        "recorrentes_mensais": [
            {
                "cnpj": d["cnpj"], "descricao": d["descricao"], "parcela": d["parcela"],
                "pagto": d["pagto"], "vencto": d["vencto"], "pagos": d["pagos"],
                "valor": d["valor"], "linha_planilha": d["linha_planilha"],
            }
            for d in recorrentes_12
        ],
        "series_de_parcela_agrupadas": series_completas,
        "series_de_parcela_pendentes_revisao": series_incompletas,
    }

    with open("fluxo-financeiro/despesas_completo.json", "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=2)

    # ---- MD de observacoes/pendencias ----
    linhas = []
    linhas.append("# Observações — Reestruturação de Despesas (planilha → sistema)\n")
    linhas.append(f"_Gerado em {saida['gerado_em']}_\n")
    linhas.append("\n## Resumo\n")
    linhas.append(f"- Lançamentos com pagamento único (NN/01): **{len(unicas)}**")
    linhas.append(f"- Lançamentos recorrentes mensais (NN/12 — tarifa, aluguel, salário etc., **não são parcelas de uma mesma compra**): **{len(recorrentes_12)}**")
    linhas.append(f"- Séries de parcela identificadas e agrupadas com sucesso (1..N sequencial, sem furos): **{len(series_completas)}**")
    linhas.append(f"- Séries de parcela com pendência (precisam de revisão manual): **{len(series_incompletas)}**")
    if formato_invalido:
        linhas.append(f"- Lançamentos com campo 'parcela' em formato inesperado: **{len(formato_invalido)}**")
    linhas.append("")

    linhas.append("## ⚠️ Convenção NN/12 identificada")
    linhas.append(
        "A maioria dos lançamentos com denominador `12` (ex.: `01/12`, `02/12`...) **não é uma parcela de uma "
        "compra única** — é uma marcação de mês do ano para itens recorrentes (tarifa bancária, aluguel, salário, "
        "etc.), com valores diferentes a cada mês. Por isso eles **não foram somados/agrupados** — cada mês continua "
        "como um lançamento de despesa independente. Se algum desses `NN/12` for na verdade uma parcela real de "
        "compra única, me avise qual para eu corrigir o agrupamento."
    )
    linhas.append("")

    if formato_invalido:
        linhas.append("## Formato de parcela inesperado")
        for d in formato_invalido:
            linhas.append(f"- linha {d['linha_planilha']} ({d['cnpj']}, {d['bloco_mes']}): parcela=`{d['parcela']}` | descrição: {d['descricao']}")
        linhas.append("")

    linhas.append("## Séries de parcela COM pendência (revisar antes de importar)\n")
    for s in series_incompletas:
        linhas.append(f"### {s['descricao_base']} ({s['cnpj']}) — {s['total_parcelas']}x")
        linhas.append(f"- Motivo: {s['motivo_pendencia']}")
        linhas.append(f"- Valor total encontrado: R$ {s['valor_total']}")
        linhas.append(f"- Período: {s['primeiro_pagto']} até {s['ultimo_pagto']}")
        for it in s["itens"]:
            linhas.append(f"  - linha {it['linha_planilha']}: parcela `{it['parcela']}` | {it['pagto']} | R$ {it['pagos']} | \"{it['descricao_original']}\"")
        linhas.append("")

    linhas.append("## Séries de parcela agrupadas com sucesso (conferir se o total bate)\n")
    for s in series_completas:
        linhas.append(f"- **{s['descricao_base']}** ({s['cnpj']}) — {s['total_parcelas']}x — total R$ {s['valor_total']} — {s['primeiro_pagto']} até {s['ultimo_pagto']}")
    linhas.append("")

    with open("fluxo-financeiro/OBSERVACOES_DESPESAS.md", "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    print("JSON final:", "fluxo-financeiro/despesas_completo.json")
    print("MD observacoes:", "fluxo-financeiro/OBSERVACOES_DESPESAS.md")
    print()
    print("unicos:", len(unicas), "| recorrentes_12:", len(recorrentes_12),
          "| series completas:", len(series_completas), "| series pendentes:", len(series_incompletas),
          "| formato invalido:", len(formato_invalido))


if __name__ == "__main__":
    main()
