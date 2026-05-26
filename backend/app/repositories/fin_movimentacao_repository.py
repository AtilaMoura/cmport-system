from typing import List, Optional
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import extract

from app.models.fin_movimentacao_model import MovimentacaoFinanceira
from app.models.fin_categoria_model import CategoriaFinanceira


class FinMovimentacaoRepository:

    @staticmethod
    def listar(
        db: Session,
        mes: Optional[int] = None,
        ano: Optional[int] = None,
        tipo: Optional[str] = None,
        grupo: Optional[str] = None,
        categoria_id: Optional[int] = None,
        origem: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[MovimentacaoFinanceira]:
        q = (
            db.query(MovimentacaoFinanceira)
            .filter(MovimentacaoFinanceira.deletado_em == None)  # noqa
        )
        if mes:
            q = q.filter(extract("month", MovimentacaoFinanceira.data) == mes)
        if ano:
            q = q.filter(extract("year", MovimentacaoFinanceira.data) == ano)
        if tipo:
            q = q.filter(MovimentacaoFinanceira.tipo == tipo)
        if categoria_id:
            q = q.filter(MovimentacaoFinanceira.categoria_id == categoria_id)
        if origem:
            q = q.filter(MovimentacaoFinanceira.origem == origem)
        if status:
            q = q.filter(MovimentacaoFinanceira.status == status)
        if grupo:
            q = q.join(CategoriaFinanceira, MovimentacaoFinanceira.categoria_id == CategoriaFinanceira.id)\
                  .filter(CategoriaFinanceira.grupo == grupo)
        return q.order_by(MovimentacaoFinanceira.data.desc(), MovimentacaoFinanceira.id.desc()).all()

    @staticmethod
    def get_by_id(db: Session, id: int) -> Optional[MovimentacaoFinanceira]:
        return db.query(MovimentacaoFinanceira).filter(
            MovimentacaoFinanceira.id == id,
            MovimentacaoFinanceira.deletado_em == None  # noqa
        ).first()

    @staticmethod
    def create(db: Session, dados: dict) -> MovimentacaoFinanceira:
        obj = MovimentacaoFinanceira(**dados)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def update(db: Session, obj: MovimentacaoFinanceira, dados: dict) -> MovimentacaoFinanceira:
        for k, v in dados.items():
            setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def listar_por_periodo(db: Session, mes: int, ano: int) -> List[MovimentacaoFinanceira]:
        return (
            db.query(MovimentacaoFinanceira)
            .filter(
                MovimentacaoFinanceira.deletado_em == None,  # noqa
                extract("month", MovimentacaoFinanceira.data) == mes,
                extract("year", MovimentacaoFinanceira.data) == ano,
            )
            .all()
        )
