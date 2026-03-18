from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class Endereco(Base):
    __tablename__ = "enderecos"

    id = Column(Integer, primary_key=True, index=True)
    condominio_id = Column(Integer, ForeignKey("condominios.id"), unique=True, nullable=False)
    
    # Endereço completo
    rua = Column(String(255), nullable=True)
    numero = Column(String(20), nullable=True)
    complemento = Column(String(100), nullable=True)
    bairro = Column(String(100), nullable=True)
    cidade = Column(String(100), nullable=True)
    estado = Column(String(2), nullable=True)
    cep = Column(String(9), nullable=True)
    
    # Coordenadas geográficas
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # Relacionamento
    condominio = relationship("Condominio", back_populates="endereco")