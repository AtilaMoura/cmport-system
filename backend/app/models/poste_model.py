"""
poste_model.py — poste de monitoramento, um por endereço físico instalado.

condominio_id referencia a tabela `condominios` do banco principal
(cmport_gerenciamento) — sem FK de banco (schemas diferentes), validado no
service contra a sessão principal na hora de criar/editar.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship

from app.core.database_cameras import BaseCameras


class Poste(BaseCameras):
    __tablename__ = "postes"

    id = Column(Integer, primary_key=True, index=True)
    condominio_id = Column(Integer, nullable=False, index=True)

    nome = Column(String(150), nullable=False)
    observacao = Column(Text, nullable=True)

    ativo = Column(Boolean, default=True, nullable=False)
    criado_em = Column(DateTime, default=datetime.utcnow, nullable=False)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    cameras = relationship("Camera", back_populates="poste")
