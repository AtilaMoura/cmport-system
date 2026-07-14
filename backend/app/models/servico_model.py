from sqlalchemy import Column, Integer, String, Date, Text, ForeignKey, DateTime, Enum as SQLEnum, Boolean
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
    nota_fiscal_id = Column(Integer, ForeignKey("notas_fiscais.id"), nullable=True, index=True)
    ordem_servico_id = Column(Integer, ForeignKey("ordens_servico.id"), nullable=True, index=True)

    tipo = Column(SQLEnum(TipoServico), nullable=False, index=True)
    numero_os = Column(String(50), nullable=True)
    data_servico = Column(Date, nullable=False)
    descricao = Column(Text, nullable=True)

    criado_em = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    email_enviado_em = Column(DateTime, nullable=True)
    email_destinatarios = Column(Text, nullable=True)  # JSON: ["email1@...", "email2@..."]

    orcamento_id = Column(Integer, ForeignKey("orcamentos.id", ondelete="SET NULL"), nullable=True, index=True)
    recibo_id = Column(Integer, ForeignKey("recibos.id", ondelete="SET NULL"), nullable=True, index=True)
    bloquear_vinculo_automatico = Column(Boolean, nullable=False, default=False, server_default="0")

    condominio = relationship("Condominio", back_populates="servicos")
    nota_fiscal = relationship("NotaFiscal")
    ordem_servico = relationship("OrdemServico")
    orcamento = relationship("Orcamento")
    recibo = relationship("Recibo", foreign_keys=[recibo_id], back_populates="servicos")
