from sqlalchemy.orm import Session
from typing import List, Optional

from app.models.boleto_model import Boleto, SituacaoBoleto


class BoletoRepository:

    @staticmethod
    def create(db: Session, boleto_data: dict) -> Boleto:
        db_boleto = Boleto(**boleto_data)
        db.add(db_boleto)
        db.commit()
        db.refresh(db_boleto)
        return db_boleto

    @staticmethod
    def get_by_id(db: Session, boleto_id: int) -> Optional[Boleto]:
        return db.query(Boleto).filter(Boleto.id == boleto_id).first()

    @staticmethod
    def get_by_nota_fiscal(db: Session, nota_fiscal_id: int) -> Optional[Boleto]:
        return db.query(Boleto).filter(Boleto.nota_fiscal_id == nota_fiscal_id).first()

    @staticmethod
    def get_by_codigo(db: Session, codigo_solicitacao: str) -> Optional[Boleto]:
        return db.query(Boleto).filter(Boleto.codigo_solicitacao == codigo_solicitacao).first()

    @staticmethod
    def get_all(db: Session) -> List[Boleto]:
        return db.query(Boleto).order_by(Boleto.criado_em.desc()).all()

    @staticmethod
    def get_pendentes(db: Session) -> List[Boleto]:
        """Retorna boletos EMABERTO ou VENCIDO para sincronização de status."""
        return db.query(Boleto).filter(
            Boleto.situacao.in_([SituacaoBoleto.EMABERTO, SituacaoBoleto.VENCIDO])
        ).all()

    @staticmethod
    def update(db: Session, db_boleto: Boleto, update_data: dict) -> Boleto:
        for key, value in update_data.items():
            setattr(db_boleto, key, value)
        db.commit()
        db.refresh(db_boleto)
        return db_boleto

    @staticmethod
    def delete(db: Session, db_boleto: Boleto) -> None:
        db.delete(db_boleto)
        db.commit()
