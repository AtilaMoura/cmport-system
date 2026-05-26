from sqlalchemy import Column, Integer, SmallInteger, Numeric, Text, DateTime, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class SaldoInicial(Base):
    __tablename__ = "fin_saldo_inicial"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    ano           = Column(SmallInteger, nullable=False)
    mes           = Column(SmallInteger, nullable=False)   # 1–12
    valor         = Column(Numeric(10, 2), nullable=False, default=0)
    observacao    = Column(Text, nullable=True)
    criado_em     = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("ano", "mes", name="uq_saldo_inicial_ano_mes"),
    )
