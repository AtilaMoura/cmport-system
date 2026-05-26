import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Numeric, Date, Boolean,
    DateTime, Text, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class OrigemMovimentacao(str, enum.Enum):
    BANCO  = "BANCO"
    MANUAL = "MANUAL"


class StatusMovimentacao(str, enum.Enum):
    PENDENTE = "PENDENTE"
    VALIDADO = "VALIDADO"


class MovimentacaoFinanceira(Base):
    __tablename__ = "fin_movimentacoes"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    data              = Column(Date, nullable=False)
    descricao         = Column(String(500), nullable=False)
    valor             = Column(Numeric(10, 2), nullable=False)   # sempre positivo
    tipo              = Column(String(10), nullable=False)        # ENTRADA | SAIDA
    categoria_id      = Column(Integer, ForeignKey("fin_categorias.id", ondelete="SET NULL"), nullable=True)
    categoria         = relationship("CategoriaFinanceira")
    origem            = Column(String(10), nullable=False, default="MANUAL")
    status            = Column(String(10), nullable=False, default="PENDENTE")
    id_externo_banco  = Column(String(100), nullable=True, unique=True)
    observacao        = Column(Text, nullable=True)
    criado_em         = Column(DateTime, server_default=func.now())
    atualizado_em     = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deletado_em       = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_fin_mov_data",          "data"),
        Index("ix_fin_mov_tipo",          "tipo"),
        Index("ix_fin_mov_status",        "status"),
        Index("ix_fin_mov_origem",        "origem"),
        Index("ix_fin_mov_data_del",      "data", "deletado_em"),
    )
