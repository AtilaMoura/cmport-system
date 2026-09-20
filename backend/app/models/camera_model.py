"""
camera_model.py — câmera vinculada a um poste.

Dois modos de conexão (arquitetura em arquitetura-tecnica/arquitetura-cameras-dvr-tec.pptx):
- RTSP_NVR: câmera é um canal de um NVR/DVR na rede local do poste — precisa de VPN
  (Tailscale) pra alcançar de fora; guarda IP/porta/usuário/senha do NVR + canal.
- RTMP_ISOLADA: câmera/NVR empurra o vídeo direto pro nosso MediaMTX (mesmo modelo
  que a BeNuvem já usa hoje) — guarda só a chave/path única do stream (rtmp_stream_key).
"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.core.database_cameras import BaseCameras


class TipoConexaoCamera(str, enum.Enum):
    RTSP_NVR = "RTSP_NVR"
    RTMP_ISOLADA = "RTMP_ISOLADA"


class Camera(BaseCameras):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    poste_id = Column(Integer, ForeignKey("postes.id"), nullable=False, index=True)

    nome = Column(String(150), nullable=False)
    tipo_conexao = Column(SQLEnum(TipoConexaoCamera), nullable=False)

    # RTSP_NVR
    canal = Column(Integer, nullable=True)
    nvr_ip = Column(String(45), nullable=True)
    nvr_porta = Column(Integer, nullable=True, default=554)
    nvr_usuario = Column(String(100), nullable=True)
    nvr_senha = Column(String(255), nullable=True)

    # RTMP_ISOLADA — path único usado no MediaMTX (rtmp://<servidor>:1935/<rtmp_stream_key>)
    rtmp_stream_key = Column(String(100), nullable=True, unique=True)

    ativo = Column(Boolean, default=True, nullable=False)
    criado_em = Column(DateTime, default=datetime.utcnow, nullable=False)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    poste = relationship("Poste", back_populates="cameras")
