# -*- coding: utf-8 -*-
"""
Confere a folha de pagamento (Despesa Funcionário) cruzando 3 fontes, mês a mês:

  1. CONTROLE   -> controle_funcionarios_2026_itens.csv  (memória de cálculo, Jan-Jul)
  2. FLUXO/JSON -> despesas_funcionario.json              (visão de caixa da planilha FLUXO, Jan-Set)
  3. PRODUÇÃO   -> banco (via SSH), nas 3 formas em que a folha aparece hoje:
       a) fin_movimentacoes SAIDA órfãs (sem despesa_parcela)      -> Jan-Mai
       b) despesas UNICO avulsas sem funcionario_id                -> Agosto (fragmentado)
       c) parcelas de despesas RECORRENTE com funcionario_id       -> Ago em diante

SOMENTE LEITURA. Não altera nada. Gera:
  - fluxo-financeiro/mapa_folha_funcionarios.json   (saída mestre p/ a Fase D parte 2)
  - relatório no console com as "abas":
      [1] Reconciliação mensal   (Controle x JSON x Produção, por funcionário)
      [2] Folha solta            (registros de produção sem funcionario_id que SÃO folha)
      [3] Falsos positivos       (Pix <nome> que NÃO é folha)
      [4] Duplicata de agosto    (fragmentos UNICO x parcela recorrente PENDENTE)
      [5] Mapa lançamento JSON -> funcionário + categoria nova + já existe em produção?
      [6] Divergências de cadastro
      [7] Categorias legadas -> categorias novas (grupo FUNCIONARIO)

Uso:
  cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/conferir_folha_funcionarios.py
  (PowerShell: setar antes  $env:PYTHONIOENCODING="utf-8")
"""
import csv
import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import paramiko

BASE = Path(__file__).resolve().parent
CSV_CONTROLE = BASE / "controle_funcionarios_2026_itens.csv"
JSON_FLUXO = BASE / "despesas_funcionario.json"
OUT = BASE / "mapa_folha_funcionarios.json"

HOST = "168.231.96.184"
CNPJ_CMPORT = "22761557000188"
CNPJ_TEC = "65756913000188"
TOL = 0.02

# ---------------------------------------------------------------------------
# util
# ---------------------------------------------------------------------------

def demojibake(s):
    """Conserta texto com acento double-encoded (cp1252) — ex: 'Sal\xc3\xa1rio' -> 'Salário'."""
    if not s or not re.search(r"Ã.|Â.|â€", s):
        return s
    try:
        fixed = s.encode("latin-1").decode("utf-8")
        return fixed
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def norm(s):
    s = demojibake(str(s or ""))
    s = re.sub(r"([a-zà-ú])([A-ZÀ-Ú])", r"\1 \2", s)  # "RefeiçãoGabriel" -> "Refeição Gabriel"
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s.lower())).strip()


def money(v):
    if v in (None, "", "NULL"):
        return 0.0
    if isinstance(v, str):
        v = v.replace(".", "").replace(",", ".") if re.search(r",\d{2}$", v) else v
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return 0.0


def ym(d):
    if isinstance(d, date):
        return f"{d.year:04d}-{d.month:02d}"
    m = re.match(r"(\d{4})-(\d{2})", str(d or ""))
    return m.group(0) if m else None


# ---------------------------------------------------------------------------
# matcher de funcionário (tolera os typos da planilha e dos lançamentos manuais)
# ---------------------------------------------------------------------------
FUNCIONARIOS = {
    1: {"nome": "André Moreira Rosa",              "cnpj": CNPJ_TEC,    "tokens_fortes": ["andre"], "socio": True},
    2: {"nome": "Luis Antonio Melgarejo Neves",    "cnpj": CNPJ_TEC,    "tokens_fortes": ["melgarejo", "magarejo", "magrejo"]},
    3: {"nome": "Welligton Lucas Menezes Rodrigues", "cnpj": CNPJ_TEC,  "tokens_fortes": ["welligton", "welligtoa", "welligtona", "weligton", "welington"]},
    4: {"nome": "Pedro Henrique da Silva",         "cnpj": CNPJ_CMPORT, "tokens_fortes": ["henrique", "pedro"]},
    5: {"nome": "Fabiana Pedretti Moreira Rosa",   "cnpj": CNPJ_TEC,    "tokens_fortes": ["fabiana"]},
    6: {"nome": "Gabriel Moreira Pedretti",        "cnpj": CNPJ_TEC,    "tokens_fortes": ["gabriel"]},
    7: {"nome": "Almira Moreira Rosa Salomão",     "cnpj": CNPJ_TEC,    "tokens_fortes": ["almira", "almyra", "almiira", "almeira", "salomao"]},
}
# "Gabriel Pedretti Moreira Rosa" (typo) tem 'gabriel' -> ok
# "André" sozinho num Pix de reembolso NÃO deve casar como folha (ver eh_folha)


def match_funcionario(texto):
    t = norm(texto)
    palavras = set(t.split())
    # 1) token forte exato
    for fid, f in FUNCIONARIOS.items():
        if any(tk in palavras for tk in f["tokens_fortes"]):
            return fid, "token_forte"
    # 2) token forte fuzzy (>= 0.82) contra cada palavra
    melhor = (None, 0.0)
    for fid, f in FUNCIONARIOS.items():
        for tk in f["tokens_fortes"]:
            for w in palavras:
                r = SequenceMatcher(None, tk, w).ratio()
                if r > melhor[1]:
                    melhor = (fid, r)
    if melhor[1] >= 0.82:
        return melhor[0], f"fuzzy({melhor[1]:.2f})"
    return None, None


# ---------------------------------------------------------------------------
# é folha? (separa pagamento de pessoal de "Pix André pra pagar zelador")
# ---------------------------------------------------------------------------
KW_FOLHA = re.compile(
    r"\b(salari|adiant|plant[ãa]o|hora extra|reflexo|d\.?s\.?r|f[ée]rias|feria |resc|13[ºo]|"
    r"inss|irrf|imposto de renda|contribui[çc][ãa]o assist|vale (refei|aliment|transp)|"
    r"pro.?labore|comiss|prl|encargo|fgts|gps|sindicat|conv[êe]nio|empr[ée]stimo de sal|"
    r"vale ?refei|monitor|bonifica)\b", re.I)
KW_NAO_FOLHA = re.compile(
    r"\b(zelador|s[íi]ndico|sindic[ao] (do|do pr)|caixinha|uber|estacion|zona azul|abastec|"
    r"gasolina|combust[íi]vel|carro|ve[íi]culo|licenciament|ipva|multa|conserto|pneu|"
    r"material|mercado livre|magalu|caf[ée]|bolo|presente|limpeza escrit|computador|"
    r"batida|fiesta|uno|habilita)\b", re.I)


def classificar_folha(descricao, categoria_nome=""):
    """(eh_folha:bool, motivo:str)"""
    d = descricao or ""
    cat = (categoria_nome or "")
    forte = bool(KW_FOLHA.search(d)) or "funcionario" in norm(cat) or norm(cat) in (
        "salarios", "adiantamento de salario", "convenio", "vale transporte",
        "feria funcionarios", "gps funcionarios", "fgts funcionarios", "sindical")
    veto = bool(KW_NAO_FOLHA.search(d))
    if forte and not veto:
        return True, "kw_folha" + (f"+cat={cat}" if cat else "")
    if forte and veto:
        return False, f"ambíguo (kw_folha mas também '{KW_NAO_FOLHA.search(d).group(0)}')"
    return False, "sem_kw_folha"


# ---------------------------------------------------------------------------
# subcategoria / tipo -> categoria nova (grupo FUNCIONARIO, ids 95-109)
# ---------------------------------------------------------------------------
CAT = {
    95: "Salario (folha mensal)", 96: "Adiantamento de salario", 97: "Plantao",
    98: "Hora extra", 99: "Comissao", 100: "Encargos trabalhistas (FGTS/GPS)",
    101: "Sindicato", 102: "Convenio medico/odontologico", 103: "Vale transporte",
    104: "Vale refeicao/alimentacao", 105: "Ferias", 106: "13o salario",
    107: "Rescisao", 108: "PRL (participacao nos resultados)", 109: "Passagem/reembolso pessoal",
}
TIPO_CONTROLE_PARA_CAT = {
    "SALARIO": 95, "ADIANTAMENTO": 96, "PLANTAO": 97, "HORA_EXTRA": 98, "REFLEXO_DSR": 98,
    "VALE_REFEICAO": 104, "VALE_ALIMENTACAO": 104, "VALE_TRANSPORTE": 103,
    "BONIFICACAO": 99, "HABILITACAO": 109, "REEMBOLSO": 109, "MONITOR": None,
    "INSS": None, "IRRF": None, "CONTRIB_ASSISTENCIAL": None, "DESCONTO_13": None,
    "DESCONTO_VR_VT": None, "MULTA": None, "DESCONTO": None, "OUTRO": None,
}
def cat_da_subcat_json(sub):
    """Mapeia a subcategoria do despesas_funcionario.json (que vem com acento
    quebrado/perdido) numa das 15 categorias novas, por palavra-chave."""
    s = norm(sub)  # acentos já viram '' -> 'salrio', 'frias', 'benefcio', etc
    if s.startswith("sal") or "folha mensal" in s:
        return 95
    if "adiant" in s:
        return 96
    if "encargo" in s or "fgts" in s or "gps" in s:
        return 100
    if "benef" in s or "conv" in s or "medico" in s or "odont" in s:
        return 102
    if s.startswith("fri") or "feria" in s:
        return 105
    if "resci" in s:
        return 107
    if "vale trans" in s or "refei" in s or "aliment" in s:
        return 104
    if "prl" in s or "participa" in s:
        return 108
    if "passagem" in s or "reembolso" in s:
        return 109
    return None


# ---------------------------------------------------------------------------
# SSH / MySQL
# ---------------------------------------------------------------------------

def q(ssh, sql):
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
    i, o, _ = ssh.exec_command(cmd, timeout=120)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
    i.channel.shutdown_write()
    out = o.read().decode("utf-8", "replace")
    return [ln.split("\t") for ln in out.splitlines() if ln.strip()]


def carregar_producao():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", timeout=20)

    prod = {"funcionarios": {}, "variaveis": {}, "mov_orfas": [], "despesas_sem_fid": [],
            "parcelas_com_fid": [], "categorias": {}}

    for r in q(ssh, "SELECT id,nome,empresa_padrao_cnpj,ativo,data_admissao,data_demissao FROM funcionarios ORDER BY id;"):
        prod["funcionarios"][int(r[0])] = {
            "nome": r[1], "cnpj": r[2], "ativo": r[3] == "1",
            "data_admissao": None if r[4] == "NULL" else r[4],
            "data_demissao": None if r[5] == "NULL" else r[5],
        }
    for r in q(ssh, """SELECT funcionario_id,salario_mensal,adiantamento_tipo,adiantamento_valor,
                       vale_refeicao,vale_transporte,tem_plantao,plantao_valor
                       FROM funcionario_variaveis;"""):
        prod["variaveis"][int(r[0])] = {
            "salario_mensal": money(r[1]), "adiantamento_tipo": r[2],
            "adiantamento_valor": money(r[3]), "vale_refeicao": money(r[4]),
            "vale_transporte": money(r[5]), "tem_plantao": r[6] == "1",
            "plantao_valor": money(r[7]),
        }
    for r in q(ssh, "SELECT id,nome,grupo FROM fin_categorias;"):
        prod["categorias"][int(r[0])] = {"nome": r[1], "grupo": r[2]}

    # (a) fin_movimentacoes SAIDA sem despesa_parcela
    for r in q(ssh, """
        SELECT m.id, m.data, m.valor, m.banco_id, m.categoria_id, LEFT(m.descricao,120)
        FROM fin_movimentacoes m
        LEFT JOIN despesa_parcelas p ON p.movimentacao_id = m.id
        WHERE m.tipo='SAIDA' AND m.deletado_em IS NULL AND p.id IS NULL
          AND YEAR(m.data)=2026;"""):
        prod["mov_orfas"].append({
            "id": int(r[0]), "data": r[1], "valor": money(r[2]),
            "banco_id": None if r[3] == "NULL" else int(r[3]),
            "categoria_id": None if r[4] == "NULL" else int(r[4]),
            "descricao": r[5], "cnpj": None,
        })

    # (b) despesas sem funcionario_id (todas de 2026, filtra folha depois)
    for r in q(ssh, """
        SELECT d.id, d.tipo_pagamento, d.cnpj, d.valor_total, d.categoria_id,
               LEFT(d.descricao,120), MIN(p.data_vencimento), MAX(p.status)
        FROM despesas d
        JOIN despesa_parcelas p ON p.despesa_id = d.id
        WHERE d.funcionario_id IS NULL AND d.deletado_em IS NULL
          AND YEAR(p.data_vencimento) IN (2026,2027)
        GROUP BY d.id;"""):
        prod["despesas_sem_fid"].append({
            "id": int(r[0]), "tipo": r[1], "cnpj": r[2], "valor_total": money(r[3]),
            "categoria_id": None if r[4] == "NULL" else int(r[4]),
            "descricao": r[5], "primeiro_vencto": r[6], "status": r[7],
        })

    # (c) parcelas de despesas COM funcionario_id
    for r in q(ssh, """
        SELECT d.funcionario_id, d.categoria_id, p.data_vencimento, p.valor, p.status,
               p.data_pagamento, LEFT(d.descricao,120), d.id, p.id
        FROM despesa_parcelas p
        JOIN despesas d ON d.id = p.despesa_id
        WHERE d.funcionario_id IS NOT NULL AND d.deletado_em IS NULL;"""):
        prod["parcelas_com_fid"].append({
            "funcionario_id": int(r[0]),
            "categoria_id": None if r[1] == "NULL" else int(r[1]),
            "data_vencimento": r[2], "valor": money(r[3]), "status": r[4],
            "data_pagamento": None if r[5] == "NULL" else r[5],
            "descricao": r[6], "despesa_id": int(r[7]), "parcela_id": int(r[8]),
        })

    ssh.close()
    return prod


# ---------------------------------------------------------------------------
# fontes locais
# ---------------------------------------------------------------------------

def carregar_controle():
    """itens do CSV -> lista de dicts + agregado por (fid, ym)"""
    itens = []
    with CSV_CONTROLE.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=";"):
            fid, _ = match_funcionario(row["funcionario"])
            itens.append({
                "fid": fid, "mes": int(row["mes"]), "mes_nome": row["mes_nome"],
                "data": row["data_pagamento"], "valor": money(row["valor"]),
                "tipo": row["tipo"], "assunto": row["assunto"],
            })
    return itens


def carregar_json_fluxo():
    d = json.load(JSON_FLUXO.open(encoding="utf-8"))
    out = []
    for x in d["transacoes"]:
        fid, como = match_funcionario(x["descricao"])
        out.append({
            "descricao": x["descricao"], "cnpj": x["cnpj"],
            "subcategoria": x["subcategoria"],
            "valor": abs(money(x.get("valor") or x.get("pagos"))),
            "pagto": x.get("pagto"), "vencto": x.get("vencto"),
            "linha": x.get("linha_planilha"),
            "fid": fid, "match": como,
            "categoria_nova": cat_da_subcat_json(x["subcategoria"]),
        })
    return out, money(d.get("total_valor"))


# ---------------------------------------------------------------------------
# relatório
# ---------------------------------------------------------------------------
MESES_PT = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def main():
    print("Carregando fontes...\n")
    controle = carregar_controle()
    jsonf, json_total = carregar_json_fluxo()
    prod = carregar_producao()

    fnome = lambda fid: FUNCIONARIOS[fid]["nome"] if fid else "(?)"

    # ---- classificar folha solta em produção ----
    # 3 baldes: folha_com_pessoa (precisa funcionario_id) · folha_bucket (encargo/convênio
    # sem pessoa, funcionario_id NULL é CORRETO) · falso_positivo (não é folha)
    RX_BUCKET = re.compile(r"encargo|fgts|gps|inss|sindicat|conv[êe]nio|amil|odontolog|"
                           r"plano (medico|odont)|resc.*(fgts|gps)", re.I)

    RX_TRANSFER = re.compile(r"para (inter|ita[uú]|bradesco|conta|c/c)|pagar sal[áa]rios\)?$|"
                             r"inter para inter|itau para inter", re.I)

    def separar(registros, fonte):
        com_pessoa, bucket, sem_pessoa, falso = [], [], [], []
        for x in registros:
            catnome = prod["categorias"].get(x["categoria_id"], {}).get("nome", "")
            desc = demojibake(x["descricao"])
            eh, motivo = classificar_folha(desc, catnome)
            fid, como = match_funcionario(desc)
            reg = {**x, "descricao": desc, "categoria_nome": catnome, "fid": fid,
                   "match": como, "motivo": motivo, "fonte": fonte,
                   "v": x.get("valor", x.get("valor_total", 0.0)),
                   "quando": x.get("data") or x.get("primeiro_vencto")}
            cara_folha = eh or bool(re.search(r"salari|adiant|resc|f[ée]rias|folha|pagamento referente", norm(desc)))
            if cara_folha and RX_TRANSFER.search(desc):
                reg["motivo"] = "transferência interna p/ fundear folha (não é despesa)"
                falso.append(reg)
            elif fid and cara_folha:
                com_pessoa.append(reg)
            elif cara_folha and (RX_BUCKET.search(desc) or RX_BUCKET.search(catnome)):
                bucket.append(reg)
            elif cara_folha and re.search(r"salari|adiant|resc|f[ée]rias|folha|pagamento referente|feria", norm(catnome + " " + desc)):
                sem_pessoa.append(reg)   # é folha mas sem nome identificável
            elif eh or fid:
                falso.append(reg)
        return com_pessoa, bucket, sem_pessoa, falso

    mov_folha, mov_bucket, mov_sempessoa, mov_falsopos = separar(prod["mov_orfas"], "mov_orfa")
    desp_folha, desp_bucket, desp_sempessoa, desp_falsopos = separar(prod["despesas_sem_fid"], "despesa_avulsa")
    sem_pessoa = mov_sempessoa + desp_sempessoa

    # ---- agregados por (fid, mes) ----
    agg_ctrl = defaultdict(float)
    for it in controle:
        agg_ctrl[(it["fid"], it["mes"])] += it["valor"]

    agg_json = defaultdict(float)
    for x in jsonf:
        mm = ym(x["pagto"])
        if x["fid"] and mm and mm.startswith("2026"):
            agg_json[(x["fid"], int(mm[5:7]))] += x["valor"]

    agg_prod = defaultdict(float)
    for r in mov_folha + desp_folha:
        mm = ym(r["quando"])
        if mm and mm.startswith("2026"):
            agg_prod[(r["fid"], int(mm[5:7]))] += r["v"]
    for p in prod["parcelas_com_fid"]:
        mm = ym(p["data_vencimento"])
        if mm and mm.startswith("2026"):
            agg_prod[(p["funcionario_id"], int(mm[5:7]))] += p["valor"]

    # =====================================================================
    print("=" * 104)
    print("[1] RECONCILIAÇÃO MENSAL — Controle (líquido pago) × JSON/FLUXO (caixa, itemizado) × Produção")
    print("=" * 104)
    print(f"{'':22} {'mês':>4}  {'CONTROLE':>11} {'JSON/FLUXO':>11} {'PRODUÇÃO':>11}  {'ctrl-prod':>11} {'json-prod':>11}")
    tot = defaultdict(float)
    for fid in list(FUNCIONARIOS) + [None]:
        linhas = [(mes, agg_ctrl.get((fid, mes), 0.0), agg_json.get((fid, mes), 0.0), agg_prod.get((fid, mes), 0.0))
                  for mes in range(1, 9)]
        linhas = [x for x in linhas if abs(x[1]) + abs(x[2]) + abs(x[3]) >= 0.01]
        if not linhas:
            continue
        print(f"\n{fnome(fid)[:22]:22}")
        for mes, c, j, p in linhas:
            print(f"{'':22} {MESES_PT[mes]:>4}  {c:>11,.2f} {j:>11,.2f} {p:>11,.2f}  {c-p:>11,.2f} {j-p:>11,.2f}")
            tot["c"] += c; tot["j"] += j; tot["p"] += p
    print("-" * 104)
    print(f"{'TOTAL Jan-Ago':22} {'':>4}  {tot['c']:>11,.2f} {tot['j']:>11,.2f} {tot['p']:>11,.2f}  "
          f"{tot['c']-tot['p']:>11,.2f} {tot['j']-tot['p']:>11,.2f}")
    print(f"\nJSON despesas_funcionario.json — total geral (todas subcats, Jan-Set): R$ {abs(json_total):,.2f}")

    # =====================================================================
    print("\n" + "=" * 104)
    print(f"[2] FOLHA SOLTA COM PESSOA (sem funcionario_id, É folha, precisa vincular) — "
          f"{len(mov_folha)} mov + {len(desp_folha)} despesas")
    print("=" * 104)
    for r in sorted(mov_folha + desp_folha, key=lambda x: (str(x["quando"]), x["id"])):
        print(f"  {r['fonte'][:12]:12} id={r['id']:>4} {r['quando']} R$ {r['v']:>9,.2f}  "
              f"→ {fnome(r['fid'])[:24]:24} [{(r['categoria_nome'] or '-')[:20]:20}] {r['descricao'][:44]}")
    print(f"\n  TOTAL folha solta com pessoa: R$ {sum(r['v'] for r in mov_folha + desp_folha):,.2f}")

    # =====================================================================
    print("\n" + "=" * 104)
    print(f"[2b] FOLHA BUCKET-LEVEL (encargo/convênio sem pessoa — funcionario_id NULL é CORRETO, só recategorizar) — "
          f"{len(mov_bucket) + len(desp_bucket)}")
    print("=" * 104)
    for r in sorted(mov_bucket + desp_bucket, key=lambda x: (str(x["quando"]), x["id"])):
        print(f"  {r['fonte'][:12]:12} id={r['id']:>4} {r['quando']} R$ {r['v']:>9,.2f}  "
              f"[{(r['categoria_nome'] or '-')[:22]:22}] {r['descricao'][:48]}")
    print(f"\n  TOTAL bucket: R$ {sum(r['v'] for r in mov_bucket + desp_bucket):,.2f}")

    # =====================================================================
    print("\n" + "=" * 104)
    print(f"[2c] FOLHA SEM PESSOA IDENTIFICÁVEL (é folha mas a descrição não diz de quem) — {len(sem_pessoa)}")
    print("=" * 104)
    for r in sorted(sem_pessoa, key=lambda x: (str(x["quando"]), x["id"])):
        print(f"  {r['fonte'][:12]:12} id={r['id']:>4} {r['quando']} R$ {r['v']:>9,.2f}  "
              f"[{(r['categoria_nome'] or '-')[:20]:20}] {r['descricao'][:48]}")
    print(f"\n  TOTAL sem pessoa: R$ {sum(r['v'] for r in sem_pessoa):,.2f}")

    # =====================================================================
    print("\n" + "=" * 104)
    print(f"[3] FALSOS POSITIVOS — nome/keyword de folha mas NÃO é folha ({len(mov_falsopos) + len(desp_falsopos)}) — "
          f"ficam como Despesa Geral")
    print("=" * 104)
    for r in sorted(mov_falsopos + desp_falsopos, key=lambda x: x["id"]):
        print(f"  {r['fonte'][:12]:12} id={r['id']:>4} {r['quando']} R$ {r['v']:>9,.2f}  "
              f"{r['motivo'][:30]:30} {r['descricao'][:46]}")

    # =====================================================================
    print("\n" + "=" * 104)
    print("[4] DUPLICATA DE AGOSTO — fragmentos avulsos (pagos) × parcelas RECORRENTE PENDENTE de ago/2026")
    print("=" * 104)
    frag_ago = [r for r in mov_folha + desp_folha if ym(r["quando"]) == "2026-08"]
    rec_ago = [p for p in prod["parcelas_com_fid"] if ym(p["data_vencimento"]) == "2026-08"]
    por_fid_frag, por_fid_rec = defaultdict(float), defaultdict(float)
    for r in frag_ago:
        por_fid_frag[r["fid"]] += r["v"]
    for p in rec_ago:
        por_fid_rec[p["funcionario_id"]] += p["valor"]
    print(f"{'funcionário':26} {'fragmentos avulsos':>18} {'recorrente PENDENTE':>20}")
    for fid in FUNCIONARIOS:
        a, b = por_fid_frag.get(fid, 0.0), por_fid_rec.get(fid, 0.0)
        if a or b:
            print(f"{fnome(fid)[:26]:26} {a:>18,.2f} {b:>20,.2f}")
    print(f"\n  → {len(frag_ago)} fragmentos (R$ {sum(por_fid_frag.values()):,.2f}) e "
          f"{len(rec_ago)} parcelas recorrentes (R$ {sum(por_fid_rec.values()):,.2f}) cobrindo o MESMO mês → escolher 1.")

    # =====================================================================
    print("\n" + "=" * 104)
    print("[5] MAPA LANÇAMENTO JSON → FUNCIONÁRIO + CATEGORIA NOVA + JÁ EXISTE EM PRODUÇÃO?")
    print("=" * 104)
    jsonf = [x for x in jsonf if ym(x["pagto"]) and ym(x["pagto"]).startswith("2026")]  # tira 2006-08 bugado
    sem_fid = [x for x in jsonf if not x["fid"]]
    sem_cat = [x for x in jsonf if x["fid"] and not x["categoria_nova"]]
    print(f"  {len(jsonf)} lançamentos (2026) · {len(jsonf)-len(sem_fid)} com funcionário · "
          f"{len(sem_fid)} sem (encargo/convênio bucket) · {len(sem_cat)} com func sem categoria mapeada")
    if sem_cat:
        from collections import Counter
        print("   subcats não mapeadas:", dict(Counter(x["subcategoria"] for x in sem_cat)))

    prod_idx = defaultdict(list)
    for r in mov_folha + desp_folha:
        prod_idx[(r["fid"], ym(r["quando"]))].append(r["v"])
    ja = 0
    for x in jsonf:
        if not x["fid"]:
            x["ja_existe_em_producao"] = None
            continue
        cand = prod_idx.get((x["fid"], ym(x["pagto"])), [])
        x["ja_existe_em_producao"] = any(abs(v - x["valor"]) <= TOL for v in cand)
        ja += bool(x["ja_existe_em_producao"])
    faltam = [x for x in jsonf if x["fid"] and not x["ja_existe_em_producao"]]
    print(f"  com funcionário: ~{ja} já têm equivalente em produção · ~{len(faltam)} faltam criar")
    print("\n  faltam criar, por mês:")
    for mm in sorted(set(ym(x["pagto"]) for x in faltam)):
        do_mes = [x for x in faltam if ym(x["pagto"]) == mm]
        print(f"    {mm}: {len(do_mes):>2} lançamentos  R$ {sum(x['valor'] for x in do_mes):>10,.2f}")

    # =====================================================================
    print("\n" + "=" * 100)
    print("[6] DIVERGÊNCIAS DE CADASTRO (produção × planilha Controle)")
    print("=" * 100)
    PLAN = {
        1: {"admissao": "SÓCIO (sem data)", "base": 2900},
        2: {"admissao": "2025-02-14", "base": 3500, "obs": "reajuste p/ 4.201,25 em maio; adiant. FIXO 1.680,50"},
        3: {"admissao": "2024-07-08", "base": 4000, "obs": "adiant. FIXO 1.739,38"},
        4: {"admissao": "2025-06-02", "base": 1805, "obs": "adiant. FIXO 722; DESLIGADO 2026-08-07"},
        5: {"admissao": "2024-02-01", "base": 2000},
        6: {"admissao": "2026-01-01", "base": 1600},
        7: {"admissao": "2026-03-23", "base": 1805, "obs": "base 1.805 → 2.055 em jul"},
    }
    for fid, pl in PLAN.items():
        pf = prod["funcionarios"].get(fid, {})
        pv = prod["variaveis"].get(fid, {})
        difs = []
        if pl.get("admissao") and pf.get("data_admissao") != pl["admissao"] and "SÓCIO" not in pl["admissao"]:
            difs.append(f"admissão prod={pf.get('data_admissao')} × planilha={pl['admissao']}")
        if pl.get("base") and abs(pv.get("salario_mensal", 0) - pl["base"]) > 1 and \
           abs(pv.get("salario_mensal", 0) - {2: 4201.25, 7: 2055}.get(fid, pl["base"])) > 1:
            difs.append(f"salário prod={pv.get('salario_mensal')} × base planilha={pl['base']}")
        if pl.get("obs") and "FIXO" in pl["obs"] and pv.get("adiantamento_tipo") != "FIXO":
            difs.append(f"adiantamento prod={pv.get('adiantamento_tipo')} × planilha=FIXO")
        if difs:
            print(f"  {fnome(fid)[:26]:26} " + " | ".join(difs))
        if pl.get("obs"):
            print(f"  {'':26} nota: {pl['obs']}")

    # =====================================================================
    print("\n" + "=" * 100)
    print("[7] CATEGORIAS LEGADAS → CATEGORIAS NOVAS (grupo FUNCIONARIO)")
    print("=" * 100)
    usadas = defaultdict(lambda: [0, 0.0])
    for r in mov_folha + desp_folha + mov_bucket + desp_bucket:
        cn = r["categoria_nome"] or "(sem categoria)"
        usadas[cn][0] += 1
        usadas[cn][1] += r["v"]
    MAPA_CAT = {
        "salarios": 95, "salario folha mensal": 95, "adiantamento de salario": 96,
        "plantao": 97, "hora extra": 98,
        "impostos fgts gps iss": 100, "gps funcionarios": 100, "fgts funcionarios": 100,
        "sindical": 101, "convenio": 102, "vale transporte": 103,
        "feria funcionarios": 105, "diversos": None,
    }
    for cn, (n, v) in sorted(usadas.items(), key=lambda x: -x[1][1]):
        alvo = MAPA_CAT.get(norm(cn))
        alvo_txt = f"{alvo} {CAT[alvo]}" if alvo else "→ REVISAR MANUAL (mistura folha + não-folha)"
        print(f"  {cn[:34]:34} {n:>3} lanç  R$ {v:>10,.2f}   →  {alvo_txt}")

    # ---- salvar mapa mestre ----
    mapa = {
        "gerado_por": "conferir_folha_funcionarios.py",
        "reconciliacao_mensal": [
            {"funcionario_id": fid, "funcionario": fnome(fid), "mes": mes,
             "controle": round(agg_ctrl.get((fid, mes), 0.0), 2),
             "json_fluxo": round(agg_json.get((fid, mes), 0.0), 2),
             "producao": round(agg_prod.get((fid, mes), 0.0), 2)}
            for fid in list(FUNCIONARIOS) + [None] for mes in range(1, 9)
            if abs(agg_ctrl.get((fid, mes), 0.0)) + abs(agg_json.get((fid, mes), 0.0)) + abs(agg_prod.get((fid, mes), 0.0)) > 0.01
        ],
        "folha_solta_com_pessoa": [
            {"fonte": r["fonte"], "id": r["id"], "data": r["quando"], "valor": r["v"],
             "funcionario_id": r["fid"], "funcionario": fnome(r["fid"]),
             "categoria_atual": r["categoria_nome"], "descricao": r["descricao"],
             "match": r["match"], "motivo": r["motivo"]}
            for r in mov_folha + desp_folha
        ],
        "folha_bucket_level": [
            {"fonte": r["fonte"], "id": r["id"], "data": r["quando"], "valor": r["v"],
             "categoria_atual": r["categoria_nome"], "descricao": r["descricao"]}
            for r in mov_bucket + desp_bucket
        ],
        "folha_sem_pessoa": [
            {"fonte": r["fonte"], "id": r["id"], "data": r["quando"], "valor": r["v"],
             "categoria_atual": r["categoria_nome"], "descricao": r["descricao"]}
            for r in sem_pessoa
        ],
        "falsos_positivos": [
            {"fonte": r["fonte"], "id": r["id"], "valor": r["v"],
             "descricao": r["descricao"], "motivo": r["motivo"]}
            for r in mov_falsopos + desp_falsopos
        ],
        "duplicata_agosto": {
            "fragmentos_avulsos": [{"fonte": r["fonte"], "id": r["id"], "funcionario_id": r["fid"],
                                    "valor": r["v"], "descricao": r["descricao"]} for r in frag_ago],
            "parcelas_recorrente_pendente": [{"parcela_id": p["parcela_id"], "despesa_id": p["despesa_id"],
                                              "funcionario_id": p["funcionario_id"], "valor": p["valor"]}
                                             for p in rec_ago],
        },
        "mapa_json_fluxo": [
            {"linha_planilha": x["linha"], "descricao": x["descricao"], "cnpj": x["cnpj"],
             "valor": x["valor"], "pagto": x["pagto"], "subcategoria": x["subcategoria"],
             "funcionario_id": x["fid"], "funcionario": fnome(x["fid"]) if x["fid"] else None,
             "match": x["match"], "categoria_nova_id": x["categoria_nova"],
             "categoria_nova": CAT.get(x["categoria_nova"]),
             "ja_existe_em_producao": x.get("ja_existe_em_producao", None)}
            for x in jsonf
        ],
    }
    OUT.write_text(json.dumps(mapa, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n\nOK → {OUT.name}  ({len(mapa['folha_solta_com_pessoa'])} folha solta c/ pessoa · "
          f"{len(mapa['folha_bucket_level'])} bucket · {len(mapa['mapa_json_fluxo'])} lançamentos JSON mapeados)")


if __name__ == "__main__":
    main()
