from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import extract

from app.models.recibo_model import Recibo


class ReciboRepository:

    @staticmethod
    def create(db: Session, recibo: Recibo) -> Recibo:
        db.add(recibo)
        db.commit()
        db.refresh(recibo)
        return recibo

    @staticmethod
    def get_by_id(db: Session, recibo_id: int) -> Optional[Recibo]:
        return db.query(Recibo).filter(
            Recibo.id == recibo_id,
            Recibo.deletado_em.is_(None),
        ).first()

    @staticmethod
    def get_by_numero(db: Session, numero: str) -> Optional[Recibo]:
        return db.query(Recibo).filter(Recibo.numero_recibo == numero).first()

    @staticmethod
    def list_all(
        db: Session,
        condominio_id: Optional[int] = None,
        cliente_id: Optional[int] = None,
        status: Optional[str] = None,
        ano: Optional[int] = None,
        mes: Optional[int] = None,
    ) -> List[Recibo]:
        q = db.query(Recibo).filter(Recibo.deletado_em.is_(None))
        if condominio_id:
            q = q.filter(Recibo.condominio_id == condominio_id)
        if cliente_id:
            q = q.filter(Recibo.cliente_id == cliente_id)
        if status:
            q = q.filter(Recibo.status == status)
        if ano:
            q = q.filter(extract("year", Recibo.data_emissao) == ano)
        if mes:
            q = q.filter(extract("month", Recibo.data_emissao) == mes)
        return q.order_by(Recibo.data_emissao.desc()).all()

    @staticmethod
    def proximo_numero(db: Session, ano: int) -> str:
        prefixo = f"REC-{ano}-"
        ultimo = (
            db.query(Recibo.numero_recibo)
            .filter(Recibo.numero_recibo.like(f"{prefixo}%"))
            .order_by(Recibo.numero_recibo.desc())
            .first()
        )
        seq = 1
        if ultimo and ultimo[0]:
            try:
                seq = int(ultimo[0].split("-")[-1]) + 1
            except Exception:
                pass
        return f"{prefixo}{seq:03d}"

    @staticmethod
    def save(db: Session, recibo: Recibo) -> Recibo:
        db.add(recibo)
        db.commit()
        db.refresh(recibo)
        return recibo
