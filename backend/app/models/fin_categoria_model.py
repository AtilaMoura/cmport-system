import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, SmallInteger, DateTime, UniqueConstraint, Index
from sqlalchemy.sql import func

from app.core.database import Base


class GrupoCategoria(str, enum.Enum):
    RECEITA    = "RECEITA"
    FORNECEDOR = "FORNECEDOR"
    DESPESA    = "DESPESA"


class TipoMovimentacao(str, enum.Enum):
    ENTRADA = "ENTRADA"
    SAIDA   = "SAIDA"


class CategoriaFinanceira(Base):
    __tablename__ = "fin_categorias"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    nome      = Column(String(100), nullable=False)
    grupo     = Column(String(20), nullable=False)   # GrupoCategoria
    tipo      = Column(String(10), nullable=False)   # TipoMovimentacao — derivado do grupo
    ativo     = Column(Boolean, nullable=False, default=True)
    ordem     = Column(SmallInteger, nullable=False, default=0)
    criado_em = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("nome", "grupo", name="uq_categoria_nome_grupo"),
        Index("ix_fin_categorias_grupo", "grupo"),
        Index("ix_fin_categorias_ativo", "ativo"),
    )
