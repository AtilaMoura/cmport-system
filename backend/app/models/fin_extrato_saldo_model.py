from sqlalchemy import Column, Integer, SmallInteger, Numeric, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class ExtratoSaldo(Base):
    """Saldo final do extrato bancário de uma conta num mês — a "verdade do banco"
    que o dashboard "por banco" compara contra o saldo calculado pelo sistema.
    Preenchido manualmente pela cliente (fonte=MANUAL) ou puxado da API Inter
    (fonte=INTER)."""
    __tablename__ = "fin_extrato_saldo"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    banco_id      = Column(Integer, ForeignKey("bancos.id", ondelete="CASCADE"), nullable=False, index=True)
    ano           = Column(SmallInteger, nullable=False)
    mes           = Column(SmallInteger, nullable=False)   # 1–12
    saldo_final   = Column(Numeric(12, 2), nullable=False)
    fonte         = Column(String(10), nullable=False, default="MANUAL")  # MANUAL | INTER
    conferido_em  = Column(DateTime, nullable=True)
    observacao    = Column(Text, nullable=True)
    criado_em     = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("banco_id", "ano", "mes", name="uq_extrato_saldo_banco_ano_mes"),
    )
