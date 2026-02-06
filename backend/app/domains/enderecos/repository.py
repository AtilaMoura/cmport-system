from sqlalchemy.orm import Session
from typing import Optional
from .model import Endereco

class EnderecoRepository:
    @staticmethod
    def create(db: Session, endereco_data: dict) -> Endereco:
        db_endereco = Endereco(**endereco_data)
        db.add(db_endereco)
        db.commit()
        db.refresh(db_endereco)
        return db_endereco

    @staticmethod
    def get_by_condominio(db: Session, condominio_id: int) -> Optional[Endereco]:
        return db.query(Endereco).filter(Endereco.condominio_id == condominio_id).first()

    @staticmethod
    def get_by_id(db: Session, endereco_id: int) -> Optional[Endereco]:
        return db.query(Endereco).filter(Endereco.id == endereco_id).first()

    @staticmethod
    def update(db: Session, db_endereco: Endereco, update_data: dict) -> Endereco:
        for key, value in update_data.items():
            setattr(db_endereco, key, value)
        db.commit()
        db.refresh(db_endereco)
        return db_endereco

    @staticmethod
    def delete(db: Session, db_endereco: Endereco) -> None:
        db.delete(db_endereco)
        db.commit()