from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


AUVO_STATUS_DESCRICAO = {
    0: "Não Finalizada",
    1: "Finalizada (Auto)",
    2: "Finalizada (Manual)",
    3: "Finalizada",
    4: "Todas",
    5: "Com Pendência",
    6: "Iniciada ou Finalizada",
    7: "Em Execução",
}


class OrdemServicoResponse(BaseModel):
    id: int
    task_id: int
    customer_id: Optional[int] = None
    customer_description: Optional[str] = None
    task_date: Optional[datetime] = None
    task_type_description: Optional[str] = None
    user_to_name: Optional[str] = None
    orientation: Optional[str] = None
    report: Optional[str] = None
    finished: bool = False
    task_status: Optional[int] = None
    task_status_descricao: Optional[str] = None
    check_in_date: Optional[datetime] = None
    check_out_date: Optional[datetime] = None
    duration: Optional[str] = None
    address: Optional[str] = None
    signature_url: Optional[str] = None
    task_url: Optional[str] = None
    sincronizado_em: Optional[datetime] = None
    # Vínculos com CMPort (nullable — OS existe independente de nota/serviço)
    servico_id: Optional[int] = None
    servico_tipo: Optional[str] = None
    nota_fiscal_id: Optional[int] = None
    nota_numero: Optional[str] = None
    condominio_id: Optional[int] = None


class OrdemServicoListResponse(BaseModel):
    items: List[OrdemServicoResponse]
    total: int
    page: int
    page_size: int


class SincronizarRequest(BaseModel):
    date_start: str  # 'YYYY-MM-DD'
    date_end: str    # 'YYYY-MM-DD'


class SincronizarResponse(BaseModel):
    sincronizadas: int
    novas: int
    atualizadas: int
    periodo: str
