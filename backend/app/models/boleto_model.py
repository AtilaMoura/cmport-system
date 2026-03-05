from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class TipoCobranca(str, enum.Enum):
    SIMPLES = "SIMPLES"


class SituacaoBoleto(str, enum.Enum):
    EMABERTO = "EMABERTO"
    PAGO = "PAGO"
    CANCELADO = "CANCELADO"
    EXPIRADO = "EXPIRADO"
    VENCIDO = "VENCIDO"
    BAIXADO = "BAIXADO"


class Boleto(Base):
    __tablename__ = "boletos"

    id = Column(Integer, primary_key=True, index=True)

    # Vínculo com nota fiscal (1:1)
    nota_fiscal_id = Column(Integer, ForeignKey("notas_fiscais.id"), unique=True, nullable=False, index=True)
    nota_fiscal = relationship("NotaFiscal")

    # Referências retornadas pela API Inter
    codigo_solicitacao = Column(String(50), unique=True, nullable=True, index=True)
    nosso_numero = Column(String(20), nullable=True)
    seu_numero = Column(String(15), nullable=True)

    # Valores
    valor_nominal = Column(Float, nullable=False)
    valor_juros = Column(Float, default=0.0)
    valor_multa = Column(Float, default=0.0)
    valor_total_recebido = Column(Float, nullable=True)

    # Datas
    data_emissao = Column(Date, nullable=False)
    data_vencimento = Column(Date, nullable=False)
    data_pagamento = Column(Date, nullable=True)

    # Classificação e situação
    tipo_cobranca = Column(SQLEnum(TipoCobranca), default=TipoCobranca.SIMPLES, nullable=False)
    situacao = Column(SQLEnum(SituacaoBoleto), default=SituacaoBoleto.EMABERTO, nullable=False, index=True)

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())
