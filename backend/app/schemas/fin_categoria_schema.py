from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CategoriaFinanceiraCreate(BaseModel):
    nome:  str
    grupo: str   # RECEITA | FORNECEDOR | DESPESA
    ordem: int = 0


class CategoriaFinanceiraUpdate(BaseModel):
    nome:  Optional[str] = None
    ordem: Optional[int] = None


class CategoriaFinanceiraResponse(BaseModel):
    id:        int
    nome:      str
    grupo:     str
    tipo:      str
    ativo:     bool
    ordem:     int
    criado_em: datetime

    model_config = {"from_attributes": True}
