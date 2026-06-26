from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class DeclaracaoFiscalGerada(Base):
    __tablename__ = "declaracoes_fiscais_geradas"

    id = Column(Integer, primary_key=True, index=True)
    servico_id = Column(Integer, ForeignKey("manutencoes_assistencias.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo = Column(String(10), nullable=False)  # 'inss' | 'simples'
    gerada_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("servico_id", "tipo", name="uq_declaracao_servico_tipo"),)

    servico = relationship("ManutencaoAssistencia")
