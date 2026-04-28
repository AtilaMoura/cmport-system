from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Numeric
from datetime import datetime
from app.core.database import Base

class Produto(Base):
    __tablename__ = "produtos"

    id = Column(Integer, primary_key=True, index=True)
    
    # Identificadores Auvo
    auvo_id = Column(Integer, unique=True, index=True, nullable=False)  # "code" ou "id" numérico no Auvo
    auvo_uuid = Column(String(50), nullable=True)                       # "productId" (GUID)
    external_id = Column(String(100), nullable=True)
    
    # Dados básicos
    nome = Column(String(255), nullable=False, index=True)
    descricao = Column(Text, nullable=True)
    categoria_id = Column(Integer, nullable=True)
    
    # Financeiro e Estoque
    valor_unitario = Column(Numeric(10, 2), nullable=True)
    custo_unitario = Column(Numeric(10, 2), nullable=True)
    estoque_minimo = Column(Numeric(10, 2), nullable=True)
    estoque_total = Column(Numeric(10, 2), nullable=True)
    
    # Metadata
    imagem_url = Column(String(500), nullable=True)
    ativo = Column(Boolean, default=True, nullable=False)
    sincronizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
