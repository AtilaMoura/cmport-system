# -*- coding: utf-8 -*-
"""Carrega os 7 funcionários do JSON preenchido pela cliente
(cadastro_funcionarios_cliente_20260828.json) via FuncionarioService.

Aplica as correções combinadas com o Atila (28/08):
- André Moreira Rosa: vale_refeicao = 0 (o valor R$2900 é pró-labore, tudo incluído)

Uso:
  cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/carregar_funcionarios.py [--aplicar]
Sem --aplicar: só mostra o que faria (dry-run).
"""
import json
import sys

sys.path.insert(0, ".")

APLICAR = "--aplicar" in sys.argv
JSON_PATH = r"../fluxo-financeiro/cadastro_funcionarios_cliente_20260828.json"

CNPJ = {"CMPORT": "22761557000188", "TEC": "65756913000188"}

# correções manuais por nome (combinadas com o Atila)
OVERRIDE = {
    "André Moreira Rosa": {"vale_refeicao": 0},
}


def main():
    import app.main  # noqa — registra models
    from app.core.database import SessionLocal
    from app.models.funcionario_model import Funcionario
    from app.services.funcionario_service import FuncionarioService
    from app.schemas.funcionario_schema import FuncionarioCreate, FuncionarioVariaveisIn
    from app.models.despesa_model import Despesa, TipoPagamentoDespesa

    dados = json.load(open(JSON_PATH, encoding="utf-8"))
    db = SessionLocal()

    existentes = {f.nome for f in db.query(Funcionario).filter(Funcionario.deletado_em.is_(None)).all()}
    print(f"Funcionários já no banco: {len(existentes)}")
    print(f"{'MODO: APLICAR' if APLICAR else 'MODO: DRY-RUN (use --aplicar pra gravar)'}\n")

    criados = 0
    for item in dados["funcionarios"]:
        nome = item["nome"]
        if nome in existentes:
            print(f"  PULA  {nome} — já existe")
            continue

        ov = OVERRIDE.get(nome, {})
        vr = ov.get("vale_refeicao", item.get("vale_refeicao") or 0)

        var = FuncionarioVariaveisIn(
            salario_mensal=str(item.get("salario_mensal") or 0),
            dia_pagamento_salario=item.get("dia_pagamento_salario"),
            adiantamento_tipo=item.get("adiantamento_tipo") or "NENHUM",
            adiantamento_valor=str(item.get("adiantamento_valor") or 0),
            dia_pagamento_adiantamento=item.get("dia_pagamento_adiantamento"),
            vale_transporte=str(item.get("vale_transporte") or 0),
            vale_refeicao=str(vr),
            tem_plantao=bool(item.get("tem_plantao")),
            plantao_valor=str(item.get("plantao_valor") or 0),
            tem_hora_extra=bool(item.get("tem_hora_extra")),
            hora_extra_valor=str(item.get("hora_extra_valor") or 0),
            encargos_percentual=str(item.get("encargos_percentual") or 0),
        )
        req = FuncionarioCreate(
            nome=nome,
            empresa_padrao_cnpj=CNPJ[item["empresa_padrao"]],
            cargo=(item.get("cargo") or None) or None,
            data_admissao=item.get("data_admissao"),
            data_demissao=item.get("data_demissao"),
            ativo=(item.get("situacao") != "DESLIGADO"),
            observacao=(item.get("observacao") or None) or None,
            variaveis=var,
        )

        marca = " (VR corrigido p/ 0 — pró-labore)" if "vale_refeicao" in ov else ""
        if not APLICAR:
            print(f"  CRIA  {nome} [{item['empresa_padrao']}] sal={var.salario_mensal} "
                  f"adiant={var.adiantamento_tipo}/{var.adiantamento_valor} VR={var.vale_refeicao} "
                  f"plantao={var.tem_plantao}/{var.plantao_valor} HE={var.tem_hora_extra} "
                  f"{'ATIVO' if req.ativo else 'DESLIGADO'}{marca}")
            criados += 1
            continue

        f = FuncionarioService.criar(db, req)
        recs = db.query(Despesa).filter(
            Despesa.funcionario_id == f.id,
            Despesa.tipo_pagamento == TipoPagamentoDespesa.RECORRENTE,
        ).all()
        comps = sorted(d.descricao.split(" — ")[0] for d in recs)
        print(f"  OK    {nome} (id {f.id}) → recorrentes: {comps}{marca}")
        criados += 1

    print(f"\n{'Criados' if APLICAR else 'Criaria'}: {criados}")
    db.close()


if __name__ == "__main__":
    main()
