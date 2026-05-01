from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Numeric, Date, ForeignKey, Enum, BigInteger
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class TipoItemOrcamento(str, enum.Enum):
    PRODUTO = "PRODUTO"
    SERVICO = "SERVICO"
    CUSTO_ADICIONAL = "CUSTO_ADICIONAL"

class Orcamento(Base):
    __tablename__ = "orcamentos"

    id = Column(Integer, primary_key=True, index=True)
    
    # Identificadores Auvo
    auvo_public_id = Column(Integer, unique=True, index=True, nullable=False) # publicId no Auvo
    customer_id = Column(Integer, index=True, nullable=True)                  # ID do cliente no Auvo
    customer_name = Column(String(255), nullable=True)
    
    # Vínculo local
    condominio_id = Column(Integer, ForeignKey("condominios.id", ondelete="SET NULL"), nullable=True)
    
    # Dados gerais
    external_code = Column(String(50), nullable=True)
    register_date = Column(Date, nullable=True)
    request_date = Column(Date, nullable=True)
    expire_date = Column(Date, nullable=True)
    last_update_date = Column(Date, nullable=True)
    
    observations = Column(Text, nullable=True)
    internal_note = Column(Text, nullable=True)
    public_link = Column(String(500), nullable=True)
    current_stage_description = Column(String(100), nullable=True)
    is_cancelled = Column(Boolean, default=False)
    
    # Valores totais
    discount_value = Column(Numeric(10, 2), default=0)
    total_products = Column(Numeric(12, 2), default=0)
    total_services = Column(Numeric(12, 2), default=0)
    total_additional_costs = Column(Numeric(12, 2), default=0)
    gross_total_value = Column(Numeric(12, 2), default=0)
    net_total_value = Column(Numeric(12, 2), default=0)
    
    sincronizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    condominio = relationship("Condominio")
    itens = relationship("OrcamentoItem", back_populates="orcamento", cascade="all, delete-orphan")
    task_ids = relationship("OrcamentoTaskId", back_populates="orcamento", cascade="all, delete-orphan")

class OrcamentoItem(Base):
    __tablename__ = "orcamento_itens"

    id = Column(Integer, primary_key=True, index=True)
    orcamento_id = Column(Integer, ForeignKey("orcamentos.id", ondelete="CASCADE"), nullable=False)
    
    tipo = Column(Enum(TipoItemOrcamento), nullable=False)
    
    # Vínculo com produto local (sincronizado na 10A)
    produto_id = Column(Integer, ForeignKey("produtos.id", ondelete="SET NULL"), nullable=True)
    
    # Referências Auvo
    auvo_product_id = Column(Integer, nullable=True)    # ID Auvo do produto (cópia)
    auvo_service_id = Column(String(50), nullable=True) # GUID do serviço Auvo
    
    # Dados do item
    nome = Column(String(255), nullable=True)           # Snapshot do nome no momento do orçamento
    descricao = Column(Text, nullable=True)
    quantidade = Column(Numeric(10, 2), default=1)
    valor_unitario = Column(Numeric(10, 2), nullable=False)
    desconto_tipo = Column(String(20), nullable=True)   # 'Percentual' ou 'Monetario'
    desconto_valor = Column(Numeric(10, 2), default=0)
    valor_total = Column(Numeric(12, 2), nullable=False)

    orcamento = relationship("Orcamento", back_populates="itens")
    produto = relationship("Produto")

class OrcamentoTaskId(Base):
    __tablename__ = "orcamento_task_ids"

    orcamento_id = Column(Integer, ForeignKey("orcamentos.id", ondelete="CASCADE"), primary_key=True)
    task_id = Column(BigInteger, primary_key=True, index=True)
    is_manual = Column(Boolean, default=False, nullable=False)

    orcamento = relationship("Orcamento", back_populates="task_ids")
