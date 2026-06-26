from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from app.models.declaracao_fiscal_model import DeclaracaoFiscalGerada


class DeclaracaoFiscalRepository:

    @staticmethod
    def get_by_servico_tipo(db: Session, servico_id: int, tipo: str) -> Optional[DeclaracaoFiscalGerada]:
        return (
            db.query(DeclaracaoFiscalGerada)
            .filter(DeclaracaoFiscalGerada.servico_id == servico_id, DeclaracaoFiscalGerada.tipo == tipo)
            .first()
        )

    @staticmethod
    def get_all_by_servico(db: Session, servico_id: int) -> List[DeclaracaoFiscalGerada]:
        return (
            db.query(DeclaracaoFiscalGerada)
            .filter(DeclaracaoFiscalGerada.servico_id == servico_id)
            .all()
        )

    @staticmethod
    def criar_ou_atualizar(db: Session, servico_id: int, tipo: str) -> DeclaracaoFiscalGerada:
        existente = DeclaracaoFiscalRepository.get_by_servico_tipo(db, servico_id, tipo)
        if existente:
            existente.gerada_em = datetime.utcnow()
            db.commit()
            db.refresh(existente)
            return existente
        nova = DeclaracaoFiscalGerada(servico_id=servico_id, tipo=tipo)
        db.add(nova)
        db.commit()
        db.refresh(nova)
        return nova

    @staticmethod
    def deletar(db: Session, servico_id: int, tipo: str) -> bool:
        existente = DeclaracaoFiscalRepository.get_by_servico_tipo(db, servico_id, tipo)
        if not existente:
            return False
        db.delete(existente)
        db.commit()
        return True
