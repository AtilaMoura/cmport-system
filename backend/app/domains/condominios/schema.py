from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# Schema para criação
class CondominioCreate(BaseModel):
    nome: str = Field(..., min_length=3, max_length=255)
    cnpj: Optional[str] = Field(None, max_length=18)
    razao_social: Optional[str] = Field(None, max_length=255)
    observacao: Optional[str] = None
    ativo: bool = True


# Schema para atualização
class CondominioUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=3, max_length=255)
    cnpj: Optional[str] = Field(None, max_length=18)
    razao_social: Optional[str] = Field(None, max_length=255)
    observacao: Optional[str] = None
    ativo: Optional[bool] = None


# Schema para resposta
class CondominioResponse(BaseModel):
    id: int
    auvo_id: Optional[int]
    external_id: Optional[str]
    nome: str
    cnpj: Optional[str]
    razao_social: Optional[str]
    observacao: Optional[str]
    ativo: bool
    criado_em: datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}