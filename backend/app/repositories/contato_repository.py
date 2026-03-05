from sqlalchemy.orm import Session
from typing import List, Optional

from app.models.contato_model import Contato


class ContatoRepository:

    @staticmethod
    def create(db: Session, contato_data: dict) -> Contato:
        db_contato = Contato(**contato_data)
        db.add(db_contato)
        db.commit()
        db.refresh(db_contato)
        return db_contato

    @staticmethod
    def get_by_id(db: Session, contato_id: int) -> Optional[Contato]:
        return db.query(Contato).filter(Contato.id == contato_id).first()

    @staticmethod
    def list_by_condominio(db: Session, condominio_id: int) -> List[Contato]:
        return db.query(Contato).filter(Contato.condominio_id == condominio_id).all()

    @staticmethod
    def get_principal(db: Session, condominio_id: int) -> Optional[Contato]:
        return db.query(Contato).filter(
            Contato.condominio_id == condominio_id,
            Contato.principal == True
        ).first()

    @staticmethod
    def update(db: Session, db_contato: Contato, update_data: dict) -> Contato:
        for key, value in update_data.items():
            setattr(db_contato, key, value)
        db.commit()
        db.refresh(db_contato)
        return db_contato

    @staticmethod
    def delete(db: Session, db_contato: Contato) -> None:
        db.delete(db_contato)
        db.commit()
