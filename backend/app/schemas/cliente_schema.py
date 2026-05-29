from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ClienteCreate(BaseModel):
    condominio_id: Optional[int] = None
    nome: str
    tipo: str = "PF"  # PF | PJ
    cpf_cnpj: Optional[str] = None
    apartamento: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    observacao: Optional[str] = None
    ativo: bool = True


class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    apartamento: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    observacao: Optional[str] = None
    ativo: Optional[bool] = None


class ClienteResponse(BaseModel):
    id: int
    condominio_id: Optional[int] = None
    condominio_nome: Optional[str] = None
    nome: str
    tipo: str
    cpf_cnpj: Optional[str] = None
    apartamento: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    observacao: Optional[str] = None
    ativo: bool
    criado_em: Optional[datetime] = None

    model_config = {"from_attributes": True}
