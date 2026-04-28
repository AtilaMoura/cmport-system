from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

class TermoGarantiaBase(BaseModel):
    servico_id: int
    produto_descricao: str
    prazo_meses: int
    data_inicio: date
    data_fim: date
    orcamento_id: Optional[int] = None

class TermoGarantiaCreate(TermoGarantiaBase):
    pass

class TermoGarantiaUpdate(BaseModel):
    produto_descricao: Optional[str] = None
    prazo_meses: Optional[int] = None
    data_inicio: Optional[date] = None
    data_fim: Optional[date] = None

class TermoGarantiaSchema(TermoGarantiaBase):
    id: int
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True
