from sqlalchemy import Column, Integer, DateTime, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class ParcelaFaltandoDispensada(Base):
    """Parcela especifica marcada manualmente como 'ok, nao precisa gerar' --
    usada pra excluir da heuristica de deteccao em
    FluxoFinanceiroService.detectar_parcelas_faltando."""

    __tablename__ = "parcelas_faltando_dispensadas"

    id = Column(Integer, primary_key=True, index=True)
    nota_id = Column(Integer, nullable=False, index=True)
    numero_parcela = Column(Integer, nullable=False)
    criado_em = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("nota_id", "numero_parcela", name="uq_parcela_dispensada"),)
