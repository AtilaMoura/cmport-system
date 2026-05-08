from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func

from app.core.database import Base


class ConfiguracaoEmail(Base):
    __tablename__ = "configuracao_email"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    nome      = Column(String(100), nullable=False)
    email     = Column(String(200), nullable=False)   # endereço remetente
    tipo      = Column(String(20),  nullable=False, default="SMTP")  # SMTP | GRAPH_API

    # SMTP — senha da conta Outlook
    senha_enc = Column(Text, nullable=True)

    # Graph API — credenciais do Azure AD app registration
    graph_client_id  = Column(String(200), nullable=True)
    graph_tenant_id  = Column(String(200), nullable=True)
    graph_secret_enc = Column(Text,        nullable=True)  # client_secret criptografado

    ativo     = Column(Boolean, nullable=False, default=False)
    criado_em = Column(DateTime, server_default=func.now())


class ConfiguracaoEmpresa(Base):
    __tablename__ = "configuracao_empresa"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    nome            = Column(String(200), nullable=False, default="CMPort")
    email_from_name = Column(String(100), nullable=False, default="CMPort")
    telefone        = Column(String(50), nullable=True)
    site            = Column(String(200), nullable=True)
    emails_copia    = Column(Text, nullable=True)  # JSON: ["email1@...", "email2@..."]
    atualizado_em   = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ConfiguracaoInter(Base):
    __tablename__ = "configuracao_inter"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    cnpj           = Column(String(18), nullable=False, unique=True)
    razao_social   = Column(String(255), nullable=True)
    client_id      = Column(String(300), nullable=False)
    client_secret  = Column(String(300), nullable=False)
    conta_corrente = Column(String(50), nullable=False)
    cert_path      = Column(String(500), nullable=False)
    ativo          = Column(Boolean, default=True)
    criado_em      = Column(DateTime, default=datetime.utcnow)
