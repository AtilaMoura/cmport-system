"""
mediamtx_auth_router.py — webhook de autenticação chamado pelo próprio MediaMTX
(authHTTPAddress), não por um usuário logado. Fica FORA do grupo de rotas
protegidas por JWT em main.py (o MediaMTX não tem token).

Regras em MediaMTXAuthService: publish exige chave de câmera ativa; read/playback
só o backend (segredo interno) — quem assiste passa pelo POST /cameras/{id}/webrtc.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database_cameras import SessionLocalCameras
from app.schemas.mediamtx_auth_schema import MediaMTXAuthRequest
from app.services.mediamtx_auth_service import MediaMTXAuthService

router = APIRouter()


def get_db_cameras():
    db = SessionLocalCameras()
    try:
        yield db
    finally:
        db.close()


@router.post("/auth", status_code=200)
def autenticar(req: MediaMTXAuthRequest, db: Session = Depends(get_db_cameras)):
    MediaMTXAuthService.autenticar(db, req)
    return {}
