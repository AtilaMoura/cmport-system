from sqlalchemy import Column, Integer, String, Date, Text, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.core.database import Base

class TipoServico(str, enum.Enum):
    MANUTENCAO = "manutencao"
    ASSISTENCIA = "assistencia"

class ManutencaoAssistencia(Base):
    __tablename__ = "manutencoes_assistencias"

    id = Column(Integer, primary_key=True, index=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    
    # --- ALTERAÇÃO AQUI ---
    # Substituímos String por ForeignKey apontando para a tabela notas_fiscais
    nota_fiscal_id = Column(Integer, ForeignKey("notas_fiscais.id"), nullable=True, index=True)
    
    tipo = Column(SQLEnum(TipoServico), nullable=False, index=True)
    data_servico = Column(Date, nullable=False)
    descricao = Column(Text, nullable=True)
    
    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    condominio = relationship("Condominio", back_populates="servicos")
    # Novo relacionamento para acessar os dados da nota direto pela manutenção
    nota_fiscal = relationship("NotaFiscal")