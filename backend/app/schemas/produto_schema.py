from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

class ProdutoResponse(BaseModel):
    id: int
    auvo_id: int
    auvo_uuid: Optional[str] = None
    external_id: Optional[str] = None
    nome: str
    descricao: Optional[str] = None
    categoria_id: Optional[int] = None
    valor_unitario: Optional[Decimal] = None
    custo_unitario: Optional[Decimal] = None
    estoque_minimo: Optional[Decimal] = None
    estoque_total: Optional[Decimal] = None
    imagem_url: Optional[str] = None
    ativo: bool
    sincronizado_em: datetime

    model_config = {"from_attributes": True}

class ProdutoListResponse(BaseModel):
    total: int
    items: List[ProdutoResponse]

class SyncResult(BaseModel):
    novos: int
    atualizados: int
