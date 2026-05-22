from sqlalchemy import Column, Integer, Boolean, Date, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ContratoCondominio(Base):
    __tablename__ = "contratos_condominio"

    id = Column(Integer, primary_key=True, autoincrement=True)

    condominio_id = Column(Integer, ForeignKey("condominios.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    condominio = relationship("Condominio")

    ativo = Column(Boolean, nullable=False, default=True)
    data_inicio = Column(Date, nullable=False)
    data_termino = Column(Date, nullable=True)

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())
    criado_por = Column(String(100), nullable=True)
    deletado_em = Column(DateTime, nullable=True)
