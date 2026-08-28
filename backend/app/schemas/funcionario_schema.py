from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class FuncionarioVariaveisIn(BaseModel):
    salario_mensal: Decimal = Decimal("0")
    dia_pagamento_salario: Optional[int] = None
    adiantamento_tipo: str = "NENHUM"  # NENHUM | FIXO | VARIAVEL
    adiantamento_valor: Decimal = Decimal("0")
    dia_pagamento_adiantamento: Optional[int] = None
    vale_transporte: Decimal = Decimal("0")
    vale_refeicao: Decimal = Decimal("0")
    tem_plantao: bool = False
    plantao_valor: Decimal = Decimal("0")
    tem_hora_extra: bool = False
    hora_extra_valor: Decimal = Decimal("0")
    encargos_percentual: Decimal = Decimal("0")


class FuncionarioVariaveisResponse(FuncionarioVariaveisIn):
    id: int
    funcionario_id: int
    criado_em: datetime
    atualizado_em: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FuncionarioCreate(BaseModel):
    nome: str
    empresa_padrao_cnpj: str  # so digitos — CMPORT (22761557000188) ou TEC (65756913000188)
    cargo: Optional[str] = None
    data_admissao: Optional[date] = None
    data_demissao: Optional[date] = None
    ativo: bool = True
    observacao: Optional[str] = None
    variaveis: Optional[FuncionarioVariaveisIn] = None


class FuncionarioUpdate(BaseModel):
    nome: Optional[str] = None
    empresa_padrao_cnpj: Optional[str] = None
    cargo: Optional[str] = None
    data_admissao: Optional[date] = None
    data_demissao: Optional[date] = None
    ativo: Optional[bool] = None
    observacao: Optional[str] = None
    variaveis: Optional[FuncionarioVariaveisIn] = None


class FuncionarioResponse(BaseModel):
    id: int
    nome: str
    empresa_padrao_cnpj: str
    cargo: Optional[str] = None
    data_admissao: Optional[date] = None
    data_demissao: Optional[date] = None
    ativo: bool
    observacao: Optional[str] = None
    criado_em: datetime
    atualizado_em: Optional[datetime] = None
    variaveis: Optional[FuncionarioVariaveisResponse] = None

    model_config = {"from_attributes": True}
