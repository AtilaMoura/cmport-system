from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class ConfiguracaoEmailCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    ativo: bool = False


class ConfiguracaoEmailUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    senha: Optional[str] = None
    ativo: Optional[bool] = None


class ConfiguracaoEmailResponse(BaseModel):
    id: int
    nome: str
    email: str
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


class ConfiguracaoEmpresaSchema(BaseModel):
    nome: str
    email_from_name: str = "CMPort"
    telefone: Optional[str] = None
    site: Optional[str] = None

    model_config = {"from_attributes": True}


class TestarEmailResponse(BaseModel):
    ok: bool
    mensagem: str
