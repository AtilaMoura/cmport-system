from typing import Optional, List
from sqlalchemy.orm import Session, joinedload

from app.models.contrato_condominio_model import ContratoCondominio


class ContratoCondominioRepository:

    @staticmethod
    def get_by_condominio(db: Session, condominio_id: int) -> Optional[ContratoCondominio]:
        return (
            db.query(ContratoCondominio)
            .options(joinedload(ContratoCondominio.condominio))
            .filter(
                ContratoCondominio.condominio_id == condominio_id,
                ContratoCondominio.deletado_em.is_(None),
            )
            .first()
        )

    @staticmethod
    def list_by_condominio(db: Session, condominio_id: int) -> List[ContratoCondominio]:
        return (
            db.query(ContratoCondominio)
            .options(joinedload(ContratoCondominio.condominio))
            .filter(
                ContratoCondominio.condominio_id == condominio_id,
                ContratoCondominio.deletado_em.is_(None),
            )
            .order_by(ContratoCondominio.id)
            .all()
        )

    @staticmethod
    def get_by_id(db: Session, contrato_id: int) -> Optional[ContratoCondominio]:
        return (
            db.query(ContratoCondominio)
            .options(joinedload(ContratoCondominio.condominio))
            .filter(
                ContratoCondominio.id == contrato_id,
                ContratoCondominio.deletado_em.is_(None),
            )
            .first()
        )

    @staticmethod
    def list_all(db: Session, apenas_ativos: bool = False) -> List[ContratoCondominio]:
        q = (
            db.query(ContratoCondominio)
            .options(joinedload(ContratoCondominio.condominio))
            .filter(ContratoCondominio.deletado_em.is_(None))
        )
        if apenas_ativos:
            q = q.filter(ContratoCondominio.ativo.is_(True))
        return q.all()

    @staticmethod
    def create(db: Session, contrato: ContratoCondominio) -> ContratoCondominio:
        db.add(contrato)
        db.commit()
        db.refresh(contrato)
        return contrato

    @staticmethod
    def save(db: Session, contrato: ContratoCondominio) -> ContratoCondominio:
        db.add(contrato)
        db.commit()
        db.refresh(contrato)
        return contrato
