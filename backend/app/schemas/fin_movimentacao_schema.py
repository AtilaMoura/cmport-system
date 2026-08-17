from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import date, datetime
from decimal import Decimal

from app.schemas.fin_categoria_schema import CategoriaFinanceiraResponse


class ServicoVinculadoResponse(BaseModel):
    id:            int
    tipo:          str
    numero_os:     Optional[str] = None
    data_servico:  date
    descricao:     Optional[str] = None
    condominio_nome: Optional[str] = None
    numero_nota:   Optional[str] = None

    model_config = {"from_attributes": True}


class OrcamentoVinculadoResponse(BaseModel):
    id:              int
    auvo_public_id:  int
    customer_name:   Optional[str] = None
    net_total_value: Optional[Decimal] = None
    request_date:    Optional[date] = None

    model_config = {"from_attributes": True}


class OsFornecedorReferenciaResponse(BaseModel):
    id:          int
    task_id:     int
    task_date:   Optional[datetime] = None
    report:      Optional[str] = None
    orientation: Optional[str] = None

    model_config = {"from_attributes": True}


class MovimentacaoCreate(BaseModel):
    data:            date
    descricao:       str
    valor:           Decimal
    tipo:            str         # ENTRADA | SAIDA
    categoria_id:    Optional[int] = None
    observacao:      Optional[str] = None
    banco_id:        Optional[int] = None
    banco_origem_id: Optional[int] = None
    fornecedor_id:   Optional[int] = None
    forma_pagamento: Optional[str] = None
    servico_ids:     Optional[List[int]] = None
    orcamento_ids:   Optional[List[int]] = None
    os_fornecedor_ids: Optional[List[int]] = None

    @field_validator("valor")
    @classmethod
    def valor_positivo(cls, v):
        if v <= 0:
            raise ValueError("valor deve ser positivo")
        return v


class MovimentacaoUpdate(BaseModel):
    data:            Optional[date]    = None
    descricao:       Optional[str]     = None
    valor:           Optional[Decimal] = None
    tipo:            Optional[str]     = None
    categoria_id:    Optional[int]     = None
    observacao:      Optional[str]     = None
    status:          Optional[str]     = None
    banco_id:        Optional[int]     = None
    banco_origem_id: Optional[int]     = None
    fornecedor_id:   Optional[int]     = None
    forma_pagamento: Optional[str]     = None
    servico_ids:     Optional[List[int]] = None
    orcamento_ids:   Optional[List[int]] = None
    os_fornecedor_ids: Optional[List[int]] = None

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
    recibo_id:        Optional[int] = None
    banco_id:         Optional[int] = None
    banco_nome:       Optional[str] = None
    banco_origem_id:  Optional[int] = None
    banco_origem_nome: Optional[str] = None
    fornecedor_id:    Optional[int] = None
    fornecedor_nome:  Optional[str] = None
    forma_pagamento:  Optional[str] = None
    servicos_vinculados: List[ServicoVinculadoResponse] = []
    orcamentos_vinculados: List[OrcamentoVinculadoResponse] = []
    os_fornecedor_vinculadas: List[OsFornecedorReferenciaResponse] = []
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
