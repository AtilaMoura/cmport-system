"""
poste_repository.py — queries e CRUD de Poste (sem lógica de negócio).
"""
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.poste_model import Poste


class PosteRepository:

    @staticmethod
    def listar(db: Session, condominio_id: Optional[int] = None, incluir_inativos: bool = False) -> List[Poste]:
        q = db.query(Poste)
        if not incluir_inativos:
            q = q.filter(Poste.ativo.is_(True))
        if condominio_id is not None:
            q = q.filter(Poste.condominio_id == condominio_id)
        return q.order_by(Poste.nome).all()

    @staticmethod
    def get_by_id(db: Session, poste_id: int) -> Optional[Poste]:
        return db.query(Poste).filter(Poste.id == poste_id).first()

    @staticmethod
    def create(db: Session, poste: Poste) -> Poste:
        db.add(poste)
        db.commit()
        db.refresh(poste)
        return poste

    @staticmethod
    def save(db: Session, poste: Poste) -> Poste:
        db.commit()
        db.refresh(poste)
        return poste
