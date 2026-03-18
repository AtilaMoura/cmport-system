# repository.py
from sqlalchemy.orm import Session
from typing import List, Optional
from .model import ManutencaoAssistencia

class ServicoRepository:
    @staticmethod
    def create(db: Session, servico_data: dict) -> ManutencaoAssistencia:
        db_servico = ManutencaoAssistencia(**servico_data)
        db.add(db_servico)
        db.commit()
        db.refresh(db_servico)
        return db_servico

    @staticmethod
    def list_by_condominio(db: Session, condominio_id: int) -> List[ManutencaoAssistencia]:
        return db.query(ManutencaoAssistencia).filter(
            ManutencaoAssistencia.condominio_id == condominio_id
        ).order_by(ManutencaoAssistencia.data_servico.desc()).all()

    @staticmethod
    def list_all(db: Session, condominio_id: Optional[int] = None) -> List[ManutencaoAssistencia]:
        query = db.query(ManutencaoAssistencia)
        if condominio_id is not None:
            query = query.filter(ManutencaoAssistencia.condominio_id == condominio_id)
        # Ordenação padrão (opcional, mas recomendado)
        query = query.order_by(ManutencaoAssistencia.data_servico.desc())
        return query.all()

    @staticmethod
    def get_by_id(db: Session, servico_id: int) -> Optional[ManutencaoAssistencia]:
        return db.query(ManutencaoAssistencia).filter(ManutencaoAssistencia.id == servico_id).first()

    @staticmethod
    def update(db: Session, db_servico: ManutencaoAssistencia, update_data: dict) -> ManutencaoAssistencia:
        for key, value in update_data.items():
            setattr(db_servico, key, value)
        db.commit()
        db.refresh(db_servico)
        return db_servico

    @staticmethod
    def delete(db: Session, db_servico: ManutencaoAssistencia) -> None:
        db.delete(db_servico)
        db.commit()