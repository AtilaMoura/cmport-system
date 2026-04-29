from sqlalchemy.orm import Session
from typing import Optional
from app.models.termo_garantia_model import TermoGarantia


class TermoGarantiaRepository:

    @staticmethod
    def get_by_id(db: Session, termo_id: int) -> Optional[TermoGarantia]:
        return db.query(TermoGarantia).filter(TermoGarantia.id == termo_id).first()

    @staticmethod
    def get_by_servico_id(db: Session, servico_id: int) -> Optional[TermoGarantia]:
        return db.query(TermoGarantia).filter(TermoGarantia.servico_id == servico_id).first()

    @staticmethod
    def create(db: Session, termo_data: dict) -> TermoGarantia:
        db_termo = TermoGarantia(**termo_data)
        db.add(db_termo)
        db.commit()
        db.refresh(db_termo)
        return db_termo

    @staticmethod
    def upsert_by_servico_id(db: Session, servico_id: int, termo_data: dict) -> TermoGarantia:
        """Cria ou substitui o termo do serviço (regerar substitui o existente)."""
        existente = TermoGarantiaRepository.get_by_servico_id(db, servico_id)
        if existente:
            for key, value in termo_data.items():
                if key != 'servico_id':
                    setattr(existente, key, value)
            db.commit()
            db.refresh(existente)
            return existente
        return TermoGarantiaRepository.create(db, termo_data)

    @staticmethod
    def update(db: Session, termo_id: int, termo_data: dict) -> Optional[TermoGarantia]:
        db_termo = TermoGarantiaRepository.get_by_id(db, termo_id)
        if not db_termo:
            return None
        for key, value in termo_data.items():
            setattr(db_termo, key, value)
        db.commit()
        db.refresh(db_termo)
        return db_termo

    @staticmethod
    def delete(db: Session, termo_id: int) -> bool:
        db_termo = TermoGarantiaRepository.get_by_id(db, termo_id)
        if not db_termo:
            return False
        db.delete(db_termo)
        db.commit()
        return True

    @staticmethod
    def delete_by_servico_id(db: Session, servico_id: int) -> bool:
        db_termo = TermoGarantiaRepository.get_by_servico_id(db, servico_id)
        if not db_termo:
            return False
        db.delete(db_termo)
        db.commit()
        return True
