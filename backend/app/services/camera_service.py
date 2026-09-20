"""
camera_service.py — lógica de negócio de Camera.

RTMP_ISOLADA: gera uma chave de stream única (rtmp_stream_key) na criação —
mesma ideia da BeNuvem (rtmp://rtmp.benuvem.com.br:1945/feed/<chave>), o
cliente nunca escolhe a chave, só recebe a URL pronta pra configurar no NVR.
"""
import secrets
from typing import List
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.camera_model import Camera, TipoConexaoCamera
from app.repositories.camera_repository import CameraRepository
from app.repositories.poste_repository import PosteRepository
from app.schemas.camera_schema import CameraCreate, CameraUpdate, CameraResponse


def _gerar_rtmp_stream_key(db: Session) -> str:
    for _ in range(5):
        chave = secrets.token_urlsafe(16)
        if not CameraRepository.existe_rtmp_key(db, chave):
            return chave
    raise HTTPException(500, "Não foi possível gerar uma chave de stream única.")


class CameraService:

    @staticmethod
    def _resp(camera: Camera) -> CameraResponse:
        rtmp_url = None
        if camera.tipo_conexao == TipoConexaoCamera.RTMP_ISOLADA and camera.rtmp_stream_key:
            rtmp_url = f"{settings.MEDIAMTX_RTMP_BASE_URL}/{camera.rtmp_stream_key}"
        return CameraResponse(
            id=camera.id, poste_id=camera.poste_id, nome=camera.nome,
            tipo_conexao=camera.tipo_conexao.value,
            canal=camera.canal, nvr_ip=camera.nvr_ip, nvr_porta=camera.nvr_porta,
            nvr_usuario=camera.nvr_usuario,
            rtmp_stream_key=camera.rtmp_stream_key, rtmp_url=rtmp_url,
            ativo=camera.ativo, criado_em=camera.criado_em, atualizado_em=camera.atualizado_em,
        )

    @staticmethod
    def listar_por_poste(db: Session, poste_id: int, incluir_inativas: bool = False) -> List[CameraResponse]:
        cameras = CameraRepository.listar_por_poste(db, poste_id, incluir_inativas=incluir_inativas)
        return [CameraService._resp(c) for c in cameras]

    @staticmethod
    def obter(db: Session, camera_id: int) -> CameraResponse:
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        return CameraService._resp(camera)

    @staticmethod
    def criar(db: Session, req: CameraCreate) -> CameraResponse:
        poste = PosteRepository.get_by_id(db, req.poste_id)
        if not poste:
            raise HTTPException(404, f"Poste {req.poste_id} não encontrado.")

        tipo = TipoConexaoCamera(req.tipo_conexao)
        camera = Camera(
            poste_id=req.poste_id,
            nome=req.nome.strip(),
            tipo_conexao=tipo,
        )
        if tipo == TipoConexaoCamera.RTSP_NVR:
            camera.canal = req.canal
            camera.nvr_ip = req.nvr_ip
            camera.nvr_porta = req.nvr_porta or 554
            camera.nvr_usuario = req.nvr_usuario
            camera.nvr_senha = req.nvr_senha
        else:
            camera.rtmp_stream_key = _gerar_rtmp_stream_key(db)

        camera = CameraRepository.create(db, camera)
        return CameraService._resp(camera)

    @staticmethod
    def editar(db: Session, camera_id: int, req: CameraUpdate) -> CameraResponse:
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        dados = req.model_dump(exclude_unset=True)
        if "nome" in dados:
            camera.nome = dados["nome"].strip()
        if camera.tipo_conexao == TipoConexaoCamera.RTSP_NVR:
            for campo in ("canal", "nvr_ip", "nvr_porta", "nvr_usuario", "nvr_senha"):
                if campo in dados:
                    setattr(camera, campo, dados[campo])
        if "ativo" in dados:
            camera.ativo = dados["ativo"]
        camera = CameraRepository.save(db, camera)
        return CameraService._resp(camera)

    @staticmethod
    def desativar(db: Session, camera_id: int) -> None:
        """Soft delete — nunca apaga o registro, só marca inativo (regra global do Atila)."""
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        camera.ativo = False
        CameraRepository.save(db, camera)
