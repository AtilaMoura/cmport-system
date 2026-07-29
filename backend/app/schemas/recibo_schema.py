from pydantic import BaseModel, Field
from typing import Literal, Optional, List
from datetime import date, datetime

from app.schemas.cliente_schema import ClienteResponse


class ReciboCreate(BaseModel):
    tipo: Literal["ENTRADA", "SAIDA"] = "SAIDA"
    cliente_id: Optional[int] = None
    condominio_id: Optional[int] = None
    cliente_nome_avulso: Optional[str] = None
    configuracao_inter_id: Optional[int] = None
    cnpj_emitente: Optional[str] = None
    cnpj_cliente: Optional[str] = None
    descricao_servico: str
    valor: float
    data_emissao: date
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    status: str = "PENDENTE"
    observacao: Optional[str] = None
    numero_recibo: Optional[str] = None  # gerado automaticamente se omitido
    # ENTRADA: gera ManutencaoAssistencia se marcado (default true, editável).
    # SAIDA: nunca gera serviço — ignorado, ver categoria_id.
    gerar_servico: bool = True
    tipo_servico: Literal["MANUTENCAO", "ASSISTENCIA"] = "ASSISTENCIA"
    # Preenchidos ao selecionar uma OS existente (ver GET /recibos/buscar-os) —
    # usados para reaproveitar/criar o serviço vinculado em vez de sempre criar um novo
    numero_os: Optional[str] = None
    data_servico: Optional[date] = None
    # Número de parcelas (default 1 = à vista). Efeito colateral (serviço/despesa)
    # só a partir da parcela 1 — despesa de SAIDA parcelada é gerada por parcela paga.
    parcelas: int = Field(default=1, ge=1)
    # Valor de cada parcela, na ordem (parcela 1, 2, ...). Opcional — se omitido, o
    # valor total é dividido igualmente (último absorve o arredondamento, como hoje).
    # Se enviado, precisa ter len == parcelas e soma == valor (validado no service).
    valores_parcelas: Optional[List[float]] = None
    # Obrigatório quando tipo=SAIDA (grupo DESPESA ou FORNECEDOR) — validado no service.
    categoria_id: Optional[int] = None


class ReciboUpdate(BaseModel):
    tipo: Optional[Literal["ENTRADA", "SAIDA"]] = None
    cliente_id: Optional[int] = None
    condominio_id: Optional[int] = None
    cliente_nome_avulso: Optional[str] = None
    configuracao_inter_id: Optional[int] = None
    cnpj_emitente: Optional[str] = None
    cnpj_cliente: Optional[str] = None
    descricao_servico: Optional[str] = None
    valor: Optional[float] = None
    data_emissao: Optional[date] = None
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    status: Optional[str] = None
    observacao: Optional[str] = None
    categoria_id: Optional[int] = None


class EnviarEmailReciboRequest(BaseModel):
    destinatarios: Optional[List[str]] = None
    cc_emails: Optional[List[str]] = None


class ReciboResponse(BaseModel):
    id: int
    numero_recibo: str
    tipo: str
    cliente_id: Optional[int] = None
    condominio_id: Optional[int] = None
    cliente_nome_avulso: Optional[str] = None
    cliente: Optional[ClienteResponse] = None
    configuracao_inter_id: Optional[int] = None
    cnpj_emitente: Optional[str] = None
    cnpj_cliente: Optional[str] = None
    descricao_servico: str
    valor: float
    data_emissao: date
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    status: str
    observacao: Optional[str] = None
    criado_em: Optional[datetime] = None
    numero_parcela: int = 1
    total_parcelas: int = 1
    recibo_pai_id: Optional[int] = None
    categoria_id: Optional[int] = None

    model_config = {"from_attributes": True}
