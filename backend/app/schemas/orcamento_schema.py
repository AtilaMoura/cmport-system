from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from app.models.orcamento_model import TipoItemOrcamento

class OrcamentoItemResponse(BaseModel):
    id: int
    tipo: TipoItemOrcamento
    produto_id: Optional[int] = None
    auvo_product_id: Optional[int] = None
    auvo_service_id: Optional[str] = None
    nome: Optional[str] = None
    descricao: Optional[str] = None
    quantidade: Decimal
    valor_unitario: Decimal
    desconto_tipo: Optional[str] = None
    desconto_valor: Decimal
    valor_total: Decimal

    model_config = {"from_attributes": True}

class OrcamentoTaskIdResponse(BaseModel):
    task_id: int
    
    model_config = {"from_attributes": True}

class OrcamentoResponse(BaseModel):
    id: int
    auvo_public_id: int
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    condominio_id: Optional[int] = None
    external_code: Optional[str] = None
    register_date: Optional[date] = None
    request_date: Optional[date] = None
    expire_date: Optional[date] = None
    last_update_date: Optional[date] = None
    observations: Optional[str] = None
    internal_note: Optional[str] = None
    public_link: Optional[str] = None
    current_stage_description: Optional[str] = None
    is_cancelled: bool
    discount_value: Decimal
    total_products: Decimal
    total_services: Decimal
    total_additional_costs: Decimal
    gross_total_value: Decimal
    net_total_value: Decimal
    sincronizado_em: datetime

    model_config = {"from_attributes": True}

class OrcamentoFullResponse(OrcamentoResponse):
    itens: List[OrcamentoItemResponse] = []
    task_ids: List[OrcamentoTaskIdResponse] = []

    model_config = {"from_attributes": True}

class OrcamentoListResponse(BaseModel):
    total: int
    items: List[OrcamentoResponse]
