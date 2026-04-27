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
    atualizado_em   = Column(DateTime, server_default=func.now(), onupdate=func.now())
