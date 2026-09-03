# -*- coding: utf-8 -*-
"""
Prepara os INSUMOS da migração da folha de AGOSTO/2026 (pendência C).

Diferente da Fase D2 (jan–jul): agosto JÁ tem os pagamentos reais lançados em
produção como despesas UNICO avulsas PAGO (com banco e data certos — a outra
sessão conciliou com o extrato). Então NÃO recria — só:
  A1. vincula cada avulsa folha ao funcionário + categoria nova (UPDATE)
  A2. recategoriza o bucket (encargo/convênio) pras categorias novas
  A3. remove as 23 parcelas RECORRENTE PENDENTE de agosto (projeção do motor,
      substituída pelos pagamentos reais) — só as parcelas de agosto, a despesa
      RECORRENTE e as parcelas de set/2026+ ficam intactas.

SOMENTE LEITURA (SSH produção). Gera `folha_agosto_input.json`.
Uso: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/preparar_folha_agosto.py
"""
import io
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _folha_d2_ssh import conectar

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "folha_agosto_input.json")
MES = ("2026-08-01", "2026-08-31")

CNPJ_CMPORT = "22761557000188"
CNPJ_TEC = "65756913000188"

# matcher de funcionário (tolera typos dos lançamentos manuais)
FUNCIONARIOS = {
    1: ["andre"],
    2: ["melgarejo", "magarejo", "magrejo"],
    3: ["welligton", "welligtoa", "welligtona", "weligton", "welington", "meneses", "menezes"],
    4: ["pedro henrique", "henrique da silva"],
    5: ["fabiana"],
    6: ["gabriel"],
    7: ["almira", "almyra", "almiira", "salomao"],
}


def _n(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s.lower())).strip()


def match_func(texto):
    t = _n(texto)
    for fid, toks in FUNCIONARIOS.items():
        if any(tk in t for tk in toks):
            return fid
    return None


# categoria nova (grupo FUNCIONARIO, 95-109) por palavra-chave da descrição/categoria atual
def cat_nova(desc, cat_atual):
    s = _n(desc + " " + cat_atual)
    if "rescis" in s:
        return 107
    if "feria" in s or "ferias" in s:
        return 105
    if "prl" in s or "participa" in s:
        return 108
    if "13" in s and ("salario" in s or "terceiro" in s):
        return 106
    if "adiant" in s:
        return 96
    if "plant" in s:
        return 97
    if "hora extra" in s:
        return 98
    if "comiss" in s:
        return 99
    if "fgts" in s or "gps" in s or "inss" in s or "receita federal" in s or "acordo" in s and "gps" in s:
        return 100
    if "sindicat" in s:
        return 101
    if "conv" in s or "amil" in s or "san med" in s or "sanmedi" in s or "odontolog" in s or \
       "bem mais familiar" in s or "beneficio mais familiar" in s or "brasil medicina" in s or "bem viver" in s:
        return 102
    if "vale transp" in s or "vt" == s.strip():
        return 103
    if "vale refei" in s or "refeicao" in s or "alimenta" in s:
        return 104
    if "salario" in s or "pagamento referente" in s or "folha" in s:
        return 95
    return None


CAT_LEGADA_NOVA = {
    "Salários": 95, "Adiantamento de Salário": 96, "Feria Funcionarios": 105,
    "Impostos (FGTS/GPS/ISS)": 100, "FGTS Funcionarios": 100, "GPS Funcionarios": 100,
    "Sindical": 101, "Convênio": 102, "Vale Transporte": 103, "Vale Alimentação": 104,
}

# descrições que NÃO são folha mesmo casando nome (presente, bolo, reembolso avulso)
RX_NAO_FOLHA = re.compile(r"presente|bolo|colaboradores|jusmarina|jessica cardoso|"
                          r"site empresa|thiago correa|caique|benuven|moya|bradesco|"
                          r"antenista|prefeitura|iss recolh|pis ref|codigo 07439", re.I)


def main():
    db = conectar("producao")

    # ---- 1. despesas UNICO de agosto, funcionario_id NULL, candidatas a folha ----
    rows = db.q(f"""
        SELECT d.id, d.categoria_id, COALESCE(c.nome,''), c.grupo, d.cnpj, d.valor_total,
               p.id, p.status, p.data_pagamento, p.banco_id, p.movimentacao_id, d.descricao
        FROM despesas d
        JOIN despesa_parcelas p ON p.despesa_id = d.id
        LEFT JOIN fin_categorias c ON c.id = d.categoria_id
        WHERE d.funcionario_id IS NULL AND d.deletado_em IS NULL AND d.tipo_pagamento = 'UNICO'
          AND p.data_vencimento >= '{MES[0]}' AND p.data_vencimento <= '{MES[1]}'
        ORDER BY p.data_pagamento, d.id
    """)

    vincular, recategorizar, ignorados = [], [], []
    for r in rows:
        did = int(r[0]); cat_atual = r[2]; grupo = r[3]; valor = float(r[5])
        desc = r[11]; mov_id = None if str(r[10]) == "NULL" else int(r[10])
        fid = match_func(desc)
        eh_folha_kw = bool(re.search(r"salari|adiant|rescis|rscis|feria|ferias|plant|hora extra|"
                                     r"prl|sindicat|conv[êe]nio|fgts|gps|inss|vale (transp|refei)|"
                                     r"pagamento referente", _n(desc))) or grupo == "FUNCIONARIO" \
                     or cat_atual in CAT_LEGADA_NOVA
        if RX_NAO_FOLHA.search(desc) and fid is None:
            ignorados.append({"id": did, "valor": valor, "descricao": desc[:60], "motivo": "não é folha"})
            continue
        if not eh_folha_kw:
            ignorados.append({"id": did, "valor": valor, "descricao": desc[:60], "motivo": "sem kw de folha"})
            continue

        nova = cat_nova(desc, cat_atual) or CAT_LEGADA_NOVA.get(cat_atual)
        reg = {
            "id": did, "valor": round(valor, 2), "categoria_atual": cat_atual,
            "categoria_atual_id": None if str(r[1]) == "NULL" else int(r[1]),
            "categoria_nova_id": nova, "banco_id": None if str(r[9]) == "NULL" else int(r[9]),
            "movimentacao_id": mov_id, "data_pagamento": r[8], "descricao": desc[:80],
        }
        if fid:
            reg["funcionario_id"] = fid
            vincular.append(reg)
        else:
            recategorizar.append(reg)   # bucket: encargo/convênio sem pessoa

    # ---- 2. as 23 parcelas RECORRENTE PENDENTE de agosto ----
    rec = db.q(f"""
        SELECT p.id, d.id, d.funcionario_id, p.valor, p.status, p.movimentacao_id, LEFT(d.descricao,50)
        FROM despesa_parcelas p JOIN despesas d ON d.id = p.despesa_id
        WHERE d.tipo_pagamento = 'RECORRENTE' AND d.funcionario_id IS NOT NULL AND d.deletado_em IS NULL
          AND p.data_vencimento >= '{MES[0]}' AND p.data_vencimento <= '{MES[1]}'
        ORDER BY d.id
    """)
    remover_parcelas = []
    for r in rec:
        remover_parcelas.append({
            "parcela_id": int(r[0]), "despesa_id": int(r[1]), "funcionario_id": int(r[2]),
            "valor": round(float(r[3]), 2), "status": r[4],
            "tem_mov": str(r[5]) != "NULL", "descricao": r[6],
        })

    # ---- 3. FLUXO planilha agosto (conferência) ----
    jf = json.load(open(os.path.join(BASE, "despesas_funcionario.json"), encoding="utf-8"))
    plan_por_func = defaultdict(float)
    plan_total = 0.0
    for t in jf["transacoes"]:
        if str(t.get("pagto", "")).startswith("2026-08"):
            v = abs(t.get("valor") or t.get("pagos") or 0)
            plan_total += v
            plan_por_func[match_func(t["descricao"])] += v

    db.close()

    doc = {
        "escopo": "Migração folha AGOSTO/2026 (pendência C) — vincular avulsas + remover recorrente PENDENTE",
        "resumo": {
            "vincular_a_funcionario": len(vincular),
            "vincular_total_R$": round(sum(x["valor"] for x in vincular), 2),
            "recategorizar_bucket": len(recategorizar),
            "recategorizar_total_R$": round(sum(x["valor"] for x in recategorizar), 2),
            "remover_parcelas_recorrente": len(remover_parcelas),
            "remover_total_R$": round(sum(x["valor"] for x in remover_parcelas), 2),
            "ignorados_nao_folha": len(ignorados),
            "planilha_fluxo_agosto_R$": round(plan_total, 2),
        },
        "vincular": vincular,
        "recategorizar": recategorizar,
        "remover_parcelas": remover_parcelas,
        "ignorados": ignorados,
        "sem_categoria_nova": [x["id"] for x in vincular + recategorizar if not x["categoria_nova_id"]],
        "conferencia_por_funcionario": {
            str(fid): {"planilha_fluxo": round(plan_por_func.get(fid, 0), 2),
                       "vai_vincular": round(sum(x["valor"] for x in vincular if x.get("funcionario_id") == fid), 2)}
            for fid in list(FUNCIONARIOS) + [None]
        },
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)

    print(f"OK -> {os.path.basename(OUT)}\n")
    print(json.dumps(doc["resumo"], ensure_ascii=False, indent=2))
    print("\n--- VINCULAR (avulsa -> funcionario + categoria) ---")
    for x in vincular:
        print(f"  d{x['id']:>4} func {x['funcionario_id']} cat {x['categoria_atual']!r:26}-> {x['categoria_nova_id']}  "
              f"R$ {x['valor']:>9,.2f}  {x['descricao'][:48]}")
    print("\n--- RECATEGORIZAR bucket (sem pessoa) ---")
    for x in recategorizar:
        print(f"  d{x['id']:>4} cat {x['categoria_atual']!r:26}-> {x['categoria_nova_id']}  R$ {x['valor']:>9,.2f}  {x['descricao'][:48]}")
    print("\n--- REMOVER 23 parcelas RECORRENTE PENDENTE ---")
    print(f"  total R$ {sum(x['valor'] for x in remover_parcelas):,.2f} · "
          f"{sum(1 for x in remover_parcelas if x['tem_mov'])} com mov (esperado 0)")
    print("\n--- IGNORADOS (não é folha, ficam Despesa Geral) ---")
    for x in ignorados:
        print(f"  d{x['id']:>4} R$ {x['valor']:>9,.2f}  {x['descricao']}  ({x['motivo']})")
    print("\n--- CONFERÊNCIA por funcionário: planilha FLUXO x o que vai vincular ---")
    for fid in list(FUNCIONARIOS) + [None]:
        c = doc["conferencia_por_funcionario"][str(fid)]
        print(f"  func {str(fid):>4}   planilha R$ {c['planilha_fluxo']:>10,.2f}   vincular R$ {c['vai_vincular']:>10,.2f}")
    if doc["sem_categoria_nova"]:
        print("\n  !! SEM categoria nova mapeada:", doc["sem_categoria_nova"])


if __name__ == "__main__":
    main()
