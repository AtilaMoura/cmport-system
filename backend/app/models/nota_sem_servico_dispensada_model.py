from sqlalchemy import Column, Integer, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class NotaSemServicoDispensada(Base):
    """Nota marcada manualmente como 'ok, nao precisa de servico' -- usada pra
    excluir da heuristica de deteccao em FluxoFinanceiroService.detectar_notas_sem_servico."""

    __tablename__ = "notas_sem_servico_dispensadas"

    id = Column(Integer, primary_key=True, index=True)
    nota_id = Column(Integer, nullable=False, unique=True, index=True)
    criado_em = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
