from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
import json


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
    emails_copia:    Optional[List[str]] = None

    @field_validator('emails_copia', mode='before')
    @classmethod
    def parse_emails_copia(cls, v):
        if v is None or isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return None
        return None

    model_config = {"from_attributes": True}


class TestarEmailResponse(BaseModel):
    ok:       bool
    mensagem: str


class ConfiguracaoInterCreate(BaseModel):
    cnpj:           str
    razao_social:   Optional[str] = None
    client_id:      Optional[str] = None
    client_secret:  Optional[str] = None
    conta_corrente: Optional[str] = None
    cert_path:      Optional[str] = None
    tipo_nota:      str = "SERVICO"  # "SERVICO" ou "PRODUTO"


class ConfiguracaoInterUpdate(BaseModel):
    cnpj:           Optional[str] = None
    razao_social:   Optional[str] = None
    client_id:      Optional[str] = None
    client_secret:  Optional[str] = None
    conta_corrente: Optional[str] = None
    cert_path:      Optional[str] = None
    ativo:          Optional[bool] = None
    tipo_nota:      Optional[str] = None


class ConfiguracaoInterResponse(BaseModel):
    id:            int
    cnpj:          str
    razao_social:  Optional[str] = None
    client_id:     Optional[str] = None
    client_secret: str = "***"
    ativo:         bool
    tipo_nota:     str = "SERVICO"
    criado_em:     datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):
        instance = super().model_validate(obj, *args, **kwargs)
        instance.client_secret = "***"
        return instance
