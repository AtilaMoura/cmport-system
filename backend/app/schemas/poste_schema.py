from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class PosteBase(BaseModel):
    nome: str = Field(..., min_length=2, max_length=150)
    observacao: Optional[str] = None


class PosteCreate(PosteBase):
    condominio_id: int


class PosteUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=2, max_length=150)
    observacao: Optional[str] = None
    ativo: Optional[bool] = None


class PosteResponse(PosteBase):
    id: int
    condominio_id: int
    condominio_nome: Optional[str] = None
    ativo: bool
    total_cameras: int = 0
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True
