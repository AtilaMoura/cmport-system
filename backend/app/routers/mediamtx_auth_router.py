"""
mediamtx_auth_router.py — webhook de autenticação chamado pelo próprio MediaMTX
(authHTTPAddress), não por um usuário logado. Fica FORA do grupo de rotas
protegidas por JWT em main.py (o MediaMTX não tem token).

Regra: só valida a ação "publish" — a câmera precisa existir e estar ativa
no cmport_cameras (identificada pelo path = rtmp_stream_key). Outras ações
(read/playback/api/metrics) são liberadas por enquanto — a autenticação de
quem assiste fica pro backend/frontend na Fase 3, não no MediaMTX.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database_cameras import SessionLocalCameras
from app.repositories.camera_repository import CameraRepository
from app.schemas.mediamtx_auth_schema import MediaMTXAuthRequest

router = APIRouter()


def get_db_cameras():
    db = SessionLocalCameras()
    try:
        yield db
    finally:
        db.close()


@router.post("/auth", status_code=200)
def autenticar(req: MediaMTXAuthRequest, db: Session = Depends(get_db_cameras)):
    if req.action == "publish":
        # path chega como "cam/<chave>" (ver PREFIXO_RTMP em camera_service) —
        # a chave da câmera é sempre a última parte
        chave = req.path.rsplit("/", 1)[-1]
        camera = CameraRepository.get_by_rtmp_stream_key(db, chave)
        if not camera:
            raise HTTPException(401, "Chave de stream inválida ou câmera inativa.")
    return {}
