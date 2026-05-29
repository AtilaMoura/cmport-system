from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Recibo(Base):
    __tablename__ = "recibos"

    id = Column(Integer, primary_key=True, autoincrement=True)

    numero_recibo = Column(String(30), unique=True, nullable=False, index=True)

    cliente_id = Column(Integer, ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True, index=True)
    cliente = relationship("Cliente", back_populates="recibos", lazy="joined")

    condominio_id = Column(Integer, ForeignKey("condominios.id", ondelete="SET NULL"), nullable=True, index=True)
    condominio = relationship("Condominio", lazy="joined")

    # Nome avulso para recibos sem cliente cadastrado (retrocompatibilidade)
    cliente_nome_avulso = Column(String(255), nullable=True)

    descricao_servico = Column(Text, nullable=False)
    valor = Column(Numeric(10, 2), nullable=False)
    data_emissao = Column(Date, nullable=False)
    data_vencimento = Column(Date, nullable=True)
    data_pagamento = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="PENDENTE")  # PENDENTE | PAGO | CANCELADO

    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deletado_em = Column(DateTime, nullable=True)
