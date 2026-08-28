from datetime import datetime, date
from typing import List, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models.despesa_model import Despesa, DespesaParcela, StatusParcelaDespesa, TipoPagamentoDespesa
from app.models.fin_movimentacao_model import MovimentacaoFinanceira
from app.repositories.despesa_repository import DespesaRepository
from app.schemas.despesa_schema import DespesaCreate, DespesaResponse, MarcarPagoRequest, EditarParcelaRequest, DespesaUpdate
from app.models.servico_model import ManutencaoAssistencia
from app.models.orcamento_model import Orcamento
from app.models.ordem_servico_model import OrdemServico

HORIZONTE_MESES_RECORRENTE = 12


class DespesaService:

    @staticmethod
    def criar(db: Session, req: DespesaCreate) -> DespesaResponse:
        categoria_id = req.categoria_id
        if req.fornecedor_id and not categoria_id:
            from app.services.fin_movimentacao_service import FinMovimentacaoService
            categoria_id = FinMovimentacaoService._resolver_categoria_por_fornecedor(db, req.fornecedor_id)

        despesa = Despesa(
            descricao=req.descricao,
            categoria_id=categoria_id,
            fornecedor_id=req.fornecedor_id,
            funcionario_id=req.funcionario_id,
            cnpj=req.cnpj,
            banco_previsto_id=req.banco_previsto_id,
            tipo_pagamento=req.tipo_pagamento,
            observacao=req.observacao,
        )

        if req.tipo_pagamento == "UNICO":
            despesa.valor_total = req.valor_total
            despesa.total_parcelas = 1
            despesa.parcelas.append(DespesaParcela(
                numero_parcela=1,
                total_parcelas=1,
                valor=req.valor_total,
                data_vencimento=req.data_primeira_parcela,
                status=StatusParcelaDespesa.PENDENTE,
            ))
            despesa = DespesaRepository.create(db, despesa)

        elif req.tipo_pagamento == "PARCELADO":
            total = len(req.parcelas)
            despesa.total_parcelas = total
            despesa.valor_total = sum(p.valor for p in req.parcelas)
            for p in req.parcelas:
                despesa.parcelas.append(DespesaParcela(
                    numero_parcela=p.numero_parcela,
                    total_parcelas=total,
                    valor=p.valor,
                    data_vencimento=p.data_vencimento,
                    status=StatusParcelaDespesa.PENDENTE,
                ))
            despesa = DespesaRepository.create(db, despesa)

        else:  # RECORRENTE
            despesa.valor_total = req.valor_recorrente
            despesa.total_parcelas = 0
            despesa.dia_vencimento = req.dia_vencimento
            despesa.ativo = True
            despesa = DespesaRepository.create(db, despesa)
            DespesaService._garantir_parcelas_recorrente(db, despesa, data_base_inicial=req.data_inicio)
            db.refresh(despesa)

        DespesaService._sync_vinculos(db, despesa, req.servico_ids, req.orcamento_ids, req.os_fornecedor_ids)

        return DespesaResponse.model_validate(despesa)

    @staticmethod
    def _sync_vinculos(db: Session, despesa: Despesa, servico_ids, orcamento_ids, os_fornecedor_ids) -> None:
        if servico_ids is not None:
            despesa.servicos = db.query(ManutencaoAssistencia).filter(ManutencaoAssistencia.id.in_(servico_ids)).all() if servico_ids else []
        if orcamento_ids is not None:
            despesa.orcamentos = db.query(Orcamento).filter(Orcamento.id.in_(orcamento_ids)).all() if orcamento_ids else []
        if os_fornecedor_ids is not None:
            despesa.os_fornecedor = db.query(OrdemServico).filter(OrdemServico.id.in_(os_fornecedor_ids)).all() if os_fornecedor_ids else []
        db.commit()

    @staticmethod
    def listar(db: Session, mes: Optional[int] = None, ano: Optional[int] = None,
                cnpj: Optional[str] = None, status: Optional[str] = None,
                origem: Optional[str] = None, funcionario_id: Optional[int] = None) -> List[DespesaResponse]:
        despesas = DespesaRepository.listar(db, mes=mes, ano=ano, cnpj=cnpj, status=status,
                                            origem=origem, funcionario_id=funcionario_id)
        return [DespesaResponse.model_validate(d) for d in despesas]

    @staticmethod
    def buscar(db: Session, id: int) -> DespesaResponse:
        despesa = DespesaRepository.get_by_id(db, id)
        if not despesa:
            raise Exception("Despesa não encontrada.")
        return DespesaResponse.model_validate(despesa)

    @staticmethod
    def editar(db: Session, id: int, req: DespesaUpdate) -> DespesaResponse:
        despesa = DespesaRepository.get_by_id(db, id)
        if not despesa:
            raise Exception("Despesa não encontrada.")
        dados = {k: v for k, v in req.model_dump().items() if v is not None}
        if dados:
            DespesaRepository.update(db, despesa, dados)
        return DespesaResponse.model_validate(despesa)

    @staticmethod
    def marcar_pago(db: Session, parcela_id: int, req: MarcarPagoRequest) -> DespesaResponse:
        parcela = DespesaRepository.get_parcela_by_id(db, parcela_id)
        if not parcela:
            raise Exception("Parcela não encontrada.")
        despesa = parcela.despesa

        # fechamento do mês: o valor real pode ser diferente da sugestão
        # (adiantamento, plantão, hora extra, VR por dias trabalhados)
        if req.valor is not None and float(req.valor) != float(parcela.valor):
            DespesaRepository.update(db, parcela, {"valor": req.valor})

        descricao_mov = despesa.descricao
        if parcela.total_parcelas > 1:
            descricao_mov += f" ({parcela.numero_parcela}/{parcela.total_parcelas})"

        movimentacao = MovimentacaoFinanceira(
            data=req.data_pagamento,
            descricao=descricao_mov,
            valor=parcela.valor,
            tipo="SAIDA",
            categoria_id=despesa.categoria_id,
            fornecedor_id=despesa.fornecedor_id,
            origem="MANUAL",
            status="VALIDADO",
            banco_id=req.banco_id,
            forma_pagamento=req.forma_pagamento,
        )
        db.add(movimentacao)
        db.commit()
        db.refresh(movimentacao)

        if despesa.fornecedor_id:
            movimentacao.servicos = list(despesa.servicos)
            movimentacao.orcamentos = list(despesa.orcamentos)
            movimentacao.os_fornecedor = list(despesa.os_fornecedor)
            db.commit()

        DespesaRepository.update(db, parcela, {
            "status": StatusParcelaDespesa.PAGO,
            "data_pagamento": req.data_pagamento,
            "banco_id": req.banco_id,
            "forma_pagamento": req.forma_pagamento,
            "movimentacao_id": movimentacao.id,
        })

        db.refresh(despesa)
        return DespesaResponse.model_validate(despesa)

    @staticmethod
    def editar_parcela(db: Session, parcela_id: int, req: EditarParcelaRequest) -> DespesaResponse:
        parcela = DespesaRepository.get_parcela_by_id(db, parcela_id)
        if not parcela:
            raise Exception("Parcela não encontrada.")
        if parcela.status != StatusParcelaDespesa.PENDENTE:
            raise Exception("Só é possível editar uma parcela ainda pendente.")
        dados = {}
        if req.valor is not None:
            dados["valor"] = req.valor
        if req.data_vencimento is not None:
            dados["data_vencimento"] = req.data_vencimento
        if dados:
            DespesaRepository.update(db, parcela, dados)
        despesa = parcela.despesa
        db.refresh(despesa)
        return DespesaResponse.model_validate(despesa)

    @staticmethod
    def deletar(db: Session, id: int):
        from app.routers.auditoria_router import registrar_exclusao
        despesa = DespesaRepository.get_by_id(db, id)
        if not despesa:
            raise Exception("Despesa não encontrada.")
        dados = {
            "id": despesa.id, "descricao": despesa.descricao,
            "valor_total": str(despesa.valor_total), "cnpj": despesa.cnpj,
        }
        registrar_exclusao(db, "despesa", id, dados)
        DespesaRepository.update(db, despesa, {"deletado_em": datetime.utcnow()})

    @staticmethod
    def _garantir_parcelas_recorrente(db: Session, despesa: Despesa, data_base_inicial: Optional[date] = None) -> int:
        """Gera as parcelas PENDENTE que faltam pra uma despesa RECORRENTE ativa,
        cobrindo os proximos HORIZONTE_MESES_RECORRENTE meses a partir de hoje.
        Idempotente -- chamada tanto na criacao quanto pelo job mensal."""
        hoje = date.today()
        horizonte = hoje + relativedelta(months=HORIZONTE_MESES_RECORRENTE)

        ultima = DespesaRepository.get_ultima_parcela(db, despesa.id)
        if ultima:
            numero = ultima.numero_parcela + 1
            vencimento = (ultima.data_vencimento + relativedelta(months=1)).replace(day=despesa.dia_vencimento)
        else:
            base = data_base_inicial or hoje
            numero = 1
            vencimento = base.replace(day=despesa.dia_vencimento)

        criadas = 0
        while vencimento <= horizonte:
            db.add(DespesaParcela(
                despesa_id=despesa.id,
                numero_parcela=numero,
                total_parcelas=0,
                valor=despesa.valor_total,
                data_vencimento=vencimento,
                status=StatusParcelaDespesa.PENDENTE,
            ))
            criadas += 1
            numero += 1
            vencimento = (vencimento + relativedelta(months=1)).replace(day=despesa.dia_vencimento)
        if criadas:
            db.commit()
        return criadas

    @staticmethod
    def gerar_recorrentes_pendentes(db: Session) -> int:
        """Chamada pelo job agendado: garante que toda despesa RECORRENTE ativa
        tem parcelas PENDENTE cobrindo os proximos 12 meses."""
        despesas = DespesaRepository.listar_recorrentes_ativas(db)
        total = 0
        for despesa in despesas:
            total += DespesaService._garantir_parcelas_recorrente(db, despesa)
        return total
