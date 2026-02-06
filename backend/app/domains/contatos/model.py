from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Contato(Base):
    __tablename__ = "contatos"

    id = Column(Integer, primary_key=True, index=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    
    # Dados do contato
    nome = Column(String(255), nullable=False)
    telefone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    funcao = Column(String(100), nullable=True)  # Ex: Síndico, Zelador, Administrador
    
    # Contato principal?
    principal = Column(Boolean, default=False)
    
    # Timestamps
    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamento
    condominio = relationship("Condominio", back_populates="contatos")