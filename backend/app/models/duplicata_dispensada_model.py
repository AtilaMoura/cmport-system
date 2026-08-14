from sqlalchemy import Column, Integer, DateTime, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class DuplicataDispensada(Base):
    """Par de notas marcado manualmente como 'não é duplicata' — usado pra
    excluir o par da heurística de detecção em FluxoFinanceiroService.detectar_duplicatas."""

    __tablename__ = "duplicatas_dispensadas"

    id = Column(Integer, primary_key=True, index=True)
    nota_id_1 = Column(Integer, nullable=False, index=True)  # sempre o menor dos dois ids
    nota_id_2 = Column(Integer, nullable=False, index=True)  # sempre o maior dos dois ids
    criado_em = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("nota_id_1", "nota_id_2", name="uq_duplicata_dispensada_par"),
    )
