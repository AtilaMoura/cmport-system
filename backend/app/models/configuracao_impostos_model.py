from sqlalchemy import Column, Integer, Enum, Numeric, Boolean, DateTime
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class TipoServicoConfig(str, enum.Enum):
    MANUTENCAO = "MANUTENCAO"
    ASSISTENCIA = "ASSISTENCIA"
    OUTROS = "OUTROS"


class ConfiguracaoImpostosServico(Base):
    __tablename__ = "configuracao_impostos_servico"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    tipo_servico = Column(Enum(TipoServicoConfig), unique=True, nullable=False)
    pct_iss      = Column(Numeric(5, 2), nullable=False, default=0)
    pct_pis      = Column(Numeric(5, 2), nullable=False, default=0)
    pct_cofins   = Column(Numeric(5, 2), nullable=False, default=0)
    pct_inss     = Column(Numeric(5, 2), nullable=False, default=0)
    pct_csll     = Column(Numeric(5, 2), nullable=False, default=0)
    ativo        = Column(Boolean, nullable=False, default=True)
    criado_em    = Column(DateTime, server_default=func.now())
