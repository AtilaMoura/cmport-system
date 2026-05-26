from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.fin_categoria_model import CategoriaFinanceira


class FinCategoriaRepository:

    @staticmethod
    def get_all(db: Session, grupo: Optional[str] = None, ativo: Optional[bool] = None) -> List[CategoriaFinanceira]:
        q = db.query(CategoriaFinanceira)
        if grupo:
            q = q.filter(CategoriaFinanceira.grupo == grupo)
        if ativo is not None:
            q = q.filter(CategoriaFinanceira.ativo == ativo)
        return q.order_by(CategoriaFinanceira.grupo, CategoriaFinanceira.ordem, CategoriaFinanceira.id).all()

    @staticmethod
    def get_by_id(db: Session, id: int) -> Optional[CategoriaFinanceira]:
        return db.query(CategoriaFinanceira).filter(CategoriaFinanceira.id == id).first()

    @staticmethod
    def create(db: Session, dados: dict) -> CategoriaFinanceira:
        obj = CategoriaFinanceira(**dados)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def update(db: Session, obj: CategoriaFinanceira, dados: dict) -> CategoriaFinanceira:
        for k, v in dados.items():
            setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def desativar(db: Session, obj: CategoriaFinanceira) -> CategoriaFinanceira:
        obj.ativo = False
        db.commit()
        db.refresh(obj)
        return obj
