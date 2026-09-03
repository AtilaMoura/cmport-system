from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class SaldoInicialUpsert(BaseModel):
    valor:      Decimal
    observacao: Optional[str] = None


class SaldoInicialResponse(BaseModel):
    id:            int
    ano:           int
    mes:           int
    banco_id:      Optional[int] = None
    valor:         Decimal
    observacao:    Optional[str] = None
    criado_em:     datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}


class SaldoInicialBancoLinha(BaseModel):
    banco_id:    int
    banco_nome:  str
    empresa:     Optional[str] = None      # "CMPORT" | "TEC"
    valor:       Decimal = Decimal(0)
    informado:   bool = False              # há registro salvo pra essa conta/mês
    observacao:  Optional[str] = None


class SaldoInicialPorBancoResponse(BaseModel):
    ano:     int
    mes:     int
    linhas:  List[SaldoInicialBancoLinha]
    total:   Decimal
