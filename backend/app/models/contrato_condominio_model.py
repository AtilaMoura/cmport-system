from sqlalchemy import Column, Integer, Boolean, Date, DateTime, ForeignKey, Numeric, SmallInteger, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ContratoCondominio(Base):
    __tablename__ = "contratos_condominio"

    id = Column(Integer, primary_key=True, autoincrement=True)

    condominio_id = Column(Integer, ForeignKey("condominios.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    condominio = relationship("Condominio", lazy="joined")

    ativo = Column(Boolean, nullable=False, default=True)
    data_inicio = Column(Date, nullable=False)
    data_termino = Column(Date, nullable=True)

    # Campos opcionais para auto-preenchimento do corpo de nota
    dia_vencimento_padrao = Column(SmallInteger, nullable=True)          # 1-28
    valor_fixo_mensal = Column(Numeric(10, 2), nullable=True)
    descricao_padrao_servico = Column(Text, nullable=True)
    observacoes_contrato = Column(Text, nullable=True)

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())
    criado_por = Column(String(100), nullable=True)
    deletado_em = Column(DateTime, nullable=True)
