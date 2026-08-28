from datetime import datetime, date
from typing import List

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

    # ── Motor de geração (Fase B) ────────────────────────────────────────────
    # Cada COMPONENTE das variáveis do funcionário vira uma Despesa RECORRENTE
    # identificada por (funcionario_id, categoria_id). O valor da variável é só
    # a SUGESTÃO — a parcela mensal é editável no pagamento (salário varia, VR
    # varia por dias trabalhados, adiantamento/plantão/HE variam). O scheduler
    # existente (_gerar_despesas_recorrentes_auto) gera as parcelas mensais.
    _COMPONENTES = [
        # (categoria_nome, attr_valor, attr_dia, prefixo, gatilho)
        #   gatilho: "salario"=só se salario>0 | "adiantamento"=se tipo!=NENHUM |
        #            "valor"=se valor>0 | "flag:<attr_bool>"=se a flag é True
        ("Salario (folha mensal)",     "salario_mensal",    "dia_pagamento_salario",      "Salário",         "salario"),
        ("Adiantamento de salario",    "adiantamento_valor","dia_pagamento_adiantamento", "Adiantamento",    "adiantamento"),
        ("Vale transporte",            "vale_transporte",   "dia_pagamento_salario",      "Vale transporte", "valor"),
        ("Vale refeicao/alimentacao",  "vale_refeicao",     "dia_pagamento_salario",      "Vale refeição",   "valor"),
        ("Plantao",                    "plantao_valor",     "dia_pagamento_salario",      "Plantão",         "flag:tem_plantao"),
        ("Hora extra",                 "hora_extra_valor",  "dia_pagamento_salario",      "Hora extra",      "flag:tem_hora_extra"),
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
        desejado = []  # (categoria_id, valor, dia, descricao)
        ativo = bool(func.ativo) and func.deletado_em is None
        if ativo and v is not None:
            salario = float(getattr(v, "salario_mensal", 0) or 0)
            for cat_nome, attr_valor, attr_dia, prefixo, gatilho in FuncionarioService._COMPONENTES:
                cat_id = cats.get(cat_nome)
                if not cat_id:
                    continue
                valor = float(getattr(v, attr_valor, 0) or 0)
                if gatilho == "salario" and salario <= 0:
                    continue
                if gatilho == "adiantamento" and getattr(v, "adiantamento_tipo", "NENHUM") == "NENHUM":
                    continue
                if gatilho == "valor" and valor <= 0:
                    continue
                if gatilho.startswith("flag:") and not getattr(v, gatilho.split(":", 1)[1], False):
                    continue
                dia = _dia_ok(getattr(v, attr_dia, None) or getattr(v, "dia_pagamento_salario", None))
                desejado.append((cat_id, valor, dia, f"{prefixo} — {func.nome}"))

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

        for cat_id, valor, dia, descricao in desejado:
            d = existentes.get(cat_id)
            if d is None:
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
                    observacao="Gerada automaticamente das variáveis do funcionário.",
                )
                db.add(d)
                db.commit()
                db.refresh(d)
                DespesaService._garantir_parcelas_recorrente(db, d)
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

        # componente que saiu do estado desejado -> desativa a despesa (mantém histórico)
        for cat_id, d in existentes.items():
            if cat_id not in cat_ids_desejados and d.ativo:
                d.ativo = False
                db.commit()
                desativadas += 1

        return {"criadas": criadas, "atualizadas": atualizadas, "desativadas": desativadas}
