"""
camera_service.py — lógica de negócio de Camera.

RTMP_ISOLADA: gera uma chave de stream única (rtmp_stream_key) na criação —
mesma ideia da BeNuvem (rtmp://rtmp.benuvem.com.br:1945/feed/<chave>), o
cliente nunca escolhe a chave, só recebe a URL pronta pra configurar no NVR.

A URL precisa ter DUAS partes depois do host (PREFIXO_RTMP + chave), igual a
BeNuvem faz com "feed/<chave>": câmera Intelbras (testado no modelo VIP 1130 B
G2) usa a última parte como nome do stream e o resto como aplicação — se vier
só uma parte, ela fica sem nome de stream e repete a URL inteira, quebrando a
publicação.
"""
import secrets
from typing import List, Optional

import requests
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.camera_model import Camera, TipoConexaoCamera
from app.models.usuario_model import Usuario, RoleUsuario
from app.repositories.camera_repository import CameraRepository
from app.repositories.poste_repository import PosteRepository
from app.schemas.camera_schema import (
    CameraCreate, CameraUpdate, CameraResponse, CameraWebRTCAnswer,
)
from app.services.condominio_lookup_service import buscar_condominio_ou_404


# Primeira parte do caminho RTMP (a "aplicação"), antes da chave da câmera.
# Equivale ao "feed" da BeNuvem — ver explicação no docstring acima.
PREFIXO_RTMP = "cam"

# Usuário do Basic auth que o backend usa no WHEP do MediaMTX. A senha é o
# MEDIAMTX_READ_SECRET; o webhook (mediamtx_auth_router) confere os dois.
USUARIO_LEITURA_MEDIAMTX = "cmport-backend"


def _gerar_rtmp_stream_key(db: Session) -> str:
    for _ in range(5):
        chave = secrets.token_urlsafe(16)
        if not CameraRepository.existe_rtmp_key(db, chave):
            return chave
    raise HTTPException(500, "Não foi possível gerar uma chave de stream única.")


def _derrubar_publicacao(chave: Optional[str]) -> None:
    """Best-effort: encerra a conexão RTMP publicando em cam/<chave> via API do
    MediaMTX (porta 9997, só acessível pela rede interna). Falha aqui não impede
    a rotação — a chave nova já vale, a antiga só não cai imediatamente."""
    if not chave:
        return
    base = settings.MEDIAMTX_API_INTERNAL_URL
    try:
        r = requests.get(f"{base}/v3/paths/get/{PREFIXO_RTMP}/{chave}", timeout=5)
        if r.status_code != 200:
            return  # path inexistente = ninguém publicando
        source = (r.json() or {}).get("source") or {}
        if source.get("type") == "rtmpConn" and source.get("id"):
            requests.post(f"{base}/v3/rtmpconns/kick/{source['id']}", timeout=5)
    except (requests.RequestException, ValueError):
        pass


class CameraService:

    @staticmethod
    def _resp(camera: Camera, condominio_nome: Optional[str] = None, mostrar_chave: bool = False) -> CameraResponse:
        """mostrar_chave=False esconde rtmp_stream_key/rtmp_url — só ADMIN/DEV podem ver
        (a chave é a credencial de publicação: quem tem consegue substituir o vídeo)."""
        rtmp_url = None
        rtmp_stream_key = None
        if mostrar_chave and camera.tipo_conexao == TipoConexaoCamera.RTMP_ISOLADA and camera.rtmp_stream_key:
            rtmp_stream_key = camera.rtmp_stream_key
            rtmp_url = f"{settings.MEDIAMTX_RTMP_BASE_URL}/{PREFIXO_RTMP}/{camera.rtmp_stream_key}"
        return CameraResponse(
            id=camera.id, condominio_id=camera.condominio_id, condominio_nome=condominio_nome,
            poste_id=camera.poste_id, nome=camera.nome,
            tipo_conexao=camera.tipo_conexao.value,
            canal=camera.canal, nvr_ip=camera.nvr_ip, nvr_porta=camera.nvr_porta,
            nvr_usuario=camera.nvr_usuario,
            rtmp_stream_key=rtmp_stream_key, rtmp_url=rtmp_url,
            ativo=camera.ativo, criado_em=camera.criado_em, atualizado_em=camera.atualizado_em,
        )

    @staticmethod
    def pode_ver_chave(usuario: Usuario) -> bool:
        return usuario.role in (RoleUsuario.ADMIN, RoleUsuario.DEV)

    @staticmethod
    def listar_por_poste(db: Session, poste_id: int, usuario: Usuario, incluir_inativas: bool = False) -> List[CameraResponse]:
        cameras = CameraRepository.listar_por_poste(db, poste_id, incluir_inativas=incluir_inativas)
        mostrar = CameraService.pode_ver_chave(usuario)
        return [CameraService._resp(c, mostrar_chave=mostrar) for c in cameras]

    @staticmethod
    def listar_por_condominio(db: Session, condominio_id: int, usuario: Usuario, incluir_inativas: bool = False) -> List[CameraResponse]:
        cameras = CameraRepository.listar_por_condominio(db, condominio_id, incluir_inativas=incluir_inativas)
        mostrar = CameraService.pode_ver_chave(usuario)
        return [CameraService._resp(c, mostrar_chave=mostrar) for c in cameras]

    @staticmethod
    def obter(db: Session, camera_id: int, usuario: Usuario) -> CameraResponse:
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        return CameraService._resp(camera, mostrar_chave=CameraService.pode_ver_chave(usuario))

    @staticmethod
    def rotacionar_chave(db: Session, camera_id: int) -> CameraResponse:
        """Gera uma nova rtmp_stream_key — a antiga para de ser aceita no publish na hora.
        A câmera precisa ser reconfigurada no local com a nova URL RTMP.
        Só ADMIN/DEV (checado no router), então a resposta sempre traz a chave."""
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        if camera.tipo_conexao != TipoConexaoCamera.RTMP_ISOLADA:
            raise HTTPException(400, "Só câmeras RTMP_ISOLADA têm chave de stream.")
        chave_antiga = camera.rtmp_stream_key
        camera.rtmp_stream_key = _gerar_rtmp_stream_key(db)
        camera = CameraRepository.save(db, camera)
        # O MediaMTX só consulta o webhook ao INICIAR o publish — uma conexão já
        # ativa com a chave antiga (inclusive de quem sequestrou o stream) seguiria
        # no ar. Derruba ela na hora; ao reconectar, cai no 401.
        _derrubar_publicacao(chave_antiga)
        return CameraService._resp(camera, mostrar_chave=True)

    @staticmethod
    def iniciar_webrtc(db: Session, camera_id: int, sdp_offer: str) -> CameraWebRTCAnswer:
        """Intermedia a negociação WebRTC (WHEP) entre navegador e MediaMTX.

        O navegador nunca conhece a rtmp_stream_key nem fala direto com o MediaMTX:
        manda o SDP offer pra cá (autenticado por JWT), o backend repassa pro WHEP
        interno autenticado com MEDIAMTX_READ_SECRET e devolve o SDP answer.
        O vídeo em si flui direto MediaMTX → navegador via UDP (porta 8189).
        """
        if not settings.MEDIAMTX_READ_SECRET:
            raise HTTPException(503, "Visualização de câmeras não configurada no servidor.")

        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera or not camera.ativo:
            raise HTTPException(404, "Câmera não encontrada ou inativa.")
        if camera.tipo_conexao != TipoConexaoCamera.RTMP_ISOLADA or not camera.rtmp_stream_key:
            raise HTTPException(400, "Visualização ao vivo disponível só para câmeras RTMP_ISOLADA.")

        url = f"{settings.MEDIAMTX_WEBRTC_INTERNAL_URL}/{PREFIXO_RTMP}/{camera.rtmp_stream_key}/whep"
        try:
            resp = requests.post(
                url,
                data=sdp_offer.encode("utf-8"),
                headers={"Content-Type": "application/sdp"},
                auth=(USUARIO_LEITURA_MEDIAMTX, settings.MEDIAMTX_READ_SECRET),
                timeout=10,
            )
        except requests.RequestException:
            raise HTTPException(502, "Servidor de vídeo indisponível.")

        if resp.status_code == 404:
            raise HTTPException(409, "Câmera offline — nenhum vídeo sendo recebido agora.")
        if resp.status_code != 201:
            # não repassa o corpo do MediaMTX pro cliente (pode conter o path/chave)
            raise HTTPException(502, f"Servidor de vídeo recusou a conexão (HTTP {resp.status_code}).")
        return CameraWebRTCAnswer(sdp=resp.text)

    @staticmethod
    def criar(db: Session, req: CameraCreate, usuario: Usuario) -> CameraResponse:
        condominio = buscar_condominio_ou_404(req.condominio_id)

        if req.poste_id is not None:
            poste = PosteRepository.get_by_id(db, req.poste_id)
            if not poste:
                raise HTTPException(404, f"Poste {req.poste_id} não encontrado.")
            if poste.condominio_id != req.condominio_id:
                raise HTTPException(400, "Esse poste pertence a outro condomínio.")

        tipo = TipoConexaoCamera(req.tipo_conexao)
        camera = Camera(
            condominio_id=req.condominio_id,
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
        return CameraService._resp(
            camera, condominio_nome=condominio.nome,
            mostrar_chave=CameraService.pode_ver_chave(usuario),
        )

    @staticmethod
    def editar(db: Session, camera_id: int, req: CameraUpdate, usuario: Usuario) -> CameraResponse:
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
        return CameraService._resp(camera, mostrar_chave=CameraService.pode_ver_chave(usuario))

    @staticmethod
    def desativar(db: Session, camera_id: int) -> None:
        """Soft delete — nunca apaga o registro, só marca inativo (regra global do Atila)."""
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        camera.ativo = False
        CameraRepository.save(db, camera)
