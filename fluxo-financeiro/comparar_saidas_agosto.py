# -*- coding: utf-8 -*-
"""
Passo 2b do PLANO_RECONCILIACAO_EXTRATOS_AGOSTO.md — cruza, POR CONTA, o extrato
bancario normalizado (Passo 1) com as SAIDAS registradas na PRODUCAO.

Saidas do sistema = fin_movimentacoes tipo SAIDA (despesa geral + fornecedor +
folha ja caem todas aqui como espelho), mes 8/2026, agrupadas por banco_id.

Saidas do extrato = lancamentos SAIDA + TARIFA + DEBITO_CARTAO (valor negativo).
Transferencia que SAI (TRANSFERENCIA_ENTRE_CONTAS negativa, e "Pix enviado ...CMPORT"
no Itau) e conferida a parte — do lado do sistema ela e' mov ENTRADA com
banco_origem_id nesta conta.

Saida, por conta (Itau=1, Inter CMPORT=2, Inter TEC=4):
  (a) NO EXTRATO, SEM PAR NO SISTEMA -> saida que aconteceu e nao foi lancada
  (b) NO SISTEMA, SEM PAR NO EXTRATO -> lancado na conta errada / valor / duplicado / folha inflada
  (c) BATE (1:1 ou por soma)
+ confere o total Σ saida extrato x Σ saida sistema.

So LEITURA (SSH read-only na producao). Nada e alterado.

Uso: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/comparar_saidas_agosto.py
     (--conta 2  limita a uma conta; --full lista item a item tudo que bate)
"""
import io
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime
from itertools import combinations

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import paramiko

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NORM = os.path.join(BASE, "fluxo-financeiro", "extratos_agosto_normalizado.json")
TOL = 0.02
DIAS = 5

BANCOS = {2: "Inter CMPORT", 4: "Inter TEC", 1: "Itau CMPORT"}
SO_CONTA = None
FULL = "--full" in sys.argv
if "--conta" in sys.argv:
    SO_CONTA = int(sys.argv[sys.argv.index("--conta") + 1])


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


# descricao de SAIDA que na verdade e transferencia entre contas nossas (ja
# contabilizada do outro lado como mov ENTRADA com banco_origem_id) -> candidata
# a soft-delete pra nao contar 2x.
_PADROES_TRANSF = [
    "cmport inter para cmport t", "itau para cmport", "itau paras cmport",
    "inter para inter", "pix cmport inter", "cmport inter -", "pagar contas",
    "cmport tec", "pix itau",
]


def parece_transf(s):
    d0 = norm(s.get("desc"))
    return any(p in d0 for p in (norm(x) for x in _PADROES_TRANSF))


def d(s):
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


def q(ssh, sql):
    cmd = ("docker exec -i cmport_db sh -c "
           "'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 -N --batch'")
    i, o, e = ssh.exec_command(cmd, timeout=90)
    i.write("SET NAMES utf8mb4;\nUSE cmport_gerenciamento;\n" + sql)
    i.channel.shutdown_write()
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if err.strip() and "Warning" not in err:
        print("SQL ERR:", err[:300])
    return [ln.split("\t") for ln in out.splitlines() if ln.strip()]


def carregar_sistema():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("168.231.96.184", username="root", timeout=15)

    saidas = [
        {"origem": "mov", "id": int(r[0]), "data": date(*map(int, r[1].split("-"))),
         "valor": round(float(r[2]), 2),
         "banco_id": None if r[3] in ("", "NULL") else int(r[3]),
         "grupo": r[4] or "?", "categoria": r[5] or "-",
         "forn": r[6] or "", "desc": (r[7] or "")[:46], "func_id": r[8] if r[8] not in ("", "NULL") else None}
        for r in q(ssh, """
            SELECT m.id, m.data, m.valor, m.banco_id,
                   COALESCE(cat.grupo,''), COALESCE(cat.nome,''),
                   COALESCE(f.nome,''), LEFT(COALESCE(m.descricao,''),60),
                   COALESCE((SELECT dp.id FROM despesa_parcelas dp WHERE dp.movimentacao_id=m.id LIMIT 1),'')
            FROM fin_movimentacoes m
            LEFT JOIN fin_categorias cat ON cat.id=m.categoria_id
            LEFT JOIN condominios f ON f.id=m.fornecedor_id
            WHERE m.tipo='SAIDA' AND m.deletado_em IS NULL
              AND YEAR(m.data)=2026 AND MONTH(m.data)=8;""")
    ]
    # transferencias que SAEM de cada conta = mov ENTRADA com banco_origem_id
    transf_out = [
        {"origem": "transf", "id": int(r[0]), "data": date(*map(int, r[1].split("-"))),
         "valor": round(float(r[2]), 2),
         "banco_id": None if r[3] in ("", "NULL") else int(r[3]),
         "banco_origem_id": None if r[4] in ("", "NULL") else int(r[4]),
         "desc": (r[5] or "")[:46]}
        for r in q(ssh, """
            SELECT m.id, m.data, m.valor, m.banco_id, m.banco_origem_id, LEFT(COALESCE(m.descricao,''),50)
            FROM fin_movimentacoes m
            WHERE m.tipo='ENTRADA' AND m.deletado_em IS NULL AND m.banco_origem_id IS NOT NULL
              AND YEAR(m.data)=2026 AND MONTH(m.data)=8;""")
    ]
    ssh.close()
    return saidas, transf_out


def casa(a, b, dias=DIAS):
    return abs(a["valor"] - b["valor"]) <= TOL and abs((a["data"] - b["data"]).days) <= dias


def parear(ext_itens, sis_itens):
    sis_livre = list(sis_itens)
    bate, ext_sem = [], []
    for e in sorted(ext_itens, key=lambda x: x["data"]):
        cand = [s for s in sis_livre if casa(e, s)]
        cand.sort(key=lambda s: 0 if norm(s.get("forn") or s.get("desc"))[:5]
                  and norm(s.get("forn") or s.get("desc"))[:5] in norm(e["descricao"]) else 1)
        if cand:
            bate.append((e, cand[0]))
            sis_livre.remove(cand[0])
        else:
            ext_sem.append(e)

    bate_soma = []
    for e in list(ext_sem):
        achou = None
        for n in (2, 3):
            for combo in combinations([s for s in sis_livre
                                       if abs((s["data"] - e["data"]).days) <= DIAS], n):
                if abs(sum(s["valor"] for s in combo) - e["valor"]) <= TOL:
                    achou = combo
                    break
            if achou:
                break
        if achou:
            bate_soma.append((e, list(achou)))
            ext_sem.remove(e)
            for s in achou:
                sis_livre.remove(s)

    for s in list(sis_livre):
        achou = None
        for n in (2, 3):
            for combo in combinations([e for e in ext_sem
                                       if abs((e["data"] - s["data"]).days) <= DIAS], n):
                if abs(sum(x["valor"] for x in combo) - s["valor"]) <= TOL:
                    achou = combo
                    break
            if achou:
                break
        if achou:
            bate_soma.append((list(achou), s))
            sis_livre.remove(s)
            for e in achou:
                ext_sem.remove(e)

    return bate, bate_soma, ext_sem, sis_livre


def main():
    data = json.load(open(NORM, encoding="utf-8"))
    lanc = data["lancamentos"]

    print("Carregando SAIDAS da produção via SSH...")
    saidas, transf_out = carregar_sistema()
    tot_sis_geral = round(sum(s["valor"] for s in saidas), 2)
    print(f"  {len(saidas)} saídas (fin_movimentacoes SAIDA) em ago/2026 · R$ {tot_sis_geral:,.2f}")
    print(f"  {len(transf_out)} transferências que saíram de contas nossas\n")

    resumo = []
    for bid, rot in BANCOS.items():
        if SO_CONTA and bid != SO_CONTA:
            continue
        ext = [{"data": d(it["data"]), "valor": abs(it["valor"]), "descricao": it["descricao"], "tipo": it["tipo"]}
               for it in lanc if it["banco_id"] == bid
               and it["tipo"] in ("SAIDA", "TARIFA", "DEBITO_CARTAO") and it["valor"] < 0]
        ext_transf_out = [{"data": d(it["data"]), "valor": abs(it["valor"]), "descricao": it["descricao"]}
                          for it in lanc if it["banco_id"] == bid
                          and it["tipo"] == "TRANSFERENCIA_ENTRE_CONTAS" and it["valor"] < 0]

        sis = [s for s in saidas if s["banco_id"] == bid]
        sis_outros = [s for s in saidas if s["banco_id"] != bid]  # pode ser desta conta, tá na errada
        sis_transf = [t for t in transf_out if t["banco_origem_id"] == bid]

        tot_ext = round(sum(e["valor"] for e in ext), 2)
        tot_sis = round(sum(s["valor"] for s in sis), 2)

        print("=" * 84)
        print(f"{rot}  (banco_id {bid})")
        print("=" * 84)
        print(f"  EXTRATO saídas  : {len(ext):3} itens   R$ {tot_ext:>13,.2f}   "
              f"(+ {len(ext_transf_out)} transf. saíram R$ {sum(e['valor'] for e in ext_transf_out):,.2f})")
        print(f"  SISTEMA saídas  : {len(sis):3} itens   R$ {tot_sis:>13,.2f}   "
              f"(+ {len(sis_transf)} transf. saíram R$ {sum(t['valor'] for t in sis_transf):,.2f})")
        print(f"  Δ SAÍDAS (sistema − extrato)          R$ {tot_sis - tot_ext:>13,.2f}\n")

        bate, bate_soma, ext_sem, sis_sem = parear(ext, sis)

        # o que sobrou no extrato: tenta casar com saída lançada em OUTRA conta
        ext_sem2, conta_errada = [], []
        sis_outros_livre = list(sis_outros)
        for e in list(ext_sem):
            cand = [s for s in sis_outros_livre if casa(e, s)]
            if cand:
                conta_errada.append((e, cand[0]))
                sis_outros_livre.remove(cand[0])
                ext_sem.remove(e)
            else:
                pass
        ext_falta = ext_sem

        print(f"  ✅ BATE 1:1: {len(bate)}   ✅ BATE por soma: {len(bate_soma)}")
        if FULL:
            for e, s in bate:
                print(f"     {e['data']:%d/%m} R$ {e['valor']:>10,.2f}  {e['descricao'][:40]:40} = mov {s['id']} {s['categoria'][:22]}")

        if conta_errada:
            print(f"\n  🟡 SAIU DESTA CONTA (extrato) MAS LANÇADO EM OUTRO BANCO ({len(conta_errada)} · "
                  f"R$ {sum(e['valor'] for e, _ in conta_errada):,.2f}) — corrigir banco_id:")
            for e, s in conta_errada:
                print(f"     {e['data']:%d/%m} R$ {e['valor']:>10,.2f}  {e['descricao'][:38]:38}  "
                      f"→ mov {s['id']} (hoje banco {s['banco_id']}) {s['grupo'][:4]}/{s['categoria'][:20]} {s['desc'][:24]}")

        if ext_falta:
            print(f"\n  ❌ NO EXTRATO, SEM PAR NO SISTEMA ({len(ext_falta)} · "
                  f"R$ {sum(e['valor'] for e in ext_falta):,.2f}) — saída que NÃO foi lançada:")
            for e in sorted(ext_falta, key=lambda x: x["data"]):
                print(f"     {e['data']:%d/%m} R$ {e['valor']:>10,.2f}  {e['descricao'][:62]}")

        sis_sem_transf = [s for s in sis_sem if parece_transf(s)]
        sis_sem_real = [s for s in sis_sem if not parece_transf(s)]

        if sis_sem_transf:
            v = sum(s["valor"] for s in sis_sem_transf)
            print(f"\n  🔁 LANÇADO COMO SAÍDA MAS É TRANSFERÊNCIA INTERNA ({len(sis_sem_transf)} · "
                  f"R$ {v:,.2f}) — já contabilizada do outro lado (mov ENTRADA c/ banco_origem_id) → soft-delete:")
            for s in sorted(sis_sem_transf, key=lambda x: x["data"]):
                print(f"     {s['data']:%d/%m} R$ {s['valor']:>10,.2f}  mov {s['id']:>5}  "
                      f"{s['categoria'][:20]:20} {s['desc'][:38]}")

        if sis_sem_real:
            print(f"\n  ⚠️  NO SISTEMA (banco {bid}), SEM PAR NO EXTRATO ({len(sis_sem_real)} · "
                  f"R$ {sum(s['valor'] for s in sis_sem_real):,.2f}) — conta errada / valor / duplicado:")
            for s in sorted(sis_sem_real, key=lambda x: x["data"]):
                print(f"     {s['data']:%d/%m} R$ {s['valor']:>10,.2f}  mov {s['id']:>5}  "
                      f"{s['grupo'][:4]}/{s['categoria'][:20]:20} {(s['forn'] or s['desc'])[:32]:32}")

        resumo.append((rot, bid, tot_ext, tot_sis, len(ext_falta), len(sis_sem_real),
                       round(sum(e['valor'] for e in ext_falta), 2),
                       round(sum(s['valor'] for s in sis_sem_real), 2),
                       round(sum(s['valor'] for s in sis_sem_transf), 2)))
        print()

    print("=" * 84)
    print("RESUMO SAÍDAS — Δ = sistema − extrato (positivo = sistema tem saída a mais)")
    print("=" * 84)
    for rot, bid, te, ts, nf, ns, vf, vs, vt in resumo:
        print(f"  {rot:14} ext {te:>11,.2f}  sis {ts:>11,.2f}  Δ {ts-te:>11,.2f}")
        print(f"  {'':14}   transf. lançada como saída (soft-delete): R$ {vt:,.2f}")
        print(f"  {'':14}   falta lançar: {nf} (R$ {vf:,.2f})   sistema-sem-par real: {ns} (R$ {vs:,.2f})")
        print(f"  {'':14}   → Δ residual estimado após limpar transf: R$ {ts - te - vt:,.2f}")


if __name__ == "__main__":
    main()
