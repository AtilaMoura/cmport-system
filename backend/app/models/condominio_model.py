from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Condominio(Base):
    __tablename__ = "condominios"

    id = Column(Integer, primary_key=True, index=True)

    auvo_id = Column(Integer, unique=True, index=True, nullable=True)
    external_id = Column(String(100), nullable=True)

    nome = Column(String(255), nullable=False, index=True)
    cnpj = Column(String(18), nullable=True, unique=True)
    razao_social = Column(String(255), nullable=True)
    observacao = Column(Text, nullable=True)

    ativo = Column(Boolean, default=True)

    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    endereco = relationship("Endereco", back_populates="condominio", uselist=False, cascade="all, delete-orphan")
    contatos = relationship("Contato", back_populates="condominio", cascade="all, delete-orphan")
    servicos = relationship("ManutencaoAssistencia", back_populates="condominio", cascade="all, delete-orphan")
