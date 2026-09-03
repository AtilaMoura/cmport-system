# -*- coding: utf-8 -*-
"""
Fase D2 — Passo 2: soft-delete da folha solta Jan–Jul/2026 (73 fin_movimentacoes
órfãs + 5 despesas avulsas). Cada uma vai ser substituída pela migração vinculada
do Passo 3.

Lê `folha_d2_input.json["remover"]`. NUNCA faz DELETE — só
`INSERT registros_exclusoes` (snapshot) + `UPDATE ... SET deletado_em = NOW()`.

Checagem de segurança por item (aborta o script inteiro se QUALQUER item falhar):
  - registro existe e deletado_em IS NULL
  - mov_orfa: nenhuma despesa_parcela.movimentacao_id aponta pra ela; nenhum
    vínculo em fin_movimentacao_servicos/_orcamentos/_os_fornecedor
  - valor no banco == valor do JSON (tolerância R$0,02)
  - despesa_avulsa: parcelas só da própria despesa; movs das parcelas conhecidas

Uso:
  cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/remover_folha_solta_d2.py [--ambiente producao] [--aplicar]
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _folha_d2_ssh import conectar, parse_args, carregar_input, sql_str

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

TOL = 0.02
MOTIVO = "Fase D2 — folha solta substituída pela migração vinculada"


def _dict_row(db, tabela, rid):
    """SELECT * da linha como dict {coluna: valor} pro snapshot."""
    cols = [r[0] for r in db.q(f"SHOW COLUMNS FROM {tabela}")]
    vals = db.q(f"SELECT {', '.join(cols)} FROM {tabela} WHERE id = {rid}")
    if not vals:
        return None
    return dict(zip(cols, vals[0]))


def _registrar_exclusao(db, tipo, rid, dados, aplicar):
    payload = json.dumps(dados, ensure_ascii=False, indent=2, default=str)
    sql = (f"INSERT INTO registros_exclusoes "
           f"(tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao, data_exclusao) "
           f"VALUES ({sql_str(tipo)}, {rid}, {sql_str(payload)}, {sql_str(MOTIVO)}, 'sistema', NOW())")
    if aplicar:
        db.exec(sql)


def main():
    args = parse_args("Fase D2 Passo 2 — soft-delete da folha solta Jan–Jul")
    inp = carregar_input()
    db = conectar(args.ambiente)
    itens = inp["remover"]
    mov = [x for x in itens if x["fonte"] == "mov_orfa"]
    desp = [x for x in itens if x["fonte"] == "despesa_avulsa"]

    print(f"=== Passo 2 — soft-delete ({args.ambiente}, {'APLICAR' if args.aplicar else 'DRY-RUN'}) ===")
    print(f"    {len(mov)} fin_movimentacoes + {len(desp)} despesas  "
          f"(esperado: 73 + 5 = 78, total R$ {sum(x['valor'] for x in itens):,.2f})\n")

    if len(itens) != 78:
        print(f"  !! lista tem {len(itens)} itens, esperado 78 — ABORTAR")
        sys.exit(1)

    falhas = []
    ja_feitos = 0

    # ---- 1. checagem de segurança de TODAS as movimentações ----
    print("--- fin_movimentacoes órfãs ---")
    plano_mov = []
    for x in sorted(mov, key=lambda r: r["id"]):
        mid = x["id"]
        row = db.q(f"SELECT id, valor, deletado_em, tipo FROM fin_movimentacoes WHERE id = {mid}")
        if not row:
            falhas.append(f"mov {mid}: NÃO EXISTE"); continue
        _id, valor, delem, tipo = row[0]
        if str(delem) != "NULL":
            print(f"  id {mid:>4}  já soft-deletada ({delem}) — pulando (idempotência)")
            ja_feitos += 1
            continue
        problemas = []
        if tipo != "SAIDA":
            problemas.append(f"tipo={tipo}")
        if abs(float(valor) - x["valor"]) > TOL:
            problemas.append(f"valor banco {valor} ≠ json {x['valor']}")
        npar = int(db.q(f"SELECT COUNT(*) FROM despesa_parcelas WHERE movimentacao_id = {mid}")[0][0])
        if npar:
            problemas.append(f"{npar} despesa_parcela aponta pra ela")
        for tab in ("fin_movimentacao_servicos", "fin_movimentacao_orcamentos", "fin_movimentacao_os_fornecedor"):
            n = int(db.q(f"SELECT COUNT(*) FROM {tab} WHERE movimentacao_id = {mid}")[0][0])
            if n:
                problemas.append(f"{n} vínculo em {tab}")
        status = "OK" if not problemas else "FALHA: " + "; ".join(problemas)
        print(f"  id {mid:>4}  {x['data']}  R$ {x['valor']:>9,.2f}  {x['funcionario'][:22]:22}  {status}")
        if problemas:
            falhas.append(f"mov {mid}: {'; '.join(problemas)}")
        else:
            plano_mov.append((mid, x))

    # ---- 2. checagem das despesas avulsas ----
    print("\n--- despesas avulsas ---")
    plano_desp = []
    for x in sorted(desp, key=lambda r: r["id"]):
        did = x["id"]
        row = db.q(f"SELECT id, valor_total, deletado_em, tipo_pagamento FROM despesas WHERE id = {did}")
        if not row:
            falhas.append(f"despesa {did}: NÃO EXISTE"); continue
        _id, valor, delem, tipo_pag = row[0]
        if str(delem) != "NULL":
            print(f"  despesa {did:>4}  já soft-deletada ({delem}) — pulando (idempotência)")
            ja_feitos += 1
            continue
        problemas = []
        if abs(float(valor) - x["valor"]) > TOL:
            problemas.append(f"valor_total {valor} ≠ json {x['valor']}")
        parcelas = db.q(f"SELECT id, status, movimentacao_id FROM despesa_parcelas WHERE despesa_id = {did}")
        movs_parcela = [int(p[2]) for p in parcelas if str(p[2]) != "NULL"]
        # nenhuma parcela conciliada com serviço/fornecedor de outra coisa
        for mpid in movs_parcela:
            for tab in ("fin_movimentacao_servicos", "fin_movimentacao_orcamentos", "fin_movimentacao_os_fornecedor"):
                n = int(db.q(f"SELECT COUNT(*) FROM {tab} WHERE movimentacao_id = {mpid}")[0][0])
                if n:
                    problemas.append(f"mov {mpid} da parcela tem {n} vínculo em {tab}")
        status = "OK" if not problemas else "FALHA: " + "; ".join(problemas)
        print(f"  despesa {did:>4}  {x['data']}  R$ {x['valor']:>9,.2f}  {x['funcionario'][:22]:22}  "
              f"{len(parcelas)} parc, movs={movs_parcela}  {status}")
        if problemas:
            falhas.append(f"despesa {did}: {'; '.join(problemas)}")
        else:
            plano_desp.append((did, x, [int(p[0]) for p in parcelas], movs_parcela))

    if falhas:
        print(f"\n!! {len(falhas)} FALHA(S) DE SEGURANÇA — nada será alterado:")
        for f in falhas:
            print(f"   - {f}")
        db.close()
        sys.exit(1)

    print(f"\n✓ {len(plano_mov) + len(plano_desp)} a soft-deletar · {ja_feitos} já feitos (pulados).")

    if not args.aplicar:
        print("\nDRY-RUN — rode com --aplicar pra executar o soft-delete.")
        db.close()
        return

    # ---- 3. aplicar ----
    print("\n--- aplicando ---")
    for mid, x in plano_mov:
        dados = _dict_row(db, "fin_movimentacoes", mid)
        _registrar_exclusao(db, "fin_movimentacao", mid, dados, True)
        db.exec(f"UPDATE fin_movimentacoes SET deletado_em = NOW() WHERE id = {mid} AND deletado_em IS NULL")
    print(f"  {len(plano_mov)} movimentações → soft-delete + snapshot")

    for did, x, parcela_ids, movs_parcela in plano_desp:
        dados = _dict_row(db, "despesas", did)
        dados["_parcelas"] = [_dict_row(db, "despesa_parcelas", pid) for pid in parcela_ids]
        _registrar_exclusao(db, "despesa", did, dados, True)
        db.exec(f"UPDATE despesas SET deletado_em = NOW() WHERE id = {did} AND deletado_em IS NULL")
        for mpid in movs_parcela:
            mdados = _dict_row(db, "fin_movimentacoes", mpid)
            if mdados and str(mdados.get("deletado_em")) == "NULL":
                _registrar_exclusao(db, "fin_movimentacao", mpid, mdados, True)
                db.exec(f"UPDATE fin_movimentacoes SET deletado_em = NOW() WHERE id = {mpid} AND deletado_em IS NULL")
    print(f"  {len(plano_desp)} despesas + suas movimentações → soft-delete + snapshot")

    db.commit()
    print("\nAPLICADO.")
    db.close()


if __name__ == "__main__":
    main()
