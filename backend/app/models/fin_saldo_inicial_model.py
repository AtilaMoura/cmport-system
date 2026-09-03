from sqlalchemy import Column, Integer, SmallInteger, Numeric, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class SaldoInicial(Base):
    __tablename__ = "fin_saldo_inicial"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    ano           = Column(SmallInteger, nullable=False)
    mes           = Column(SmallInteger, nullable=False)   # 1–12
    # banco_id NULL = saldo global do mês (comportamento legado, usado pelo
    # dashboard consolidado). Preenchido = saldo inicial daquela conta bancária,
    # usado pelo dashboard "por banco".
    banco_id      = Column(Integer, ForeignKey("bancos.id", ondelete="CASCADE"), nullable=True, index=True)
    valor         = Column(Numeric(12, 2), nullable=False, default=0)
    observacao    = Column(Text, nullable=True)
    criado_em     = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("ano", "mes", "banco_id", name="uq_saldo_inicial_ano_mes_banco"),
    )
