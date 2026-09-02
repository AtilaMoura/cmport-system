# -*- coding: utf-8 -*-
"""
Passo 2 do PLANO_RECONCILIACAO_EXTRATOS_AGOSTO.md — cruza, POR CONTA, o extrato
bancario normalizado (Passo 1) com as ENTRADAS registradas na PRODUCAO.

Entradas do sistema por conta = boletos PAGO/BAIXADO/PARCIAL + recibos ENTRADA PAGO
+ fin_movimentacoes ENTRADA, todos com banco_id = a conta, mes 8/2026.

Saida: pra cada conta (Inter CMPORT=2, Inter TEC=4, Itau CMPORT=1)
  (a) NO EXTRATO, SEM PAR NO SISTEMA  -> dinheiro caiu e nao foi lancado (ou lancado sem banco)
  (b) NO SISTEMA, SEM PAR NO EXTRATO  -> lancado na conta errada / valor errado / duplicado
  (c) BATE
+ confere os totais (Σ entrada extrato x Σ entrada sistema) e o saldo.

Transferencia interna recebida entra como "entrada" so no resumo de saldo, nao na
lista de itens a casar (essas vao pro Passo 3).

So LEITURA (SSH read-only na producao). Nada e alterado.

Uso: cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/comparar_extratos_agosto.py
"""
import io
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import paramiko

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NORM = os.path.join(BASE, "fluxo-financeiro", "extratos_agosto_normalizado.json")
TOL = 0.02
DIAS = 7  # boleto/recibo pode ser lancado no sistema alguns dias antes/depois de compensar

BANCOS = {2: "Inter CMPORT", 4: "Inter TEC", 1: "Itau CMPORT"}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def d(s):
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


# ---------- sistema (producao via SSH) ----------
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

    boletos = [
        {"origem": "boleto", "id": int(r[0]), "data": date(*map(int, r[1].split("-"))),
         "valor": round(float(r[5] if r[3] == "PARCIAL" and r[5] not in ("", "NULL", None) else r[2]), 2),
         "banco_id": None if r[4] in ("", "NULL") else int(r[4]),
         "nome": r[6], "extra": f"NF {r[7]} p{r[8]} ({r[3]})"}
        for r in q(ssh, """
            SELECT b.id, b.data_pagamento, b.valor_nominal, b.situacao, b.banco_id,
                   b.valor_total_recebido, COALESCE(c.nome,''), COALESCE(nf.numero_nota,''),
                   COALESCE(b.numero_parcela,'')
            FROM boletos b
            LEFT JOIN notas_fiscais nf ON nf.id=b.nota_fiscal_id
            LEFT JOIN condominios c ON c.id=nf.condominio_id
            WHERE b.situacao IN ('PAGO','BAIXADO','PARCIAL')
              AND YEAR(b.data_pagamento)=2026 AND MONTH(b.data_pagamento)=8;""")
    ]
    recibos = [
        {"origem": "recibo", "id": int(r[0]), "data": date(*map(int, r[1].split("-"))),
         "valor": round(float(r[2]), 2),
         "banco_id": None if r[3] in ("", "NULL") else int(r[3]),
         "nome": r[4], "extra": f"rec {r[5]}"}
        for r in q(ssh, """
            SELECT r.id, r.data_pagamento, r.valor, r.banco_id,
                   COALESCE(c.nome, r.cliente_nome_avulso, ''), COALESCE(r.numero_recibo,'')
            FROM recibos r LEFT JOIN condominios c ON c.id=r.condominio_id
            WHERE r.tipo='ENTRADA' AND r.status='PAGO' AND r.deletado_em IS NULL
              AND YEAR(r.data_pagamento)=2026 AND MONTH(r.data_pagamento)=8;""")
    ]
    movs = [
        {"origem": "mov", "id": int(r[0]), "data": date(*map(int, r[1].split("-"))),
         "valor": round(float(r[2]), 2),
         "banco_id": None if r[3] in ("", "NULL") else int(r[3]),
         "banco_origem_id": None if r[4] in ("", "NULL") else int(r[4]),
         "nome": r[5][:34], "extra": f"mov cat={r[6]} orig_banco={r[4]}"}
        for r in q(ssh, """
            SELECT m.id, m.data, m.valor, m.banco_id, m.banco_origem_id,
                   LEFT(COALESCE(m.descricao,''),40), COALESCE(m.categoria_id,'')
            FROM fin_movimentacoes m
            WHERE m.tipo='ENTRADA' AND m.deletado_em IS NULL
              AND YEAR(m.data)=2026 AND MONTH(m.data)=8;""")
    ]
    ssh.close()
    return boletos + recibos + movs


# ---------- cruzamento ----------
def casa(a, b, dias=DIAS):
    return abs(a["valor"] - b["valor"]) <= TOL and abs((a["data"] - b["data"]).days) <= dias


def parear(extrato_itens, sis_itens):
    """
    Retorna (bate, bate_soma, extrato_sem_par, sistema_sem_par).
    1) casamento 1:1 por valor+data.
    2) casamento N:1 — um lancamento do extrato = soma de 2-3 do sistema
       (boletos parcelados que o banco credita num TEF/deposito so) e vice-versa.
    """
    sis_livre = list(sis_itens)
    bate, ext_sem = [], []
    for e in sorted(extrato_itens, key=lambda x: x["data"]):
        cand = [s for s in sis_livre if casa(e, s)]
        cand.sort(key=lambda s: 0 if norm(s["nome"])[:6] and norm(s["nome"])[:6] in norm(e["descricao"]) else 1)
        if cand:
            bate.append((e, cand[0]))
            sis_livre.remove(cand[0])
        else:
            ext_sem.append(e)

    # N:1 — extrato = soma de 2/3 do sistema
    bate_soma = []
    from itertools import combinations
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

    # 1:N — 1 do sistema = soma de 2/3 do extrato
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
    contas = data["contas"]

    print("Carregando ENTRADAS da produção via SSH...")
    sis = carregar_sistema()
    print(f"  {len(sis)} entradas no sistema em ago/2026 "
          f"({sum(1 for s in sis if s['origem']=='boleto')} boletos, "
          f"{sum(1 for s in sis if s['origem']=='recibo')} recibos, "
          f"{sum(1 for s in sis if s['origem']=='mov')} movs)\n")

    sis_sem_banco = [s for s in sis if s["banco_id"] is None]
    # todas as transferências internas do sistema (mov ENTRADA com banco_origem_id) —
    # o parser do Passo 1 só marca como TRANSFERENCIA os Pix entre 308310110↔524203806;
    # quando a transf sai do Itaú ela chega na Inter como "Pix recebido CMPORT ...".
    todas_transf_sis = [s for s in sis if s["origem"] == "mov"
                        and s.get("banco_origem_id") is not None]

    for bid, rot in BANCOS.items():
        conta_key = next((k for k, v in contas.items() if v["banco_id"] == bid), None)
        ext = [{"data": d(it["data"]), "valor": it["valor"], "descricao": it["descricao"],
                "tipo": it["tipo"], "agregado": it.get("agregado", False)}
               for it in lanc if it["banco_id"] == bid]
        ext_ent_raw = [e for e in ext if e["tipo"] == "ENTRADA" and not e["agregado"]]
        ext_agreg = [e for e in ext if e["agregado"]]
        ext_transf_in = [e for e in ext if e["tipo"] == "TRANSFERENCIA_ENTRE_CONTAS" and e["valor"] > 0]

        sis_all = [s for s in sis if s["banco_id"] == bid]
        # transferência interna no sistema = mov ENTRADA com banco_origem_id preenchido
        # (dinheiro que veio de outra conta nossa) -> vai pro Passo 3, não é entrada real
        sis_transf = [s for s in sis_all if s["origem"] == "mov"
                      and s.get("banco_origem_id") is not None]
        sis_c = [s for s in sis_all if s not in sis_transf]

        # linha do extrato marcada ENTRADA que na verdade é transferência interna
        # (Pix vindo do Itaú sob o CNPJ CMPORT) — casa com um mov de transf desta conta.
        transf_livre = list(sis_transf)
        ext_ent, ext_transf_oculta = [], []
        for e in sorted(ext_ent_raw, key=lambda x: x["data"]):
            cand = [t for t in transf_livre
                    if abs(t["valor"] - e["valor"]) <= TOL
                    and abs((t["data"] - e["data"]).days) <= 3]
            if cand:
                ext_transf_oculta.append((e, cand[0]))
                transf_livre.remove(cand[0])
            else:
                ext_ent.append(e)

        tot_ext = round(sum(e["valor"] for e in ext_ent) + sum(e["valor"] for e in ext_agreg), 2)
        tot_sis = round(sum(s["valor"] for s in sis_c), 2)

        print("=" * 82)
        print(f"{rot}  (banco_id {bid})")
        print("=" * 82)
        print(f"  EXTRATO entradas : {len(ext_ent):3} itens + {len(ext_agreg)} agregados(Itaú)  "
              f"R$ {tot_ext:>12,.2f}")
        print(f"  SISTEMA entradas : {len(sis_c):3} itens                       R$ {tot_sis:>12,.2f}")
        print(f"  Δ (extrato − sistema)                                R$ {tot_ext - tot_sis:>12,.2f}")
        print(f"  (transferências internas RECEBIDAS — Passo 3 — "
              f"extrato {len(ext_transf_in)} R$ {sum(e['valor'] for e in ext_transf_in):,.2f} · "
              f"sistema {len(sis_transf)} R$ {sum(s['valor'] for s in sis_transf):,.2f})\n")

        bate, bate_soma, ext_sem, sis_sem = parear(ext_ent, sis_c)

        # tenta explicar o que sobrou no extrato com lançamentos SEM banco
        ext_sem2, achou_sem_banco = [], []
        for e in ext_sem:
            cand = [s for s in sis_sem_banco if casa(e, s)]
            if cand:
                achou_sem_banco.append((e, cand[0]))
                sis_sem_banco.remove(cand[0])
            else:
                ext_sem2.append(e)

        print(f"  ✅ BATE 1:1: {len(bate)}")
        if bate_soma:
            print(f"  ✅ BATE por soma (N:1 / 1:N): {len(bate_soma)}")
            for ext_part, sis_part in bate_soma:
                el = ext_part if isinstance(ext_part, list) else [ext_part]
                sl = sis_part if isinstance(sis_part, list) else [sis_part]
                de = " + ".join(f"{x['data']:%d/%m} R$ {x['valor']:,.2f}" for x in el)
                ds = " + ".join(f"{s['origem']} id={s['id']} R$ {s['valor']:,.2f}" for s in sl)
                print(f"     EXTRATO [{de}]  ==  SISTEMA [{ds}]")
        if achou_sem_banco:
            print(f"\n  🟡 CAIU NESSA CONTA MAS LANÇADO SEM BANCO ({len(achou_sem_banco)}) "
                  f"— provável desta conta, falta o banco_id:")
            for e, s in achou_sem_banco:
                print(f"     {e['data']:%d/%m} R$ {e['valor']:>9,.2f}  {s['origem']} id={s['id']} "
                      f"{s['nome'][:26]:26} {s['extra'][:34]}")

        ext_falta = ext_sem2

        if ext_transf_oculta:
            print(f"\n  🔁 NO EXTRATO COMO 'Pix recebido', É TRANSFERÊNCIA INTERNA já lançada no sistema "
                  f"({len(ext_transf_oculta)} · R$ {sum(e['valor'] for e, _ in ext_transf_oculta):,.2f}) "
                  f"— Passo 1 não classificou (saiu do Itaú):")
            for e, t in ext_transf_oculta:
                print(f"     {e['data']:%d/%m} R$ {e['valor']:>9,.2f}  {e['descricao'][:46]:46} "
                      f"→ mov id={t['id']} banco {t.get('banco_origem_id')}→{bid}")

        if ext_falta:
            print(f"\n  ❌ NO EXTRATO, SEM PAR NO SISTEMA ({len(ext_falta)} · "
                  f"R$ {sum(e['valor'] for e in ext_falta):,.2f}) — dinheiro que caiu e NÃO foi lançado:")
            for e in ext_falta:
                print(f"     {e['data']:%d/%m} R$ {e['valor']:>9,.2f}  {e['descricao'][:60]}")

        if ext_agreg:
            print(f"\n  📦 DIAS AGREGADOS DO ITAÚ (soma do dia no extrato × boletos banco 1):")
            from itertools import combinations as _comb
            for e in sorted(ext_agreg, key=lambda x: x["data"]):
                # 1) soma dos boletos do sistema com data ±3 dias
                cand_dia = [s for s in sis_sem if abs((s["data"] - e["data"]).days) <= 3]
                combo_ok = None
                for n in range(1, min(4, len(cand_dia)) + 1):
                    for combo in _comb(cand_dia, n):
                        if abs(sum(s["valor"] for s in combo) - e["valor"]) <= TOL:
                            combo_ok = combo
                            break
                    if combo_ok:
                        break
                if combo_ok:
                    for s in combo_ok:
                        sis_sem.remove(s)
                    ids = ", ".join(f"{s['origem']} {s['id']} ({s['data']:%d/%m} R$ {s['valor']:,.2f})"
                                    for s in combo_ok)
                    print(f"     {e['data']:%d/%m}  extrato R$ {e['valor']:>9,.2f}  ✅  = {ids}")
                else:
                    dia_sis = round(sum(s["valor"] for s in cand_dia), 2)
                    print(f"     {e['data']:%d/%m}  extrato R$ {e['valor']:>9,.2f}  "
                          f"sistema(±3d) R$ {dia_sis:>9,.2f}  ❌ sem combinação exata")

        if sis_transf:
            print(f"\n  🔁 TRANSFERÊNCIAS INTERNAS NO SISTEMA nesta conta ({len(sis_transf)} · "
                  f"R$ {sum(s['valor'] for s in sis_transf):,.2f}) — conferir contra os 2 extratos no Passo 3:")
            for s in sorted(sis_transf, key=lambda x: x["data"]):
                print(f"     {s['data']:%d/%m} R$ {s['valor']:>9,.2f}  mov id={s['id']} "
                      f"origem→destino banco {s.get('banco_origem_id')}→{bid}  {s['nome'][:30]}")

        if sis_sem:
            print(f"\n  ⚠️  NO SISTEMA (banco {bid}), SEM PAR NO EXTRATO ({len(sis_sem)} · "
                  f"R$ {sum(s['valor'] for s in sis_sem):,.2f}) — conta errada / valor / duplicado / data fora:")
            for s in sorted(sis_sem, key=lambda x: x["data"]):
                print(f"     {s['data']:%d/%m} R$ {s['valor']:>9,.2f}  {s['origem']} id={s['id']} "
                      f"{s['nome'][:26]:26} {s['extra'][:38]}")
        print()

    # entradas do sistema em contas que nao temos extrato (Bradesco 3, BTG 5) ou sem banco
    outros = [s for s in sis if s["banco_id"] in (3, 5)]
    if outros:
        print("=" * 82)
        print(f"ENTRADAS EM BRADESCO(3)/BTG(5) — sem extrato pra cruzar ({len(outros)} · "
              f"R$ {sum(s['valor'] for s in outros):,.2f})")
        for s in outros:
            print(f"   {s['data']:%d/%m} R$ {s['valor']:>9,.2f}  banco {s['banco_id']}  "
                  f"{s['origem']} id={s['id']} {s['nome'][:30]}")
    restante_sem_banco = [s for s in sis if s["banco_id"] is None]
    print("\n" + "=" * 82)
    print(f"ENTRADAS NO SISTEMA AINDA SEM banco_id (não casaram com nenhum extrato): "
          f"{len(restante_sem_banco)} · R$ {sum(s['valor'] for s in restante_sem_banco):,.2f}")
    for s in sorted(restante_sem_banco, key=lambda x: x["data"]):
        print(f"   {s['data']:%d/%m} R$ {s['valor']:>9,.2f}  {s['origem']} id={s['id']} "
              f"{s['nome'][:28]:28} {s['extra'][:36]}")


if __name__ == "__main__":
    main()
