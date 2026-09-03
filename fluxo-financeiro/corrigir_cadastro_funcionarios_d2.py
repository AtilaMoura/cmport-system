# -*- coding: utf-8 -*-
"""
Fase D2 — Passo 1: corrige o cadastro de 4 funcionários (datas de admissão e
adiantamento FIXO de Luis/Welligton) conforme a planilha Controle.

Lê `folha_d2_input.json["cadastro_correcoes"]`. Só UPDATE nos campos listados.
NÃO mexe em salário, nome, cnpj, nem em outros funcionários.

Uso:
  cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/corrigir_cadastro_funcionarios_d2.py [--ambiente producao] [--aplicar]

⚠️ Mudar adiantamento_tipo VARIAVEL→FIXO só passa a gerar a recorrente de
adiantamento quando o funcionário for re-salvo pela API/tela (raw SQL não dispara
FuncionarioService.sincronizar_recorrentes). Fazer isso depois, na tela.
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _folha_d2_ssh import conectar, parse_args, carregar_input, sql_str

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

CAMPOS_FUNC = {"data_admissao", "data_demissao", "cargo"}
CAMPOS_VAR = {"adiantamento_tipo", "adiantamento_valor", "salario_mensal",
              "vale_transporte", "vale_refeicao"}


def main():
    args = parse_args("Fase D2 Passo 1 — corrige cadastro de funcionários")
    inp = carregar_input()
    db = conectar(args.ambiente)
    correcoes = inp["cadastro_correcoes"]

    print(f"=== Passo 1 — cadastro ({args.ambiente}, {'APLICAR' if args.aplicar else 'DRY-RUN'}) ===\n")
    total_updates = 0

    for c in correcoes:
        fid = c["funcionario_id"]
        row = db.q(f"SELECT id, nome, data_admissao FROM funcionarios "
                   f"WHERE id = {fid} AND deletado_em IS NULL")
        if not row:
            print(f"  !! funcionário {fid} não existe / já deletado — ABORTAR")
            db.close()
            sys.exit(1)
        nome = row[0][1]
        print(f"• {nome} (id {fid}) — {c['motivo']}")

        # campos direto em funcionarios
        sets = []
        for campo, valor in c.get("set", {}).items():
            if campo not in CAMPOS_FUNC:
                print(f"    !! campo '{campo}' fora da whitelist — ABORTAR")
                db.close()
                sys.exit(1)
            atual = db.q(f"SELECT {campo} FROM funcionarios WHERE id = {fid}")[0][0]
            if str(atual) == str(valor):
                print(f"    {campo}: já é {valor} (nada a fazer)")
            else:
                print(f"    {campo}: {atual} → {valor}")
                sets.append(f"{campo} = {sql_str(valor)}")
        if sets:
            sql = (f"UPDATE funcionarios SET {', '.join(sets)}, atualizado_em = NOW() "
                   f"WHERE id = {fid} AND deletado_em IS NULL")
            if args.aplicar:
                db.exec(sql)
            total_updates += 1

        # campos em funcionario_variaveis
        var_sets = []
        for campo, valor in c.get("variaveis", {}).items():
            if campo not in CAMPOS_VAR:
                print(f"    !! variável '{campo}' fora da whitelist — ABORTAR")
                db.close()
                sys.exit(1)
            vrow = db.q(f"SELECT {campo} FROM funcionario_variaveis WHERE funcionario_id = {fid}")
            atual = vrow[0][0] if vrow else None
            lit = sql_str(valor) if campo == "adiantamento_tipo" else str(valor)
            if _mesmo(atual, valor):
                print(f"    var.{campo}: já é {valor} (nada a fazer)")
            else:
                print(f"    var.{campo}: {atual} → {valor}")
                var_sets.append(f"{campo} = {lit}")
        if var_sets:
            sql = (f"UPDATE funcionario_variaveis SET {', '.join(var_sets)}, atualizado_em = NOW() "
                   f"WHERE funcionario_id = {fid}")
            if args.aplicar:
                db.exec(sql)
            total_updates += 1
        print()

    if args.aplicar:
        db.commit()
        print(f"APLICADO — {total_updates} UPDATE(s).")
    else:
        print(f"DRY-RUN — {total_updates} UPDATE(s) seriam feitos. Rode com --aplicar.")
    db.close()


def _mesmo(atual, novo):
    try:
        return abs(float(atual) - float(novo)) < 0.005
    except (TypeError, ValueError):
        return str(atual) == str(novo)


if __name__ == "__main__":
    main()
