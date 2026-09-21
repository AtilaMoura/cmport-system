"""
camera_repository.py — queries e CRUD de Camera (sem lógica de negócio).
"""
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.camera_model import Camera


class CameraRepository:

    @staticmethod
    def listar_por_poste(db: Session, poste_id: int, incluir_inativas: bool = False) -> List[Camera]:
        q = db.query(Camera).filter(Camera.poste_id == poste_id)
        if not incluir_inativas:
            q = q.filter(Camera.ativo.is_(True))
        return q.order_by(Camera.nome).all()

    @staticmethod
    def listar_por_condominio(db: Session, condominio_id: int, incluir_inativas: bool = False) -> List[Camera]:
        """Todas as câmeras do condomínio — com poste ou avulsas (poste_id nulo)."""
        q = db.query(Camera).filter(Camera.condominio_id == condominio_id)
        if not incluir_inativas:
            q = q.filter(Camera.ativo.is_(True))
        return q.order_by(Camera.nome).all()

    @staticmethod
    def get_by_id(db: Session, camera_id: int) -> Optional[Camera]:
        return db.query(Camera).filter(Camera.id == camera_id).first()

    @staticmethod
    def existe_rtmp_key(db: Session, rtmp_stream_key: str) -> bool:
        return db.query(Camera).filter(Camera.rtmp_stream_key == rtmp_stream_key).first() is not None

    @staticmethod
    def create(db: Session, camera: Camera) -> Camera:
        db.add(camera)
        db.commit()
        db.refresh(camera)
        return camera

    @staticmethod
    def save(db: Session, camera: Camera) -> Camera:
        db.commit()
        db.refresh(camera)
        return camera
