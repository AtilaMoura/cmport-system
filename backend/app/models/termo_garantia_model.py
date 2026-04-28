from sqlalchemy import Column, Integer, String, Date, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class TermoGarantia(Base):
    __tablename__ = "termos_garantia"

    id = Column(Integer, primary_key=True, index=True)
    servico_id = Column(Integer, ForeignKey("manutencoes_assistencias.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    
    produto_descricao = Column(Text, nullable=False)
    prazo_meses = Column(Integer, nullable=False) # 3, 6 ou 12
    data_inicio = Column(Date, nullable=False)
    data_fim = Column(Date, nullable=False)
    
    # FK opcional para orçamentos (de onde o termo pode ter sido gerado)
    orcamento_id = Column(Integer, ForeignKey("orcamentos.id", ondelete="SET NULL"), nullable=True)

    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    servico = relationship("ManutencaoAssistencia")
    orcamento = relationship("Orcamento")
