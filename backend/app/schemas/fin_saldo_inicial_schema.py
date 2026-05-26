from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


class SaldoInicialUpsert(BaseModel):
    valor:      Decimal
    observacao: Optional[str] = None


class SaldoInicialResponse(BaseModel):
    id:            int
    ano:           int
    mes:           int
    valor:         Decimal
    observacao:    Optional[str] = None
    criado_em:     datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}
