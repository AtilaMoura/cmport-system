"""
camera_router.py — handlers FastAPI de Camera. Só chama o service.
Prefixo montado em main.py: /api/v1/cameras (JWT exigido globalmente)
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database_cameras import SessionLocalCameras
from app.schemas.camera_schema import (
    CameraCreate, CameraUpdate, CameraResponse, CameraWebRTCOffer, CameraWebRTCAnswer,
)
from app.services.camera_service import CameraService

router = APIRouter()


def get_db_cameras():
    db = SessionLocalCameras()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=list[CameraResponse])
@router.get("/", response_model=list[CameraResponse])
def listar(
    condominio_id: Optional[int] = None,
    poste_id: Optional[int] = None,
    incluir_inativas: bool = False,
    db: Session = Depends(get_db_cameras),
):
    """Lista geral (painel) — com nome do condomínio/poste e status online."""
    return CameraService.listar(
        db, condominio_id=condominio_id, poste_id=poste_id, incluir_inativas=incluir_inativas,
    )


@router.get("/por-poste/{poste_id}", response_model=list[CameraResponse])
def listar_por_poste(
    poste_id: int,
    incluir_inativas: bool = False,
    db: Session = Depends(get_db_cameras),
):
    return CameraService.listar(db, poste_id=poste_id, incluir_inativas=incluir_inativas)


@router.get("/por-condominio/{condominio_id}", response_model=list[CameraResponse])
def listar_por_condominio(
    condominio_id: int,
    incluir_inativas: bool = False,
    db: Session = Depends(get_db_cameras),
):
    """Todas as câmeras do condomínio — com poste ou avulsas."""
    return CameraService.listar(db, condominio_id=condominio_id, incluir_inativas=incluir_inativas)


@router.post("", response_model=CameraResponse, status_code=201)
@router.post("/", response_model=CameraResponse, status_code=201)
def criar(req: CameraCreate, db: Session = Depends(get_db_cameras)):
    return CameraService.criar(db, req)


@router.get("/{camera_id}", response_model=CameraResponse)
def obter(camera_id: int, db: Session = Depends(get_db_cameras)):
    return CameraService.obter(db, camera_id)


@router.patch("/{camera_id}", response_model=CameraResponse)
def editar(camera_id: int, req: CameraUpdate, db: Session = Depends(get_db_cameras)):
    return CameraService.editar(db, camera_id, req)


@router.post("/{camera_id}/rotacionar-chave", response_model=CameraResponse)
def rotacionar_chave(camera_id: int, db: Session = Depends(get_db_cameras)):
    """Gera nova chave RTMP. A câmera precisa ser reconfigurada com a nova URL."""
    return CameraService.rotacionar_chave(db, camera_id)


@router.post("/{camera_id}/webrtc", response_model=CameraWebRTCAnswer)
def iniciar_webrtc(
    camera_id: int,
    req: CameraWebRTCOffer,
    db: Session = Depends(get_db_cameras),
):
    """Troca SDP pra assistir ao vivo — o navegador nunca fala direto com o MediaMTX."""
    return CameraService.iniciar_webrtc(db, camera_id, req.sdp)


@router.delete("/{camera_id}", status_code=204)
def desativar(camera_id: int, db: Session = Depends(get_db_cameras)):
    CameraService.desativar(db, camera_id)
