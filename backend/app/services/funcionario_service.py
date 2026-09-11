from datetime import datetime, date
from typing import List

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models.funcionario_model import Funcionario
from app.models.fin_categoria_model import CategoriaFinanceira
from app.models.despesa_model import (
    Despesa, DespesaParcela, TipoPagamentoDespesa, StatusParcelaDespesa,
)
from app.repositories.funcionario_repository import FuncionarioRepository
from app.schemas.funcionario_schema import (
    FuncionarioCreate, FuncionarioUpdate, FuncionarioResponse,
)


def _dia_ok(d) -> int:
    """Dia de vencimento seguro pro engine RECORRENTE (usa .replace(day=), quebra >28)."""
    try:
        return min(max(int(d), 1), 28)
    except (TypeError, ValueError):
        return 5


class FuncionarioService:

    @staticmethod
    def listar(db: Session, incluir_inativos: bool = True) -> List[FuncionarioResponse]:
        return [
            FuncionarioResponse.model_validate(f)
            for f in FuncionarioRepository.listar(db, incluir_inativos=incluir_inativos)
        ]

    @staticmethod
    def buscar(db: Session, id: int) -> FuncionarioResponse:
        f = FuncionarioRepository.get_by_id(db, id)
        if not f:
            raise Exception("Funcionario nao encontrado.")
        return FuncionarioResponse.model_validate(f)

    @staticmethod
    def criar(db: Session, req: FuncionarioCreate) -> FuncionarioResponse:
        cnpj = "".join(filter(str.isdigit, req.empresa_padrao_cnpj or ""))
        funcionario = Funcionario(
            nome=req.nome,
            empresa_padrao_cnpj=cnpj,
            cargo=req.cargo,
            data_admissao=req.data_admissao,
            data_demissao=req.data_demissao,
            ativo=req.ativo,
            observacao=req.observacao,
        )
        funcionario = FuncionarioRepository.create(db, funcionario)
        if req.variaveis is not None:
            FuncionarioRepository.upsert_variaveis(db, funcionario.id, req.variaveis.model_dump())
        FuncionarioService.sincronizar_recorrentes(db, funcionario.id)
        return FuncionarioService.buscar(db, funcionario.id)

    @staticmethod
    def editar(db: Session, id: int, req: FuncionarioUpdate) -> FuncionarioResponse:
        funcionario = FuncionarioRepository.get_by_id(db, id)
        if not funcionario:
            raise Exception("Funcionario nao encontrado.")
        dados = req.model_dump(exclude_unset=True)
        variaveis = dados.pop("variaveis", None)
        if "empresa_padrao_cnpj" in dados and dados["empresa_padrao_cnpj"]:
            dados["empresa_padrao_cnpj"] = "".join(filter(str.isdigit, dados["empresa_padrao_cnpj"]))
        if dados:
            FuncionarioRepository.update(db, funcionario, dados)
        if variaveis is not None:
            FuncionarioRepository.upsert_variaveis(db, id, variaveis)
        FuncionarioService.sincronizar_recorrentes(db, id)
        return FuncionarioService.buscar(db, id)

    @staticmethod
    def deletar(db: Session, id: int):
        from app.routers.auditoria_router import registrar_exclusao
        funcionario = FuncionarioRepository.get_by_id(db, id)
        if not funcionario:
            raise Exception("Funcionario nao encontrado.")
        registrar_exclusao(db, "funcionario", id, {"id": funcionario.id, "nome": funcionario.nome})
        FuncionarioRepository.update(db, funcionario, {"deletado_em": datetime.utcnow(), "ativo": False})
        # funcionario removido -> desativa as despesas recorrentes dele (nao apaga histórico)
        FuncionarioService.sincronizar_recorrentes(db, id)

    # ── Motor de geração (Fase B / F8) ───────────────────────────────────────
    # A folha do funcionário vira DUAS Despesas RECORRENTE (uma parcela/mês cada):
    #   1. "Salário líquido" — o Pix único que sai pro funcionário no dia do
    #      pagamento (competência = mês anterior ao vencimento). Concilia 1:1 com
    #      o extrato. É salário + VR + VA + VT + plantão + hora extra − INSS − IRRF
    #      − contrib. − 6% VT − empréstimo − adiantamento. Os componentes que o
    #      compõem NÃO viram parcela própria (só entram no cálculo/observação).
    #   2. "Adiantamento" — saída separada, paga ~dia 20, competência = mês do
    #      vencimento (é abatida do líquido do mês seguinte).
    # O valor gerado é SUGESTÃO — a parcela é editável no pagamento (plantão, HE,
    # VR por dias trabalhados variam). Guias patronais (GPS/FGTS/DARF) são
    # lançamento avulso no bloco "Encargos da folha", nunca aqui.
    _COMPONENTES = [
        # (categoria_nome, attr_valor, attr_dia, prefixo, gatilho)
        ("Salario (folha mensal)",  "salario_mensal",    "dia_pagamento_salario",      "Salário líquido", "salario"),
        ("Adiantamento de salario", "adiantamento_valor","dia_pagamento_adiantamento", "Adiantamento",    "adiantamento"),
    ]

    @staticmethod
    def sincronizar_recorrentes(db: Session, funcionario_id: int) -> dict:
        """Cria/atualiza/desativa as Despesas RECORRENTE do funcionário a partir
        das variáveis correntes. Idempotente. Retorna contagem do que mudou."""
        from app.services.despesa_service import DespesaService

        func = (
            db.query(Funcionario)
            .filter(Funcionario.id == funcionario_id)
            .first()
        )
        if not func:
            return {"criadas": 0, "atualizadas": 0, "desativadas": 0}
        v = func.variaveis

        cats = {
            c.nome: c.id
            for c in db.query(CategoriaFinanceira).filter(CategoriaFinanceira.grupo == "FUNCIONARIO").all()
        }

        # estado desejado: os componentes que o funcionário tem, só se ele está
        # ativo e não foi soft-deletado. O valor é a sugestão (pode ser 0).
        desejado = []  # (categoria_id, valor, dia, descricao, cat_nome)
        ativo = bool(func.ativo) and func.deletado_em is None
        if ativo and v is not None:
            salario = float(getattr(v, "salario_mensal", 0) or 0)
            # proventos que entram no líquido (além do salário base)
            p_vr = float(getattr(v, "vale_refeicao", 0) or 0)
            p_va = float(getattr(v, "vale_alimentacao", 0) or 0)
            p_vt = float(getattr(v, "vale_transporte", 0) or 0)
            p_plantao = float(getattr(v, "plantao_valor", 0) or 0) if getattr(v, "tem_plantao", False) else 0.0
            p_he = float(getattr(v, "hora_extra_valor", 0) or 0) if getattr(v, "tem_hora_extra", False) else 0.0
            p_comissao = float(getattr(v, "comissao_valor", 0) or 0) if getattr(v, "tem_comissao", False) else 0.0
            # descontos
            d_inss = float(getattr(v, "desconto_inss", 0) or 0)
            d_irrf = float(getattr(v, "desconto_irrf", 0) or 0)
            d_contrib = float(getattr(v, "desconto_contrib_assistencial", 0) or 0)
            # co-participação do VT: % sobre o salário base (padrão 6% quando há VT)
            vt_pct = float(getattr(v, "vt_desconto_percentual", 0) or 0)
            if p_vt > 0 and vt_pct <= 0:
                vt_pct = 6.0
            d_vt = round(salario * vt_pct / 100.0, 2) if (p_vt > 0 and vt_pct > 0) else 0.0
            d_emprest = float(getattr(v, "emprestimo_parcela", 0) or 0)
            adiant_fixo = float(getattr(v, "adiantamento_valor", 0) or 0) \
                if getattr(v, "adiantamento_tipo", "NENHUM") == "FIXO" else 0.0
            liquido_sugerido = max(
                round(salario + p_vr + p_va + p_vt + p_plantao + p_he + p_comissao
                      - d_inss - d_irrf - d_contrib - d_vt - d_emprest - adiant_fixo, 2),
                0.0,
            )
            # texto legível só com as linhas que têm valor (formata cada número em pt-BR
            # individualmente — replace global de "." e "," estragaria a pontuação da frase)
            def _brl(n: float) -> str:
                return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            _partes = [f"salário {_brl(salario)}"]
            for _rot, _v in [("VR", p_vr), ("VA", p_va), ("VT", p_vt),
                             ("plantão", p_plantao), ("hora extra", p_he), ("comissão", p_comissao)]:
                if _v > 0:
                    _partes.append(f"+ {_rot} {_brl(_v)}")
            for _rot, _v in [("INSS", d_inss), ("IRRF", d_irrf), ("contrib.", d_contrib),
                             (f"VT {vt_pct:g}%", d_vt), ("empréstimo", d_emprest),
                             ("adiantamento", adiant_fixo)]:
                if _v > 0:
                    _partes.append(f"− {_rot} {_brl(_v)}")
            memoria_salario = (
                "Líquido = " + " ".join(_partes) + f" = {_brl(liquido_sugerido)}. "
                "Ajuste com a folha real ao marcar como pago."
            )

            for cat_nome, attr_valor, attr_dia, prefixo, gatilho in FuncionarioService._COMPONENTES:
                cat_id = cats.get(cat_nome)
                if not cat_id:
                    continue
                if gatilho == "salario":
                    if salario <= 0:
                        continue
                    valor = liquido_sugerido
                else:
                    valor = float(getattr(v, attr_valor, 0) or 0)
                    if gatilho == "adiantamento" and getattr(v, "adiantamento_tipo", "NENHUM") == "NENHUM":
                        continue
                    if gatilho == "valor" and valor <= 0:
                        continue
                    if gatilho.startswith("flag:") and not getattr(v, gatilho.split(":", 1)[1], False):
                        continue
                dia = _dia_ok(getattr(v, attr_dia, None) or getattr(v, "dia_pagamento_salario", None))
                desejado.append((cat_id, valor, dia, f"{prefixo} — {func.nome}", cat_nome))

        cat_ids_desejados = {c for c, *_ in desejado}

        existentes = {
            d.categoria_id: d
            for d in db.query(Despesa).filter(
                Despesa.funcionario_id == funcionario_id,
                Despesa.tipo_pagamento == TipoPagamentoDespesa.RECORRENTE,
                Despesa.deletado_em.is_(None),
            ).all()
        }

        criadas = atualizadas = desativadas = 0

        for cat_id, valor, dia, descricao, cat_nome in desejado:
            d = existentes.get(cat_id)
            if d is None:
                _obs = memoria_salario if cat_nome == "Salario (folha mensal)" else "Gerada automaticamente das variáveis do funcionário."
                d = Despesa(
                    descricao=descricao,
                    categoria_id=cat_id,
                    funcionario_id=funcionario_id,
                    cnpj=func.empresa_padrao_cnpj,
                    tipo_pagamento=TipoPagamentoDespesa.RECORRENTE,
                    valor_total=valor,
                    total_parcelas=0,
                    dia_vencimento=dia,
                    ativo=True,
                    observacao=_obs,
                )
                db.add(d)
                db.commit()
                db.refresh(d)
                DespesaService._garantir_parcelas_recorrente(db, d)
                # competência: adiantamento = mês do próprio vencimento;
                # salário e demais componentes = mês anterior ao vencimento
                _offset = 0 if cat_nome == "Adiantamento de salario" else 1
                for _p in db.query(DespesaParcela).filter(
                    DespesaParcela.despesa_id == d.id,
                    DespesaParcela.status == StatusParcelaDespesa.PENDENTE,
                    DespesaParcela.mes_competencia.is_(None),
                ).all():
                    base = _p.data_vencimento.replace(day=1)
                    _p.mes_competencia = base - relativedelta(months=_offset)
                db.commit()
                criadas += 1
            else:
                mudou = False
                if abs(float(d.valor_total or 0) - valor) > 0.005:
                    d.valor_total = valor
                    mudou = True
                if d.dia_vencimento != dia:
                    d.dia_vencimento = dia
                    mudou = True
                if d.cnpj != func.empresa_padrao_cnpj:
                    d.cnpj = func.empresa_padrao_cnpj
                    mudou = True
                if not d.ativo:
                    d.ativo = True
                    mudou = True
                if d.descricao != descricao:
                    d.descricao = descricao
                    mudou = True
                if cat_nome == "Salario (folha mensal)" and d.observacao != memoria_salario:
                    d.observacao = memoria_salario
                    mudou = True
                if mudou:
                    db.commit()
                    # ajusta o valor das parcelas FUTURAS ainda PENDENTES (não mexe nas pagas)
                    db.query(DespesaParcela).filter(
                        DespesaParcela.despesa_id == d.id,
                        DespesaParcela.status == StatusParcelaDespesa.PENDENTE,
                        DespesaParcela.data_vencimento >= date.today(),
                    ).update({"valor": valor}, synchronize_session=False)
                    db.commit()
                    atualizadas += 1
                DespesaService._garantir_parcelas_recorrente(db, d)
                # competência: preenche parcelas PENDENTE sem competência
                _offset = 0 if cat_nome == "Adiantamento de salario" else 1
                for _p in db.query(DespesaParcela).filter(
                    DespesaParcela.despesa_id == d.id,
                    DespesaParcela.status == StatusParcelaDespesa.PENDENTE,
                    DespesaParcela.mes_competencia.is_(None),
                ).all():
                    base = _p.data_vencimento.replace(day=1)
                    _p.mes_competencia = base - relativedelta(months=_offset)
                db.commit()

        # componente que saiu do estado desejado (ex.: VR/VA/plantão/HE após o F8,
        # que passaram a compor o "Salário líquido") -> desativa a despesa e remove
        # as parcelas PENDENTE (as PAGO ficam pro histórico).
        from app.routers.auditoria_router import registrar_exclusao
        for cat_id, d in existentes.items():
            if cat_id not in cat_ids_desejados and d.ativo:
                d.ativo = False
                pendentes = db.query(DespesaParcela).filter(
                    DespesaParcela.despesa_id == d.id,
                    DespesaParcela.status == StatusParcelaDespesa.PENDENTE,
                ).all()
                if pendentes:
                    registrar_exclusao(db, "despesa_parcelas_componente_folha", d.id, {
                        "despesa_id": d.id, "descricao": d.descricao,
                        "categoria_id": cat_id, "parcelas_removidas": len(pendentes),
                        "ids": [p.id for p in pendentes],
                    }, motivo="Componente da folha absorvido pelo Salário líquido (F8)")
                    for p in pendentes:
                        db.delete(p)
                db.commit()
                desativadas += 1

        return {"criadas": criadas, "atualizadas": atualizadas, "desativadas": desativadas}
