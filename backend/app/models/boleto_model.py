from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum as SQLEnum, Text
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


class FormaPagamento(str, enum.Enum):
    BOLETO_INTER = "BOLETO_INTER"
    BOLETO_ITAU = "BOLETO_ITAU"
    PIX = "PIX"
    DINHEIRO = "DINHEIRO"
    TRANSFERENCIA = "TRANSFERENCIA"
    CHEQUE = "CHEQUE"


class Boleto(Base):
    __tablename__ = "boletos"

    id = Column(Integer, primary_key=True, index=True)

    nota_fiscal_id = Column(Integer, ForeignKey("notas_fiscais.id"), nullable=False, index=True)
    nota_fiscal = relationship("NotaFiscal")

    numero_parcela = Column(Integer, default=1, nullable=False)
    total_parcelas = Column(Integer, default=1, nullable=False)

    codigo_solicitacao = Column(String(50), unique=True, nullable=True, index=True)
    nosso_numero = Column(String(20), nullable=True)
    seu_numero = Column(String(15), nullable=True)

    valor_nominal = Column(Float, nullable=False)
    valor_juros = Column(Float, default=0.0)
    valor_multa = Column(Float, default=0.0)
    valor_total_recebido = Column(Float, nullable=True)

    data_emissao = Column(Date, nullable=False)
    data_vencimento = Column(Date, nullable=False)
    data_pagamento = Column(Date, nullable=True)

    tipo_cobranca = Column(SQLEnum(TipoCobranca), default=TipoCobranca.SIMPLES, nullable=False)
    situacao = Column(SQLEnum(SituacaoBoleto), default=SituacaoBoleto.EMABERTO, nullable=False, index=True)

    # Novos campos para forma de pagamento
    forma_pagamento = Column(SQLEnum(FormaPagamento), default=FormaPagamento.BOLETO_INTER, nullable=False)
    banco_pagamento = Column(String(100), nullable=True)
    observacao = Column(Text, nullable=True)

    # Vínculo direto com o corpo da nota para rastreio completo do ciclo
    corpo_nota_id = Column(Integer, ForeignKey("corpos_nota.id", ondelete="SET NULL"), nullable=True, index=True)

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())
