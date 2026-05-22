from pydantic import BaseModel, model_validator
from typing import Optional
from datetime import date, datetime


class ContratoCreate(BaseModel):
    condominio_id: int
    ativo: bool = True
    data_inicio: date
    data_termino: Optional[date] = None

    @model_validator(mode="after")
    def valida_datas(self):
        if self.data_termino and self.data_termino < self.data_inicio:
            raise ValueError("data_termino não pode ser anterior a data_inicio.")
        return self


class ContratoUpdate(BaseModel):
    ativo: Optional[bool] = None
    data_inicio: Optional[date] = None
    data_termino: Optional[date] = None


class ContratoResponse(BaseModel):
    id: int
    condominio_id: int
    ativo: bool
    data_inicio: date
    data_termino: Optional[date] = None
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None
    criado_por: Optional[str] = None

    model_config = {"from_attributes": True}
