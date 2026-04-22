from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func

from app.core.database import Base


class ConfiguracaoEmail(Base):
    __tablename__ = "configuracao_email"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    nome      = Column(String(100), nullable=False)   # ex: "Email Principal"
    email     = Column(String(200), nullable=False)
    senha_enc = Column(Text, nullable=False)           # senha criptografada
    ativo     = Column(Boolean, nullable=False, default=False)
    criado_em = Column(DateTime, server_default=func.now())


class ConfiguracaoEmpresa(Base):
    __tablename__ = "configuracao_empresa"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    nome            = Column(String(200), nullable=False, default="CMPort")
    email_from_name = Column(String(100), nullable=False, default="CMPort")
    telefone        = Column(String(50), nullable=True)
    site            = Column(String(200), nullable=True)
    atualizado_em   = Column(DateTime, server_default=func.now(), onupdate=func.now())
