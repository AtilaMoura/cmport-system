from sqlalchemy import Column, Integer, String, Float, Numeric, Date, Enum, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class TipoNota(enum.Enum):
    ASSISTENCIA = "ASSISTENCIA"
    MANUTENCAO = "MANUTENCAO"
    PRODUTO = "PRODUTO"


class StatusNota(enum.Enum):
    AUTORIZADA = "AUTORIZADA"
    CANCELADA = "CANCELADA"
    DESCONHECIDO = "DESCONHECIDO"


class NotaFiscal(Base):
    __tablename__ = "notas_fiscais"

    id = Column(Integer, primary_key=True, index=True)

    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=True, index=True)
    condominio = relationship("Condominio")

    numero_nota = Column(String(50), unique=True, index=True, nullable=False)
    tipo = Column(Enum(TipoNota), default=TipoNota.PRODUTO)
    status = Column(Enum(StatusNota), default=StatusNota.AUTORIZADA, nullable=False, index=True)

    parcelas = Column(Integer, default=1)
    # Numeric(asdecimal=False) -- mesma razao do boleto_model: evita ruido de FLOAT
    # binario acumulando em somas de varias notas (ver fluxo_financeiro_service.py).
    valor = Column(Numeric(10, 2, asdecimal=False), nullable=False)

    data_vencimento = Column(Date, nullable=False)
    data_pagamento = Column(Date, nullable=True)

    cliente_nome = Column(String(255), nullable=True)
    cnpj_emitente = Column(String(18), nullable=True)
    observacao = Column(String(500), nullable=True)
    descricao_servico = Column(Text, nullable=True)

    # Valor por parcela para geração de boleto
    valor_boleto_parcela = Column(Numeric(10, 2, asdecimal=False), nullable=True)
    # JSON: [{"parcela": 1, "valor": 640.0, "data": "2026-01-09"}, ...]
    parcelas_json = Column(JSON, nullable=True)

    # Impostos NFSe
    iss    = Column(Float, nullable=True)
    pis    = Column(Float, nullable=True)
    cofins = Column(Float, nullable=True)
    inss   = Column(Float, nullable=True)
    csll   = Column(Float, nullable=True)

    # Impostos NFe (ICMSTot) + retenções da descrição
    icms   = Column(Float, nullable=True)
    prev   = Column(Float, nullable=True)   # PREV/INSS retenção NFe

    xml_original = Column(Text, nullable=False)

    # Alertas de divergência de impostos (comparação XML vs configuração)
    alerta_impostos      = Column(Integer, default=0, nullable=False)   # 0=ok, 1=alerta ativo
    divergencia_impostos = Column(JSON, nullable=True)

    # Vínculo entre duas notas (simétrico: A aponta para B e B aponta para A)
    nota_vinculada_id = Column(Integer, ForeignKey("notas_fiscais.id"), nullable=True, index=True)
    nota_vinculada = relationship("NotaFiscal", remote_side="NotaFiscal.id", foreign_keys=[nota_vinculada_id])

    # Configuração de imposto definida na aprovação do boleto vinculado
    # {"aplicar_imposto_em": "nota_a"|"nota_b"|"ambas"|"nenhuma", "nota_a_id": int, "nota_b_id": int}
    imposto_config_vinculo = Column(JSON, nullable=True)

    # Armazenamento de PDF (MinIO / R2)
    pdf_object_key = Column(String(500), nullable=True)

    # Vínculo com o corpo da nota gerado antes do XML chegar
    corpo_nota_id = Column(Integer, ForeignKey("corpos_nota.id", ondelete="SET NULL"), nullable=True, unique=True, index=True)

    criado_em = Column(DateTime, server_default=func.now())
