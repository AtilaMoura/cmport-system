from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from enum import Enum

class TipoServico(str, Enum):
    MANUTENCAO = "manutencao"
    ASSISTENCIA = "assistencia"

class ServicoBase(BaseModel):
    tipo: TipoServico
    data_servico: date
    descricao: Optional[str] = None
    nota_fiscal_id: Optional[int] = None

class ServicoCreate(ServicoBase):
    condominio_id: int

class ServicoUpdate(BaseModel):
    tipo: Optional[TipoServico] = None
    data_servico: Optional[date] = None
    descricao: Optional[str] = None
    numero_nota_fiscal: Optional[int] = None

class ServicoResponse(ServicoBase):
    id: int
    condominio_id: int
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True