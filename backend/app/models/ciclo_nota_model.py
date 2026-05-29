import enum

from sqlalchemy import Column, Integer, SmallInteger, Enum, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class TipoNotaCorpo(str, enum.Enum):
    MANUTENCAO = "MANUTENCAO"
    SERVICO = "SERVICO"
    PRODUTO = "PRODUTO"


class StatusCiclo(str, enum.Enum):
    PENDENTE = "PENDENTE"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    CONCLUIDO = "CONCLUIDO"


class CicloNota(Base):
    """Mês de referência de faturamento por condomínio e tipo de nota.

    Cada linha representa exatamente um mês para um condomínio.
    Use esta tabela como ponto de entrada para consultas mensais — nunca
    consulte corpos_nota diretamente para isso.
    """
    __tablename__ = "ciclos_nota"

    id = Column(Integer, primary_key=True, autoincrement=True)

    condominio_id = Column(Integer, ForeignKey("condominios.id", ondelete="CASCADE"), nullable=False, index=True)
    condominio = relationship("Condominio")

    contrato_id = Column(Integer, ForeignKey("contratos_condominio.id", ondelete="SET NULL"), nullable=True, index=True)

    tipo_nota = Column(Enum(TipoNotaCorpo), nullable=False)
    ano = Column(SmallInteger, nullable=False)
    mes = Column(SmallInteger, nullable=False)

    status_ciclo = Column(Enum(StatusCiclo), nullable=False, default=StatusCiclo.PENDENTE)

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    corpos = relationship("CorpoNota", back_populates="ciclo", lazy="select")

    __table_args__ = (
        UniqueConstraint("condominio_id", "contrato_id", "tipo_nota", "ano", "mes", name="uq_ciclo_condominio_contrato_tipo_mes"),
        Index("ix_ciclo_status", "status_ciclo"),
        Index("ix_ciclo_periodo", "ano", "mes"),
    )
