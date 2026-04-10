from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from datetime import datetime


class ContatoBase(BaseModel):
    nome: str = Field(..., min_length=3, max_length=255)
    telefone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = Field(None)
    funcao: Optional[str] = Field(None, max_length=100)
    principal: bool = False
    receber_boleto: bool = True

    @validator("email", pre=True)
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v


class ContatoCreate(ContatoBase):
    condominio_id: int


class ContatoUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=3, max_length=255)
    telefone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    funcao: Optional[str] = Field(None, max_length=100)
    principal: Optional[bool] = None
    receber_boleto: Optional[bool] = None


class ContatoResponse(ContatoBase):
    id: int
    condominio_id: int
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True
