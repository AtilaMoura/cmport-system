# -*- coding: utf-8 -*-
"""
Prepara os INSUMOS CONGELADOS da Fase D parte 2 (migração da folha histórica
Jan–Jul/2026) a partir de `mapa_folha_funcionarios.json` + `controle_funcionarios_2026_itens.csv`.

SOMENTE LEITURA de arquivos locais. Não conecta em banco, não altera nada.
Gera `fluxo-financeiro/folha_d2_input.json` — a lista EXATA do que o opencode
vai deletar / criar / recategorizar. O opencode NÃO decide nada: só executa
esta lista.

Uso: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/preparar_folha_d2.py
"""
import csv
import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


def _n(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()

BASE = Path(__file__).resolve().parent
MAPA = json.load((BASE / "mapa_folha_funcionarios.json").open(encoding="utf-8"))
OUT = BASE / "folha_d2_input.json"

LIMITE = "2026-07-31"   # "antes de agosto"
FUNCIONARIOS = {
    1: "André Moreira Rosa", 2: "Luis Antonio Melgarejo Neves",
    3: "Welligton Lucas Menezes Rodrigues", 4: "Pedro Henrique da Silva",
    5: "Fabiana Pedretti Moreira Rosa", 6: "Gabriel Moreira Pedretti",
    7: "Almira Moreira Rosa Salomão",
}

# --- 1. correções de cadastro (confirmadas contra a planilha Controle) --------
CADASTRO_CORRECOES = [
    {"funcionario_id": 2, "nome": "Luis Antonio Melgarejo Neves",
     "set": {"data_admissao": "2025-02-14"},
     "variaveis": {"adiantamento_tipo": "FIXO", "adiantamento_valor": 1680.50},
     "motivo": "planilha Controle: entrada 14.02.2025; adiantamento fixo -1.680,50/mês"},
    {"funcionario_id": 3, "nome": "Welligton Lucas Menezes Rodrigues",
     "set": {"data_admissao": "2024-07-08"},
     "variaveis": {"adiantamento_tipo": "FIXO", "adiantamento_valor": 1739.38},
     "motivo": "planilha Controle: entrada 08.07.2024; adiantamento fixo -1.739,38/mês"},
    {"funcionario_id": 4, "nome": "Pedro Henrique da Silva",
     "set": {"data_admissao": "2025-06-02"},
     "variaveis": {},
     "motivo": "planilha Controle: entrada 02.06.2025 (adiantamento FIXO 722 já está certo)"},
    {"funcionario_id": 7, "nome": "Almira Moreira Rosa Salomão",
     "set": {"data_admissao": "2026-03-23"},
     "variaveis": {},
     "motivo": "planilha Controle: 1º pagamento em abril ref. março; entrada 23.03.2026"},
]

# --- 2. o que SOFT-DELETAR (folha solta com pessoa, antes de agosto) ----------
# Exceções confirmadas com a cliente (03/09/2026) — NÃO remover:
#   despesa 296 = "Pix QUISI (Imposto de Renda - André)" R$ 220 — pagamento à
#     parte (IRRF do pró-labore do André), só não está na planilha FLUXO. Fica
#     como está em produção.
#   despesa 536 = "Emprestimo de Salario Fabiana..." R$ 9.000 (14/04) — cliente
#     confirmou que é CUSTO DA EMPRESA, não é folha, não tem devolução. Fica como
#     Despesa Geral (categoria 49 "Diversos", grupo DESPESA, funcionario_id NULL).
#     A DUPLICATA — mov órfã 637, mesmo valor/data/texto — CONTINUA na remoção.
REMOVER_EXCECOES = {("despesa_avulsa", 296), ("despesa_avulsa", 536)}
remover = []
for r in MAPA["folha_solta_com_pessoa"]:
    if (r["fonte"], r["id"]) in REMOVER_EXCECOES:
        continue
    if r["data"] and r["data"] <= LIMITE:
        remover.append({
            "fonte": r["fonte"],              # mov_orfa | despesa_avulsa
            "id": r["id"],
            "data": r["data"],
            "valor": r["valor"],
            "funcionario_id": r["funcionario_id"],
            "funcionario": r["funcionario"],
            "categoria_atual": r["categoria_atual"],
            "descricao": r["descricao"],
        })
remover.sort(key=lambda x: (x["fonte"], x["data"], x["id"]))

# --- 3. o que CRIAR (folha Jan–Jul a partir do despesas_funcionario.json) -----
# cruza com o Controle CSV pra marcar divergência (o total do funcionário/mês
# no contracheque vs a soma que vamos criar)
ctrl = defaultdict(float)
with (BASE / "controle_funcionarios_2026_itens.csv").open(encoding="utf-8-sig") as f:
    NOME2ID = {_n(v): k for k, v in FUNCIONARIOS.items()}
    NOME2ID[_n("Welligton Lucas Meneses Rodrigues")] = 3  # variação Meneses/Menezes
    for row in csv.DictReader(f, delimiter=";"):
        fid = NOME2ID.get(_n(row["funcionario"]))
        if fid:
            ctrl[(fid, int(row["mes"]))] += float(row["valor"].replace(",", "."))

criar = []
soma_criar = defaultdict(float)
for x in MAPA["mapa_json_fluxo"]:
    mm = (x["pagto"] or "")[:7]
    if not (x["funcionario_id"] and "2026-01" <= mm <= "2026-07"):
        continue
    reg = {
        "linha_planilha": x["linha_planilha"],
        "funcionario_id": x["funcionario_id"],
        "funcionario": x["funcionario"],
        "cnpj": x["cnpj"],                       # "CMPORT" | "TEC"  -> resolver p/ dígitos no script
        "categoria_id": x["categoria_nova_id"],
        "categoria": x["categoria_nova"],
        "valor": x["valor"],
        "data_pagamento": x["pagto"],
        "data_vencimento": x["pagto"],           # folha: vencto = pagto
        "descricao": x["descricao"],
        "tipo_pagamento": "UNICO",
        "banco_id": None,                        # entra no fluxo B1 de conferência de bancos
        "forma_pagamento": "PIX",
        "observacao": f"Migração folha histórica (Fase D2) — planilha linha {x['linha_planilha']}",
    }
    criar.append(reg)
    soma_criar[(x["funcionario_id"], int(mm[5:7]))] += x["valor"]

# adiantamento fixo conhecido por funcionário (planilha Controle)
ADIANT_FIXO = {2: 1680.50, 3: 1739.38, 4: 722.00}

# divergência contracheque(Controle) × soma a criar(JSON), por funcionário/mês
divergencias = []
for (fid, mes), s in sorted(soma_criar.items()):
    c = round(ctrl.get((fid, mes), 0.0), 2)
    s = round(s, 2)
    if abs(c - s) <= 0.02:
        continue
    dif = round(s - c, 2)
    if c == 0:
        tipo = "planilha Controle incompleta nesse mês — confirmar valores do JSON com a cliente"
    elif fid in ADIANT_FIXO and abs(dif - ADIANT_FIXO[fid]) < 60:
        tipo = "ESPERADA — diferença ≈ adiantamento pago à parte (JSON=caixa conta os 2 pagamentos; Controle=líquido)"
    elif 150 <= dif <= 2200:
        tipo = "provável adiantamento/VT pago à parte — cliente confirma o valor do adiantamento do mês"
    else:
        tipo = "INVESTIGAR com a cliente"
    divergencias.append({
        "funcionario_id": fid, "funcionario": FUNCIONARIOS[fid], "mes": mes,
        "controle_contracheque": c, "soma_json_a_criar": s, "diferenca": dif,
        "classificacao": tipo,
    })

# --- 4. o que RECATEGORIZAR (bucket-level antes de agosto) --------------------
CAT_LEGADA_PARA_NOVA = {
    "Salários": 95, "Adiantamento de Salário": 96, "Convênio": 102, "Amil": 102,
    "Impostos (FGTS/GPS/ISS)": 100, "GPS Funcionarios": 100, "FGTS Funcionarios": 100,
    "Sindical": 101, "Feria Funcionarios": 105, "Vale Transporte": 103,
}
recategorizar = []
for r in MAPA["folha_bucket_level"]:
    if r["data"] and r["data"] <= LIMITE:
        alvo = CAT_LEGADA_PARA_NOVA.get(r["categoria_atual"])
        recategorizar.append({
            "fonte": r["fonte"], "id": r["id"], "data": r["data"], "valor": r["valor"],
            "categoria_atual": r["categoria_atual"], "categoria_nova_id": alvo,
            "descricao": r["descricao"],
            "acao": "trocar categoria_id" if alvo else "REVISAR (sem alvo claro)",
        })

# --- 5. NÃO TOCAR (lista explícita de proteção) ------------------------------
nao_tocar = {
    "agosto_qualquer_coisa": "todo id com data em 2026-08 fica de fora desta migração",
    "falsos_positivos_ids": sorted(r["id"] for r in MAPA["falsos_positivos"]),
    "folha_sem_pessoa_ids": sorted(r["id"] for r in MAPA["folha_sem_pessoa"]),
    "parcelas_recorrentes": "as 23 despesas RECORRENTE com funcionario_id e suas parcelas — intocáveis",
    "bucket_pos_julho": "encargo/convênio de agosto+ — só recategorizar depois, fora daqui",
}

doc = {
    "gerado_por": "preparar_folha_d2.py",
    "escopo": "Fase D parte 2 — migração da folha histórica Jan–Jul/2026 (antes de agosto)",
    "limite_data": LIMITE,
    "resumo": {
        "cadastro_correcoes": len(CADASTRO_CORRECOES),
        "remover": len(remover),
        "remover_total_R$": round(sum(r["valor"] for r in remover), 2),
        "criar": len(criar),
        "criar_total_R$": round(sum(r["valor"] for r in criar), 2),
        "recategorizar": len(recategorizar),
        "divergencias_controle_x_json": len(divergencias),
    },
    "cadastro_correcoes": CADASTRO_CORRECOES,
    "remover": remover,
    "criar": criar,
    "recategorizar": recategorizar,
    "divergencias_controle_x_json": divergencias,
    "nao_tocar": nao_tocar,
}
OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"OK → {OUT.name}\n")
print(json.dumps(doc["resumo"], ensure_ascii=False, indent=2))
print("\nDIVERGÊNCIAS contracheque (Controle) × soma a criar (JSON) — vão pro doc de pendências:")
for d in divergencias:
    print(f"  {d['funcionario'][:24]:24} mês {d['mes']}:  Controle R$ {d['controle_contracheque']:>9,.2f}  "
          f"× JSON R$ {d['soma_json_a_criar']:>9,.2f}  (dif {d['diferenca']:+,.2f})")

print("\nREMOVER por mês:")
pm = defaultdict(lambda: [0, 0.0])
for r in remover:
    pm[r["data"][:7]][0] += 1
    pm[r["data"][:7]][1] += r["valor"]
for mm, (n, v) in sorted(pm.items()):
    print(f"  {mm}: {n:>2} registros  R$ {v:>10,.2f}")

print("\nCRIAR por mês:")
pm = defaultdict(lambda: [0, 0.0])
for r in criar:
    pm[r["data_pagamento"][:7]][0] += 1
    pm[r["data_pagamento"][:7]][1] += r["valor"]
for mm, (n, v) in sorted(pm.items()):
    print(f"  {mm}: {n:>2} lançamentos  R$ {v:>10,.2f}")
