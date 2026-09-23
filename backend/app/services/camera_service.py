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

A chave é credencial de publicação: trafega só pra staff logado (JWT) e nunca
chega ao player — quem assiste passa por iniciar_webrtc, que fala com o
MediaMTX pela rede interna.
"""
import secrets
from typing import Dict, List, Optional, Set

import requests
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.camera_model import Camera, TipoConexaoCamera
from app.repositories.camera_repository import CameraRepository
from app.repositories.poste_repository import PosteRepository
from app.schemas.camera_schema import (
    CameraCreate, CameraUpdate, CameraResponse, CameraWebRTCAnswer,
)
from app.services.condominio_lookup_service import buscar_condominio_ou_404, nomes_por_ids


# Primeira parte do caminho RTMP (a "aplicação"), antes da chave da câmera.
# Equivale ao "feed" da BeNuvem — ver explicação no docstring acima.
PREFIXO_RTMP = "cam"

# Usuário do Basic auth que o backend usa no WHEP do MediaMTX. A senha é o
# MEDIAMTX_READ_SECRET; o webhook (mediamtx_auth_service) confere os dois.
USUARIO_LEITURA_MEDIAMTX = "cmport-backend"


def _gerar_rtmp_stream_key(db: Session) -> str:
    for _ in range(5):
        chave = secrets.token_urlsafe(16)
        if not CameraRepository.existe_rtmp_key(db, chave):
            return chave
    raise HTTPException(500, "Não foi possível gerar uma chave de stream única.")


def _chaves_publicando() -> Optional[Set[str]]:
    """Chaves (rtmp_stream_key) com vídeo chegando agora, via API interna do
    MediaMTX. None se o MediaMTX não responder — a listagem segue sem status."""
    try:
        r = requests.get(
            f"{settings.MEDIAMTX_API_INTERNAL_URL}/v3/paths/list",
            params={"itemsPerPage": 1000}, timeout=3,
        )
        r.raise_for_status()
        prefixo = f"{PREFIXO_RTMP}/"
        return {
            item["name"][len(prefixo):]
            for item in r.json().get("items", [])
            if item.get("ready") and item.get("name", "").startswith(prefixo)
        }
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return None


def _derrubar_publicacao(chave: Optional[str]) -> None:
    """Best-effort: encerra a conexão RTMP publicando em cam/<chave> via API do
    MediaMTX (porta 9997, só acessível pela rede interna). O MediaMTX só consulta
    o webhook ao INICIAR o publish — sem isso, uma conexão já ativa seguiria no ar
    mesmo com a chave trocada ou a câmera desativada."""
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
    def _resp(
        camera: Camera,
        condominio_nome: Optional[str] = None,
        online: Optional[bool] = None,
    ) -> CameraResponse:
        rtmp_url = None
        if camera.tipo_conexao == TipoConexaoCamera.RTMP_ISOLADA and camera.rtmp_stream_key:
            rtmp_url = f"{settings.MEDIAMTX_RTMP_BASE_URL}/{PREFIXO_RTMP}/{camera.rtmp_stream_key}"
        return CameraResponse(
            id=camera.id, condominio_id=camera.condominio_id, condominio_nome=condominio_nome,
            poste_id=camera.poste_id, poste_nome=camera.poste.nome if camera.poste else None,
            nome=camera.nome,
            tipo_conexao=camera.tipo_conexao.value,
            canal=camera.canal, nvr_ip=camera.nvr_ip, nvr_porta=camera.nvr_porta,
            nvr_usuario=camera.nvr_usuario,
            rtmp_stream_key=camera.rtmp_stream_key, rtmp_url=rtmp_url,
            ativo=camera.ativo, online=online,
            criado_em=camera.criado_em, atualizado_em=camera.atualizado_em,
        )

    @staticmethod
    def _online(camera: Camera, publicando: Optional[Set[str]]) -> Optional[bool]:
        # RTSP_NVR ainda não passa pelo MediaMTX — status desconhecido
        if publicando is None or camera.tipo_conexao != TipoConexaoCamera.RTMP_ISOLADA:
            return None
        return camera.rtmp_stream_key in publicando

    @staticmethod
    def _resp_lista(cameras: List[Camera]) -> List[CameraResponse]:
        nomes: Dict[int, str] = nomes_por_ids(c.condominio_id for c in cameras)
        publicando = _chaves_publicando() if cameras else None
        return [
            CameraService._resp(
                c, condominio_nome=nomes.get(c.condominio_id),
                online=CameraService._online(c, publicando),
            )
            for c in cameras
        ]

    @staticmethod
    def _validar_poste(db: Session, poste_id: int, condominio_id: int) -> None:
        poste = PosteRepository.get_by_id(db, poste_id)
        if not poste:
            raise HTTPException(404, f"Poste {poste_id} não encontrado.")
        if poste.condominio_id != condominio_id:
            raise HTTPException(400, "Esse poste pertence a outro condomínio.")
        if not poste.ativo:
            raise HTTPException(400, "Esse poste está desativado.")

    @staticmethod
    def listar(
        db: Session,
        condominio_id: Optional[int] = None,
        poste_id: Optional[int] = None,
        incluir_inativas: bool = False,
    ) -> List[CameraResponse]:
        cameras = CameraRepository.listar(
            db, condominio_id=condominio_id, poste_id=poste_id, incluir_inativas=incluir_inativas,
        )
        return CameraService._resp_lista(cameras)

    @staticmethod
    def obter(db: Session, camera_id: int) -> CameraResponse:
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        return CameraService._resp_lista([camera])[0]

    @staticmethod
    def criar(db: Session, req: CameraCreate) -> CameraResponse:
        condominio = buscar_condominio_ou_404(req.condominio_id)
        if req.poste_id is not None:
            CameraService._validar_poste(db, req.poste_id, req.condominio_id)

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
        # recém-criada: RTMP ainda não publicou (offline); RTSP não tem status
        online = False if tipo == TipoConexaoCamera.RTMP_ISOLADA else None
        return CameraService._resp(camera, condominio_nome=condominio.nome, online=online)

    @staticmethod
    def editar(db: Session, camera_id: int, req: CameraUpdate) -> CameraResponse:
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        dados = req.model_dump(exclude_unset=True)
        if "nome" in dados:
            camera.nome = dados["nome"].strip()
        if "poste_id" in dados:
            if dados["poste_id"] is not None:
                CameraService._validar_poste(db, dados["poste_id"], camera.condominio_id)
            camera.poste_id = dados["poste_id"]
        if camera.tipo_conexao == TipoConexaoCamera.RTSP_NVR:
            for campo in ("canal", "nvr_ip", "nvr_porta", "nvr_usuario"):
                if campo in dados:
                    setattr(camera, campo, dados[campo])
            # senha em branco no formulário = manter a atual (ela nunca volta na resposta)
            if dados.get("nvr_senha"):
                camera.nvr_senha = dados["nvr_senha"]
        if "ativo" in dados:
            camera.ativo = dados["ativo"]
        camera = CameraRepository.save(db, camera)
        if not camera.ativo:
            _derrubar_publicacao(camera.rtmp_stream_key)
        return CameraService._resp_lista([camera])[0]

    @staticmethod
    def rotacionar_chave(db: Session, camera_id: int) -> CameraResponse:
        """Gera uma nova rtmp_stream_key e derruba a publicação ativa com a antiga
        (inclusive de quem tenha sequestrado o stream). A câmera precisa ser
        reconfigurada no local com a nova URL RTMP."""
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        if camera.tipo_conexao != TipoConexaoCamera.RTMP_ISOLADA:
            raise HTTPException(400, "Só câmeras RTMP têm chave de stream.")
        chave_antiga = camera.rtmp_stream_key
        camera.rtmp_stream_key = _gerar_rtmp_stream_key(db)
        camera = CameraRepository.save(db, camera)
        _derrubar_publicacao(chave_antiga)
        return CameraService._resp_lista([camera])[0]

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
            raise HTTPException(400, "Visualização ao vivo disponível só para câmeras RTMP.")

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
    def desativar(db: Session, camera_id: int) -> None:
        """Soft delete — nunca apaga o registro, só marca inativo (regra global do Atila).
        Derruba a publicação ativa: o webhook já recusa câmera inativa ao reconectar."""
        camera = CameraRepository.get_by_id(db, camera_id)
        if not camera:
            raise HTTPException(404, "Câmera não encontrada.")
        camera.ativo = False
        CameraRepository.save(db, camera)
        _derrubar_publicacao(camera.rtmp_stream_key)
