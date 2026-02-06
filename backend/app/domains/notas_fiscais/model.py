from sqlalchemy import Column, Integer, String, Float, Date, Enum, DateTime
from sqlalchemy.sql import func
import enum
from app.core.database import Base # Ajuste o import conforme seu projeto

class TipoNota(enum.Enum):
    ASSISTENCIA = "ASSISTENCIA"
    MANUTENCAO = "MANUTENCAO"
    OUTROS = "OUTROS"

class NotaFiscal(Base):
    __tablename__ = "notas_fiscais"

    id = Column(Integer, primary_key=True, index=True)
    numero_nota = Column(String(50), unique=True, index=True, nullable=False)
    tipo = Column(Enum(TipoNota), default=TipoNota.OUTROS)
    parcelas = Column(Integer, default=1)
    valor = Column(Float, nullable=False)
    data_vencimento = Column(Date, nullable=False)
    data_pagamento = Column(Date, nullable=True) # Para atualizar via API Inter
    
    # Campo flexível para clientes fora do Auvo
    cliente_nome = Column(String(255), nullable=True)
    observacao = Column(String(500), nullable=True)
    
    criado_em = Column(DateTime, server_default=func.now())