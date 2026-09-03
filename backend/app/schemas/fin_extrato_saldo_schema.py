from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class ExtratoSaldoUpsert(BaseModel):
    saldo_final: Decimal
    observacao:  Optional[str] = None


class ExtratoSaldoResponse(BaseModel):
    id:           int
    banco_id:     int
    ano:          int
    mes:          int
    saldo_final:  Decimal
    fonte:        str                    # MANUAL | INTER
    conferido_em: Optional[datetime] = None
    observacao:   Optional[str] = None

    model_config = {"from_attributes": True}


class ExtratoSaldoBancoLinha(BaseModel):
    banco_id:     int
    banco_nome:   str
    empresa:      Optional[str] = None
    saldo_final:  Optional[Decimal] = None
    fonte:        Optional[str] = None
    conferido_em: Optional[datetime] = None
    observacao:   Optional[str] = None


class ExtratoSaldoPorBancoResponse(BaseModel):
    ano:    int
    mes:    int
    linhas: List[ExtratoSaldoBancoLinha]


class ImportarInterItem(BaseModel):
    banco_id:    int
    banco_nome:  str
    status:      str                     # "ok" | "sem credencial" | "erro: ..."
    saldo_final: Optional[Decimal] = None


class ImportarInterResponse(BaseModel):
    importados: int
    mensagem:   str
    detalhes:   List[ImportarInterItem]
