# -*- coding: utf-8 -*-
"""
Fase D2 — Passo 3: recria a folha Jan–Jul/2026 a partir de `despesas_funcionario.json`
(planilha FLUXO da cliente), vinculada a funcionário + categoria nova.

Lê `folha_d2_input.json["criar"]` (144 lançamentos, R$ 176.429,85). Pra cada um:
  1. Despesa UNICO (funcionario_id, categoria_id, cnpj, valor_total)
  2. DespesaParcela 1/1 status=PAGO, banco_id=NULL, forma=PIX
  3. fin_movimentacoes SAIDA (origem=MANUAL, status=VALIDADO, banco_id=NULL) —
     mesma estrutura que DespesaService.marcar_pago gera
  4. parcela.movimentacao_id = mov.id

Idempotente: pula se já existe Despesa com a mesma observacao e deletado_em IS NULL.

Uso:
  cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/migrar_folha_historica_d2.py [--ambiente producao] [--aplicar]
"""
import io
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _folha_d2_ssh import conectar, parse_args, carregar_input, sql_str, CNPJ

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

TOTAL_ESPERADO = 176429.85
N_ESPERADO = 144


def main():
    args = parse_args("Fase D2 Passo 3 — recria a folha Jan–Jul vinculada")
    inp = carregar_input()
    db = conectar(args.ambiente)
    criar = inp["criar"]

    print(f"=== Passo 3 — migrar folha ({args.ambiente}, {'APLICAR' if args.aplicar else 'DRY-RUN'}) ===")
    print(f"    {len(criar)} lançamentos, R$ {sum(x['valor'] for x in criar):,.2f}\n")

    if len(criar) != N_ESPERADO or abs(sum(x["valor"] for x in criar) - TOTAL_ESPERADO) > 0.05:
        print("  !! contagem/total divergem do esperado — ABORTAR")
        sys.exit(1)

    # valida categorias e funcionários referenciados
    cats_ok = {int(r[0]) for r in db.q("SELECT id FROM fin_categorias WHERE grupo = 'FUNCIONARIO'")}
    funcs_ok = {int(r[0]) for r in db.q("SELECT id FROM funcionarios WHERE deletado_em IS NULL")}
    for x in criar:
        if x["categoria_id"] not in cats_ok:
            print(f"  !! categoria {x['categoria_id']} não é grupo FUNCIONARIO (linha {x['linha_planilha']}) — ABORTAR")
            sys.exit(1)
        if x["funcionario_id"] not in funcs_ok:
            print(f"  !! funcionário {x['funcionario_id']} inexistente (linha {x['linha_planilha']}) — ABORTAR")
            sys.exit(1)
        if x["cnpj"] not in CNPJ:
            print(f"  !! cnpj '{x['cnpj']}' inválido (linha {x['linha_planilha']}) — ABORTAR")
            sys.exit(1)

    resumo = defaultdict(lambda: [0, 0.0])
    ja_existem = 0
    a_criar = []
    for x in criar:
        existe = db.q(f"SELECT id FROM despesas WHERE observacao = {sql_str(x['observacao'])} "
                      f"AND deletado_em IS NULL")
        if existe:
            ja_existem += 1
            continue
        a_criar.append(x)
        mm = x["data_pagamento"][:7]
        resumo[(mm, x["funcionario_id"], x["categoria_id"])][0] += 1
        resumo[(mm, x["funcionario_id"], x["categoria_id"])][1] += x["valor"]

    print(f"  {ja_existem} já existem em produção (idempotência) · {len(a_criar)} a criar\n")
    print("  resumo mês × funcionário × categoria (a criar):")
    for (mm, fid, cat), (n, v) in sorted(resumo.items()):
        print(f"    {mm}  func {fid}  cat {cat}   {n:>2}x   R$ {v:>10,.2f}")
    print(f"\n  TOTAL a criar: {len(a_criar)} lançamentos, R$ {sum(x['valor'] for x in a_criar):,.2f}")

    if not args.aplicar:
        print("\nDRY-RUN — rode com --aplicar pra inserir.")
        db.close()
        return

    print("\n--- inserindo ---")
    n = 0
    for x in a_criar:
        cnpj = CNPJ[x["cnpj"]]
        desc = sql_str(x["descricao"])
        obs = sql_str(x["observacao"])
        # 1. despesa
        despesa_id = db.exec(
            f"INSERT INTO despesas "
            f"(descricao, funcionario_id, categoria_id, cnpj, tipo_pagamento, valor_total, "
            f" total_parcelas, ativo, observacao, criado_em, atualizado_em) "
            f"VALUES ({desc}, {x['funcionario_id']}, {x['categoria_id']}, {sql_str(cnpj)}, "
            f"'UNICO', {x['valor']:.2f}, 1, 1, {obs}, NOW(), NOW())")
        # 2. parcela
        parcela_id = db.exec(
            f"INSERT INTO despesa_parcelas "
            f"(despesa_id, numero_parcela, total_parcelas, valor, data_vencimento, status, "
            f" data_pagamento, banco_id, forma_pagamento, criado_em, atualizado_em) "
            f"VALUES ({despesa_id}, 1, 1, {x['valor']:.2f}, {sql_str(x['data_vencimento'])}, "
            f"'PAGO', {sql_str(x['data_pagamento'])}, NULL, 'PIX', NOW(), NOW())")
        # 3. movimentação (mesma estrutura do marcar_pago)
        mov_id = db.exec(
            f"INSERT INTO fin_movimentacoes "
            f"(data, descricao, valor, tipo, categoria_id, origem, status, banco_id, "
            f" forma_pagamento, criado_em, atualizado_em) "
            f"VALUES ({sql_str(x['data_pagamento'])}, {desc}, {x['valor']:.2f}, 'SAIDA', "
            f"{x['categoria_id']}, 'MANUAL', 'VALIDADO', NULL, 'PIX', NOW(), NOW())")
        # 4. vincular
        db.exec(f"UPDATE despesa_parcelas SET movimentacao_id = {mov_id} WHERE id = {parcela_id}")
        db.commit()
        n += 1

    print(f"APLICADO — {n} lançamentos criados (despesa + parcela PAGO + movimentação).")
    db.close()


if __name__ == "__main__":
    main()
