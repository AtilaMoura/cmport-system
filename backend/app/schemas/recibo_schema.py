from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

from app.schemas.cliente_schema import ClienteResponse


class ReciboCreate(BaseModel):
    cliente_id: Optional[int] = None
    condominio_id: Optional[int] = None
    cliente_nome_avulso: Optional[str] = None
    descricao_servico: str
    valor: float
    data_emissao: date
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    status: str = "PENDENTE"
    observacao: Optional[str] = None
    numero_recibo: Optional[str] = None  # gerado automaticamente se omitido


class ReciboUpdate(BaseModel):
    cliente_id: Optional[int] = None
    cliente_nome_avulso: Optional[str] = None
    descricao_servico: Optional[str] = None
    valor: Optional[float] = None
    data_emissao: Optional[date] = None
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    status: Optional[str] = None
    observacao: Optional[str] = None


class ReciboResponse(BaseModel):
    id: int
    numero_recibo: str
    cliente_id: Optional[int] = None
    condominio_id: Optional[int] = None
    cliente_nome_avulso: Optional[str] = None
    cliente: Optional[ClienteResponse] = None
    descricao_servico: str
    valor: float
    data_emissao: date
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    status: str
    observacao: Optional[str] = None
    criado_em: Optional[datetime] = None

    model_config = {"from_attributes": True}
