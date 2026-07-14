from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, autoincrement=True)

    condominio_id = Column(Integer, ForeignKey("condominios.id", ondelete="SET NULL"), nullable=True, index=True)
    condominio = relationship("Condominio", lazy="joined")

    # ID do Customer no Auvo — usado para localizar OS desse cliente quando ele
    # é cadastrado como Customer próprio (ex.: PF/PJ fora do condomínio)
    auvo_id = Column(Integer, nullable=True, unique=True, index=True)

    nome = Column(String(255), nullable=False)
    tipo = Column(String(2), nullable=False, default="PF")  # PF | PJ
    cpf_cnpj = Column(String(18), nullable=True)
    apartamento = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    telefone = Column(String(20), nullable=True)
    observacao = Column(Text, nullable=True)
    ativo = Column(Boolean, default=True)

    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deletado_em = Column(DateTime, nullable=True)

    recibos = relationship("Recibo", back_populates="cliente", lazy="dynamic")
