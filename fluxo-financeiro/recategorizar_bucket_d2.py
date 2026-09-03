# -*- coding: utf-8 -*-
"""
Fase D2 — Passo 4 (opcional): recategoriza 26 despesas de encargo/convênio
Jan–Jul/2026 das categorias legadas pras categorias novas do grupo FUNCIONARIO
(100 = encargos FGTS/GPS, 102 = convênio).

Lê `folha_d2_input.json["recategorizar"]`. Só `UPDATE despesas SET categoria_id`.
NÃO mexe em valor, data, banco, funcionario_id. Não vincula funcionário
(encargo/convênio é guia da folha inteira — funcionario_id NULL é correto).

Uso:
  cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/recategorizar_bucket_d2.py [--ambiente producao] [--aplicar]
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _folha_d2_ssh import conectar, parse_args, carregar_input

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


def main():
    args = parse_args("Fase D2 Passo 4 — recategoriza encargos/convênio Jan–Jul")
    inp = carregar_input()
    db = conectar(args.ambiente)
    itens = inp["recategorizar"]

    print(f"=== Passo 4 — recategorizar ({args.ambiente}, {'APLICAR' if args.aplicar else 'DRY-RUN'}) ===")
    print(f"    {len(itens)} despesas\n")

    cats = {int(r[0]): r[1] for r in db.q("SELECT id, nome FROM fin_categorias")}
    falhas = []
    plano = []
    for x in sorted(itens, key=lambda r: r["id"]):
        did, alvo = x["id"], x["categoria_nova_id"]
        if not alvo:
            print(f"  despesa {did}: sem alvo (REVISAR) — pulando")
            continue
        row = db.q(f"SELECT id, categoria_id, deletado_em, valor_total FROM despesas WHERE id = {did}")
        if not row:
            falhas.append(f"despesa {did}: NÃO EXISTE"); continue
        _id, cat_atual, delem, valor = row[0]
        cat_atual = None if str(cat_atual) == "NULL" else int(cat_atual)
        if str(delem) != "NULL":
            print(f"  despesa {did}: soft-deletada — pulando"); continue
        if cat_atual == alvo:
            print(f"  despesa {did}: já está na categoria {alvo} (nada a fazer)")
            continue
        print(f"  despesa {did}  R$ {float(valor):>9,.2f}  "
              f"[{cats.get(cat_atual, cat_atual)}] → [{cats.get(alvo, alvo)}]   {x['descricao'][:40]}")
        plano.append((did, alvo))

    if falhas:
        print(f"\n!! {len(falhas)} FALHA(S) — nada será alterado:")
        for f in falhas:
            print(f"   - {f}")
        db.close()
        sys.exit(1)

    if not args.aplicar:
        print(f"\nDRY-RUN — {len(plano)} UPDATE(s). Rode com --aplicar.")
        db.close()
        return

    for did, alvo in plano:
        db.exec(f"UPDATE despesas SET categoria_id = {alvo}, atualizado_em = NOW() "
                f"WHERE id = {did} AND deletado_em IS NULL")
    db.commit()
    print(f"\nAPLICADO — {len(plano)} despesas recategorizadas.")
    db.close()


if __name__ == "__main__":
    main()
