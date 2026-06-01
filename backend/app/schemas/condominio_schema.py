from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime

from app.schemas.endereco_schema import EnderecoResponse
from app.schemas.contato_schema import ContatoResponse


class CondominioCreate(BaseModel):
    nome: str = Field(..., min_length=3, max_length=255)
    cnpj: Optional[str] = Field(None, max_length=18)
    razao_social: Optional[str] = Field(None, max_length=255)
    observacao: Optional[str] = None
    ativo: bool = True

    @field_validator("nome", mode="before")
    @classmethod
    def nome_upper(cls, v: str) -> str:
        return v.upper() if v else v

    @field_validator("razao_social", mode="before")
    @classmethod
    def razao_social_upper(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v


class CondominioUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=3, max_length=255)
    cnpj: Optional[str] = Field(None, max_length=18)
    razao_social: Optional[str] = Field(None, max_length=255)
    observacao: Optional[str] = None
    ativo: Optional[bool] = None

    @field_validator("nome", mode="before")
    @classmethod
    def nome_upper(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v

    @field_validator("razao_social", mode="before")
    @classmethod
    def razao_social_upper(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v


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


class CondominioFullResponse(CondominioResponse):
    endereco: Optional[EnderecoResponse] = None
    contatos: List[ContatoResponse] = []

    model_config = {"from_attributes": True}
