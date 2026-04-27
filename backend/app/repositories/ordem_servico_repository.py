from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Tuple
from datetime import datetime

from app.models.ordem_servico_model import OrdemServico


class OrdemServicoRepository:

    @staticmethod
    def upsert(db: Session, task_id: int, dados: dict) -> Tuple[OrdemServico, bool]:
        """Insere ou atualiza uma OS pelo task_id. Retorna (obj, is_new)."""
        existing = db.query(OrdemServico).filter(OrdemServico.task_id == task_id).first()
        if existing:
            for key, value in dados.items():
                setattr(existing, key, value)
            existing.sincronizado_em = datetime.utcnow()
            db.commit()
            db.refresh(existing)
            return existing, False
        nova = OrdemServico(task_id=task_id, **dados)
        db.add(nova)
        db.commit()
        db.refresh(nova)
        return nova, True

    @staticmethod
    def listar(
        db: Session,
        data_inicio: Optional[str] = None,
        data_fim: Optional[str] = None,
        status: Optional[int] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[OrdemServico], int]:
        query = db.query(OrdemServico)

        if data_inicio:
            query = query.filter(func.date(OrdemServico.task_date) >= data_inicio)
        if data_fim:
            query = query.filter(func.date(OrdemServico.task_date) <= data_fim)
        if status is not None:
            query = query.filter(OrdemServico.task_status == status)
        if search:
            query = query.filter(OrdemServico.customer_description.ilike(f"%{search}%"))

        total = query.count()
        ordens = (
            query.order_by(OrdemServico.task_date.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return ordens, total

    @staticmethod
    def get_by_task_id(db: Session, task_id: int) -> Optional[OrdemServico]:
        return db.query(OrdemServico).filter(OrdemServico.task_id == task_id).first()
