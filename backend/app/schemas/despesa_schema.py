from pydantic import BaseModel, model_validator
from typing import List, Optional
from datetime import date, datetime
from decimal import Decimal


class ParcelaManualCreate(BaseModel):
    numero_parcela: int
    valor: Decimal
    data_vencimento: date


class DespesaCreate(BaseModel):
    descricao: str
    categoria_id: int
    cnpj: str
    banco_previsto_id: Optional[int] = None
    tipo_pagamento: str  # UNICO | PARCELADO | RECORRENTE
    observacao: Optional[str] = None

    # UNICO
    valor_total: Optional[Decimal] = None
    data_primeira_parcela: Optional[date] = None

    # PARCELADO -- lista explicita de parcelas (valor+data por parcela)
    parcelas: Optional[List[ParcelaManualCreate]] = None

    # RECORRENTE
    valor_recorrente: Optional[Decimal] = None
    dia_vencimento: Optional[int] = None
    data_inicio: Optional[date] = None

    @model_validator(mode="after")
    def validar_por_tipo(self):
        if self.tipo_pagamento == "UNICO":
            if self.valor_total is None or self.data_primeira_parcela is None:
                raise ValueError("pagamento único precisa de valor_total e data_primeira_parcela")
        elif self.tipo_pagamento == "PARCELADO":
            if not self.parcelas or len(self.parcelas) < 2:
                raise ValueError("pagamento parcelado precisa de pelo menos 2 parcelas em 'parcelas'")
        elif self.tipo_pagamento == "RECORRENTE":
            if self.valor_recorrente is None or self.dia_vencimento is None or self.data_inicio is None:
                raise ValueError("pagamento recorrente precisa de valor_recorrente, dia_vencimento e data_inicio")
            if not (1 <= self.dia_vencimento <= 28):
                raise ValueError("dia_vencimento deve ser entre 1 e 28")
        else:
            raise ValueError("tipo_pagamento deve ser UNICO, PARCELADO ou RECORRENTE")
        return self


class DespesaParcelaResponse(BaseModel):
    id: int
    numero_parcela: int
    total_parcelas: int
    valor: Decimal
    data_vencimento: date
    status: str
    data_pagamento: Optional[date] = None
    banco_id: Optional[int] = None
    forma_pagamento: Optional[str] = None
    movimentacao_id: Optional[int] = None

    model_config = {"from_attributes": True}


class DespesaResponse(BaseModel):
    id: int
    descricao: str
    categoria_id: Optional[int] = None
    cnpj: str
    banco_previsto_id: Optional[int] = None
    tipo_pagamento: str
    valor_total: Decimal
    total_parcelas: int
    dia_vencimento: Optional[int] = None
    ativo: bool
    observacao: Optional[str] = None
    criado_em: datetime
    parcelas: List[DespesaParcelaResponse] = []

    model_config = {"from_attributes": True}


class MarcarPagoRequest(BaseModel):
    data_pagamento: date
    banco_id: int
    forma_pagamento: Optional[str] = "PIX"


class EditarParcelaRequest(BaseModel):
    valor: Optional[Decimal] = None
    data_vencimento: Optional[date] = None


class DespesaUpdate(BaseModel):
    descricao: Optional[str] = None
    categoria_id: Optional[int] = None
    banco_previsto_id: Optional[int] = None
    observacao: Optional[str] = None
