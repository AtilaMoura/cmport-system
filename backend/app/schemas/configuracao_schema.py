from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class ConfiguracaoEmailCreate(BaseModel):
    nome:   str
    email:  EmailStr
    tipo:   str = "SMTP"         # "SMTP" | "GRAPH_API"
    ativo:  bool = False

    # SMTP
    senha:  Optional[str] = None

    # Graph API
    graph_client_id:     Optional[str] = None
    graph_tenant_id:     Optional[str] = None
    graph_client_secret: Optional[str] = None


class ConfiguracaoEmailUpdate(BaseModel):
    nome:   Optional[str]      = None
    email:  Optional[EmailStr] = None
    tipo:   Optional[str]      = None
    ativo:  Optional[bool]     = None

    # SMTP
    senha:  Optional[str] = None

    # Graph API
    graph_client_id:     Optional[str] = None
    graph_tenant_id:     Optional[str] = None
    graph_client_secret: Optional[str] = None


class ConfiguracaoEmailResponse(BaseModel):
    id:               int
    nome:             str
    email:            str
    tipo:             str
    ativo:            bool
    graph_client_id:  Optional[str] = None
    graph_tenant_id:  Optional[str] = None
    criado_em:        datetime

    model_config = {"from_attributes": True}


class ConfiguracaoEmpresaSchema(BaseModel):
    nome:            str
    email_from_name: str = "CMPort"
    telefone:        Optional[str] = None
    site:            Optional[str] = None

    model_config = {"from_attributes": True}


class TestarEmailResponse(BaseModel):
    ok:       bool
    mensagem: str
