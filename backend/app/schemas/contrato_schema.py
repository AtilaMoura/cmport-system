from pydantic import BaseModel, model_validator
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class CondominioBrief(BaseModel):
    id: int
    nome: str

    model_config = {"from_attributes": True}


class ContratoCreate(BaseModel):
    condominio_id: int
    ativo: bool = True
    data_inicio: date
    data_termino: Optional[date] = None
    dia_vencimento_padrao: Optional[int] = None
    valor_fixo_mensal: Optional[Decimal] = None
    descricao_padrao_servico: Optional[str] = None
    observacoes_contrato: Optional[str] = None

    @model_validator(mode="after")
    def valida_datas(self):
        if self.data_termino and self.data_termino < self.data_inicio:
            raise ValueError("data_termino não pode ser anterior a data_inicio.")
        if self.dia_vencimento_padrao is not None and not (1 <= self.dia_vencimento_padrao <= 28):
            raise ValueError("dia_vencimento_padrao deve ser entre 1 e 28.")
        return self


class ContratoUpdate(BaseModel):
    ativo: Optional[bool] = None
    data_inicio: Optional[date] = None
    data_termino: Optional[date] = None
    dia_vencimento_padrao: Optional[int] = None
    valor_fixo_mensal: Optional[Decimal] = None
    descricao_padrao_servico: Optional[str] = None
    observacoes_contrato: Optional[str] = None


class ContratoResponse(BaseModel):
    id: int
    condominio_id: int
    condominio: Optional[CondominioBrief] = None
    ativo: bool
    data_inicio: date
    data_termino: Optional[date] = None
    dia_vencimento_padrao: Optional[int] = None
    valor_fixo_mensal: Optional[Decimal] = None
    descricao_padrao_servico: Optional[str] = None
    observacoes_contrato: Optional[str] = None
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None
    criado_por: Optional[str] = None

    model_config = {"from_attributes": True}
