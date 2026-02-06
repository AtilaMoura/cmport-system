from pydantic import BaseModel
from datetime import date
from typing import Optional
from .model import TipoNota

class NotaFiscalBase(BaseModel):
    numero_nota: str
    tipo: TipoNota
    parcelas: int = 1
    valor: float
    data_vencimento: date
    cliente_nome: Optional[str] = None
    observacao: Optional[str] = None

class NotaFiscalCreate(NotaFiscalBase):
    pass

class NotaFiscalResponse(NotaFiscalBase):
    id: int
    data_pagamento: Optional[date] = None

    class Config:
        from_attributes = True