from __future__ import annotations
from pydantic import BaseModel
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime

from app.models.ciclo_nota_model import TipoNotaCorpo, StatusCiclo


class CicloNotaResponse(BaseModel):
    id: int
    condominio_id: int
    tipo_nota: TipoNotaCorpo
    ano: int
    mes: int
    status_ciclo: StatusCiclo
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CorpoNotaResumoInline(BaseModel):
    """Resumo inline do corpo para evitar import circular."""
    id: int
    tipo_nota: TipoNotaCorpo
    numero_os: Optional[str] = None
    mes_referencia: Optional[str] = None
    status: str
    valor_bruto: Optional[float] = None
    valor_liquido: Optional[float] = None
    preenchimento_manual: bool
    nota_fiscal_id: Optional[int] = None
    criado_em: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CicloNotaComCorposResponse(CicloNotaResponse):
    corpos: List[CorpoNotaResumoInline] = []

    model_config = {"from_attributes": True}
