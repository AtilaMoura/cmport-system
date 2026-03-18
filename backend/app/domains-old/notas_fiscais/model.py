from sqlalchemy import Column, Integer, String, Float, Date, Enum, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base

class TipoNota(enum.Enum):
    ASSISTENCIA = "ASSISTENCIA"
    MANUTENCAO = "MANUTENCAO"
    OUTROS = "OUTROS"

class StatusNota(enum.Enum):
    AUTORIZADA = "AUTORIZADA"
    CANCELADA = "CANCELADA"
    DESCONHECIDO = "DESCONHECIDO"

class NotaFiscal(Base):
    __tablename__ = "notas_fiscais"

    id = Column(Integer, primary_key=True, index=True)

    # Vínculo com condomínio (1 condomínio -> N notas)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=True, index=True)
    
    # REMOVIDO o backref para evitar duplicação
    # Use back_populates se o Condominio já tiver o relacionamento inverso
    # Ou simplesmente não crie o relacionamento aqui se não precisar
    condominio = relationship("Condominio")

    numero_nota = Column(String(50), unique=True, index=True, nullable=False)
    tipo = Column(Enum(TipoNota), default=TipoNota.OUTROS)

    # ✅ Status da nota (AUTORIZADA, CANCELADA, DESCONHECIDO)
    status = Column(Enum(StatusNota), default=StatusNota.AUTORIZADA, nullable=False, index=True)


    parcelas = Column(Integer, default=1)
    valor = Column(Float, nullable=False)

    data_vencimento = Column(Date, nullable=False)
    data_pagamento = Column(Date, nullable=True)

    cliente_nome = Column(String(255), nullable=True)
    observacao = Column(String(500), nullable=True)
    descricao_servico = Column(Text, nullable=True)

    xml_original = Column(Text, nullable=False)

    criado_em = Column(DateTime, server_default=func.now())