from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime
from decimal import Decimal

from app.schemas.fin_categoria_schema import CategoriaFinanceiraResponse


class MovimentacaoCreate(BaseModel):
    data:         date
    descricao:    str
    valor:        Decimal
    tipo:         str         # ENTRADA | SAIDA
    categoria_id: Optional[int] = None
    observacao:   Optional[str] = None

    @field_validator("valor")
    @classmethod
    def valor_positivo(cls, v):
        if v <= 0:
            raise ValueError("valor deve ser positivo")
        return v


class MovimentacaoUpdate(BaseModel):
    data:         Optional[date]    = None
    descricao:    Optional[str]     = None
    valor:        Optional[Decimal] = None
    tipo:         Optional[str]     = None
    categoria_id: Optional[int]     = None
    observacao:   Optional[str]     = None
    status:       Optional[str]     = None

    @field_validator("valor")
    @classmethod
    def valor_positivo(cls, v):
        if v is not None and v <= 0:
            raise ValueError("valor deve ser positivo")
        return v


class MovimentacaoResponse(BaseModel):
    id:               int
    data:             date
    descricao:        str
    valor:            Decimal
    tipo:             str
    categoria_id:     Optional[int] = None
    categoria:        Optional[CategoriaFinanceiraResponse] = None
    origem:           str
    status:           str
    id_externo_banco: Optional[str] = None
    observacao:       Optional[str] = None
    criado_em:        datetime
    atualizado_em:    datetime

    model_config = {"from_attributes": True}


class DashboardFinanceiroResponse(BaseModel):
    mes:             int
    ano:             int
    saldo_inicial:   Decimal
    entradas:        Decimal
    fornecedores:    Decimal
    despesas:        Decimal
    saidas:          Decimal
    saldo_mes:       Decimal
    saldo_acumulado: Decimal
    # breakdown por grupo
    por_grupo: dict


class SincronizarInterResponse(BaseModel):
    novas:      int
    duplicadas: int
    erros:      int
    mensagem:   str
