from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from datetime import datetime

# Campos comuns para evitar repetição
class ContatoBase(BaseModel):
    nome: str = Field(..., min_length=3, max_length=255)
    telefone: Optional[str] = Field(None, max_length=20)
    
    # O segredo é garantir que ele aceite None e trate strings vazias
    email: Optional[EmailStr] = Field(None)
    
    funcao: Optional[str] = Field(None, max_length=100)
    principal: bool = False

    # Este validador garante que se por acaso vier uma string vazia, 
    # ela vire None antes de chegar no EmailStr
    @validator("email", pre=True)
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v

# Dados necessários para criar
class ContatoCreate(ContatoBase):
    condominio_id: int

# Dados que podem ser atualizados (tudo opcional)
class ContatoUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=3, max_length=255)
    telefone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    funcao: Optional[str] = Field(None, max_length=100)
    principal: Optional[bool] = None

# Resposta da API
class ContatoResponse(ContatoBase):
    id: int
    condominio_id: int
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True