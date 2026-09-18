from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


class RendimentoManualUpsert(BaseModel):
    valor:      Decimal
    observacao: Optional[str] = None


class RendimentoManualResponse(BaseModel):
    id:            int
    ano:           int
    mes:           int
    banco_id:      int
    valor:         Decimal
    observacao:    Optional[str] = None
    criado_em:     datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}
