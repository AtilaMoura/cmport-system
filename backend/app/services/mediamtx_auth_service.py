"""
mediamtx_auth_service.py — regras do webhook de autenticação do MediaMTX.

- publish: a câmera precisa existir e estar ativa (path = cam/<rtmp_stream_key>).
- read/playback: só o próprio backend assiste (Basic auth com MEDIAMTX_READ_SECRET),
  intermediando o WebRTC em CameraService.iniciar_webrtc. O navegador nunca fala
  direto com o MediaMTX, então nunca vê a chave de publicação.
- demais ações (api/metrics/pprof): liberadas — portas não expostas fora da rede Docker.

Fail-closed: sem MEDIAMTX_READ_SECRET configurado, ninguém assiste.
"""
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories.camera_repository import CameraRepository
from app.schemas.mediamtx_auth_schema import MediaMTXAuthRequest
from app.services.camera_service import USUARIO_LEITURA_MEDIAMTX

ACOES_LEITURA = ("read", "playback")


class MediaMTXAuthService:

    @staticmethod
    def autenticar(db: Session, req: MediaMTXAuthRequest) -> None:
        if req.action == "publish":
            # path chega como "cam/<chave>" (ver PREFIXO_RTMP em camera_service) —
            # a chave da câmera é sempre a última parte
            chave = req.path.rsplit("/", 1)[-1]
            if not CameraRepository.get_by_rtmp_stream_key(db, chave):
                raise HTTPException(401, "Chave de stream inválida ou câmera inativa.")
            return

        if req.action in ACOES_LEITURA:
            segredo = settings.MEDIAMTX_READ_SECRET
            if not segredo or not req.password or req.user != USUARIO_LEITURA_MEDIAMTX:
                raise HTTPException(401, "Leitura não autorizada.")
            if not secrets.compare_digest(req.password.encode(), segredo.encode()):
                raise HTTPException(401, "Leitura não autorizada.")
