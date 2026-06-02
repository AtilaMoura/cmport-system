from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List

from app.repositories.servico_repository import ServicoRepository
from app.schemas.servico_schema import ServicoCreate, ServicoUpdate, ServicoResponse


def _vincular_os(db: Session, servico) -> None:
    """Preenche ordem_servico_id buscando OrdemServico pelo numero_os."""
    if not servico.numero_os:
        return
    try:
        from app.repositories.ordem_servico_repository import OrdemServicoRepository
        # Sanitiza o número (remove pontos, espaços, traços) antes de converter para int
        num_limpo = "".join(filter(str.isdigit, str(servico.numero_os)))
        if not num_limpo:
            return
        os_obj = OrdemServicoRepository.get_by_task_id(db, int(num_limpo))
        if os_obj and servico.ordem_servico_id != os_obj.id:
            servico.ordem_servico_id = os_obj.id
            db.flush()
    except Exception:
        pass


class ServicoService:

    @staticmethod
    def create_servico(db: Session, servico: ServicoCreate):
        db_servico = ServicoRepository.create(db, servico.model_dump())
        _vincular_os(db, db_servico)
        return db_servico

    @staticmethod
    def list_servicos_condominio(db: Session, condominio_id: int):
        return ServicoRepository.list_by_condominio(db, condominio_id)

    @staticmethod
    def list_all_servicos(db: Session, condominio_id: Optional[int] = None) -> List[ServicoResponse]:
        servicos = ServicoRepository.list_all(db, condominio_id)
        return [ServicoResponse.from_orm(s) for s in servicos]

    @staticmethod
    def get_servico_by_id(db: Session, servico_id: int):
        return ServicoRepository.get_by_id(db, servico_id)

    @staticmethod
    def update_servico(db: Session, servico_id: int, servico_update: ServicoUpdate):
        db_servico = ServicoRepository.get_by_id(db, servico_id)
        if not db_servico:
            return None
        atualizado = ServicoRepository.update(db, db_servico, servico_update.model_dump(exclude_unset=True))
        if 'numero_os' in servico_update.model_dump(exclude_unset=True):
            _vincular_os(db, atualizado)
        return atualizado

    @staticmethod
    def vincular_orcamento(db: Session, servico_id: int, orcamento_id: Optional[int]):
        servico = ServicoRepository.get_by_id(db, servico_id)
        if not servico:
            return None
        servico.orcamento_id = orcamento_id
        # ao desvincular, bloqueia o fallback automático por task_id
        # ao vincular manualmente, libera o fallback caso seja necessário no futuro
        servico.bloquear_vinculo_automatico = orcamento_id is None
        db.commit()
        db.refresh(servico)
        return servico

    @staticmethod
    def list_by_orcamento(db: Session, orcamento_id: int):
        return ServicoRepository.list_by_orcamento_id(db, orcamento_id)

    @staticmethod
    def delete_servico(db: Session, servico_id: int) -> bool:
        from app.routers.auditoria_router import registrar_exclusao

        db_servico = ServicoRepository.get_by_id(db, servico_id)
        if not db_servico:
            return False

        dados_servico = {
            "id": db_servico.id,
            "condominio_id": db_servico.condominio_id,
            "nota_fiscal_id": db_servico.nota_fiscal_id,
            "tipo": db_servico.tipo.value if db_servico.tipo else None,
            "data_servico": db_servico.data_servico.isoformat() if db_servico.data_servico else None,
            "descricao": db_servico.descricao,
            "criado_em": db_servico.criado_em.isoformat() if db_servico.criado_em else None,
            "atualizado_em": db_servico.atualizado_em.isoformat() if db_servico.atualizado_em else None,
        }

        try:
            registrar_exclusao(db=db, tipo="servico", registro_id=servico_id, dados=dados_servico, motivo="Exclusão manual via interface")
        except Exception as e:
            print(f"Erro ao registrar exclusão de serviço {servico_id}: {e}")

        ServicoRepository.delete(db, db_servico)
        return True
    @staticmethod
    def vincular_os_manual(db: Session, servico_id: int, ordem_servico_id: int):
        servico = ServicoRepository.get_by_id(db, servico_id)
        if not servico:
            return None
            
        from app.models.ordem_servico_model import OrdemServico
        os_obj = db.query(OrdemServico).filter(OrdemServico.id == ordem_servico_id).first()
        if not os_obj:
            raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
            
        servico.ordem_servico_id = os_obj.id
        servico.numero_os = str(os_obj.task_id)
        db.commit()
        db.refresh(servico)
        return servico

    @staticmethod
    def desvincular_os_manual(db: Session, servico_id: int):
        servico = ServicoRepository.get_by_id(db, servico_id)
        if not servico:
            return None
        servico.ordem_servico_id = None
        servico.numero_os = None
        db.commit()
        db.refresh(servico)
        return servico

    @staticmethod
    def resumo_financeiro(db: Session, mes: Optional[int] = None, ano: Optional[int] = None) -> dict:
        """Resumo PAGO/PENDENTE por data de pagamento (visão caixa — igual à planilha)."""
        from app.models.boleto_model import Boleto, SituacaoBoleto

        q_pago = db.query(
            func.count(Boleto.id).label("qtd"),
            func.coalesce(func.sum(Boleto.valor_nominal), 0).label("valor"),
        ).filter(Boleto.situacao.in_([SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO]))

        q_pend = db.query(
            func.count(Boleto.id).label("qtd"),
            func.coalesce(func.sum(Boleto.valor_nominal), 0).label("valor"),
        ).filter(Boleto.situacao.in_([SituacaoBoleto.EMABERTO, SituacaoBoleto.VENCIDO]))

        if mes and ano:
            # PAGO: filtra pela data real de pagamento (visão caixa)
            q_pago = q_pago.filter(
                func.year(Boleto.data_pagamento) == ano,
                func.month(Boleto.data_pagamento) == mes,
            )
            # PENDENTE: filtra pela data de vencimento
            q_pend = q_pend.filter(
                func.year(Boleto.data_vencimento) == ano,
                func.month(Boleto.data_vencimento) == mes,
            )
        elif ano:
            q_pago = q_pago.filter(func.year(Boleto.data_pagamento) == ano)
            q_pend = q_pend.filter(func.year(Boleto.data_vencimento) == ano)

        r_pago = q_pago.one()
        r_pend = q_pend.one()

        return {
            "valor_pago":     float(r_pago.valor),
            "qtd_pago":       int(r_pago.qtd),
            "valor_pendente": float(r_pend.valor),
            "qtd_pendente":   int(r_pend.qtd),
        }
