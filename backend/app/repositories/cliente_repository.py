from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.cliente_model import Cliente


class ClienteRepository:

    @staticmethod
    def create(db: Session, cliente: Cliente) -> Cliente:
        db.add(cliente)
        db.commit()
        db.refresh(cliente)
        return cliente

    @staticmethod
    def get_by_id(db: Session, cliente_id: int) -> Optional[Cliente]:
        return db.query(Cliente).filter(
            Cliente.id == cliente_id,
            Cliente.deletado_em.is_(None),
        ).first()

    @staticmethod
    def list_all(
        db: Session,
        condominio_id: Optional[int] = None,
        apenas_ativos: bool = False,
        busca: Optional[str] = None,
        sem_condominio: bool = False,
    ) -> List[Cliente]:
        q = db.query(Cliente).filter(Cliente.deletado_em.is_(None))
        if condominio_id:
            q = q.filter(Cliente.condominio_id == condominio_id)
        elif sem_condominio:
            q = q.filter(Cliente.condominio_id.is_(None))
        if apenas_ativos:
            q = q.filter(Cliente.ativo.is_(True))
        if busca:
            q = q.filter(Cliente.nome.ilike(f"%{busca}%"))
        return q.order_by(Cliente.nome).all()

    @staticmethod
    def list_by_condominio(db: Session, condominio_id: int, apenas_ativos: bool = False) -> List[Cliente]:
        return ClienteRepository.list_all(db, condominio_id, apenas_ativos)

    @staticmethod
    def save(db: Session, cliente: Cliente) -> Cliente:
        db.add(cliente)
        db.commit()
        db.refresh(cliente)
        return cliente
