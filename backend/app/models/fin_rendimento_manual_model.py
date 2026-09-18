from sqlalchemy import Column, Integer, SmallInteger, Numeric, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class RendimentoManual(Base):
    """Ajuste manual de rendimento por conta/mês — cobre casos como o do BTG,
    onde o extrato bancário fecha com centavos a mais/menos que a soma das
    movimentações e não dá pra saber se é rendimento de verdade ou resíduo de
    arredondamento do próprio banco. Editado do mesmo jeito que o saldo
    inicial e o saldo do extrato (fin_saldo_inicial / fin_extrato_saldo), e
    somado ao rendimento calculado (vindo de movimentações com categoria
    "Rendimento") no dashboard "por banco"."""
    __tablename__ = "fin_rendimento_manual"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    ano           = Column(SmallInteger, nullable=False)
    mes           = Column(SmallInteger, nullable=False)   # 1–12
    banco_id      = Column(Integer, ForeignKey("bancos.id", ondelete="CASCADE"), nullable=False, index=True)
    valor         = Column(Numeric(12, 2), nullable=False, default=0)
    observacao    = Column(Text, nullable=True)
    criado_em     = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("ano", "mes", "banco_id", name="uq_rendimento_manual_ano_mes_banco"),
    )
