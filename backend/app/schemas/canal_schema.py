"""
canal_schema.py — Pydantic request/response do módulo Demandas (canal Atila ↔ CMPort).
"""
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel


AutorLiteral = Literal["ATILA", "ALMIRA", "FABIANA"]
TipoLiteral = Literal["DEMANDA", "NOTA"]
StatusLiteral = Literal[
    "ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CMPORT", "AGUARDANDO_ATILA",
    "RESOLVIDA", "DESCARTADA",
]
PrioridadeLiteral = Literal["BAIXA", "NORMAL", "ALTA", "URGENTE"]
LadoLiteral = Literal["ATILA", "CMPORT"]


# ── Requests ─────────────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    tipo: TipoLiteral = "NOTA"
    autor: AutorLiteral
    titulo: Optional[str] = None            # obrigatório quando tipo=DEMANDA
    descricao: Optional[str] = None
    prioridade: PrioridadeLiteral = "NORMAL"


class ItemUpdate(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    prioridade: Optional[PrioridadeLiteral] = None


class MudarStatusRequest(BaseModel):
    autor: AutorLiteral
    status: StatusLiteral


class ResolverRequest(BaseModel):
    autor: AutorLiteral
    resolucao_texto: str
    commit_ref: Optional[str] = None


class DescartarRequest(BaseModel):
    autor: AutorLiteral
    motivo_descarte: str


class PromoverRequest(BaseModel):
    """NOTA → DEMANDA."""
    autor: AutorLiteral
    titulo: str
    prioridade: PrioridadeLiteral = "NORMAL"


class ArquivarRequest(BaseModel):
    autor: AutorLiteral
    arquivado: bool = True


class VistoRequest(BaseModel):
    lado: LadoLiteral


class ComentarioCreate(BaseModel):
    autor: AutorLiteral
    texto: Optional[str] = None
    reacao: Optional[str] = None


# ── Responses ────────────────────────────────────────────────────────────────

class AnexoResponse(BaseModel):
    id: int
    item_id: int
    comentario_id: Optional[int] = None
    nome_arquivo: str
    content_type: Optional[str] = None
    tamanho: Optional[int] = None
    enviado_por: AutorLiteral
    enviado_em: datetime

    model_config = {"from_attributes": True}


class ComentarioResponse(BaseModel):
    id: int
    item_id: int
    autor: AutorLiteral
    texto: Optional[str] = None
    reacao: Optional[str] = None
    criado_em: datetime
    anexos: List[AnexoResponse] = []

    model_config = {"from_attributes": True}


class ItemResponse(BaseModel):
    id: int
    codigo: Optional[str] = None
    tipo: TipoLiteral
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    autor: AutorLiteral
    status: StatusLiteral
    prioridade: PrioridadeLiteral
    resolucao_texto: Optional[str] = None
    commit_ref: Optional[str] = None
    motivo_descarte: Optional[str] = None
    data_abertura: datetime
    data_resolucao: Optional[datetime] = None
    visto_atila: bool
    visto_cmport: bool
    arquivado: bool
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None
    anexos: List[AnexoResponse] = []
    comentarios: List[ComentarioResponse] = []
    formularios: List["FormularioResponse"] = []

    model_config = {"from_attributes": True}


class ItemListItem(BaseModel):
    """Linha da listagem — mais leve, sem thread completa."""
    id: int
    codigo: Optional[str] = None
    tipo: TipoLiteral
    titulo: Optional[str] = None
    descricao_preview: Optional[str] = None
    autor: AutorLiteral
    status: StatusLiteral
    prioridade: PrioridadeLiteral
    data_abertura: datetime
    data_resolucao: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None
    ultima_atividade: datetime
    visto_atila: bool
    visto_cmport: bool
    arquivado: bool
    qtd_anexos: int = 0
    qtd_comentarios: int = 0


class ItemListResponse(BaseModel):
    itens: List[ItemListItem]
    total: int


class ResumoResponse(BaseModel):
    """Contadores pro badge do menu."""
    novidades_atila: int          # itens com visto_atila=False
    novidades_cmport: int         # itens com visto_cmport=False
    demandas_abertas: int         # DEMANDA não resolvida/descartada/arquivada
    aguardando_atila: int
    aguardando_cmport: int


class RelatorioItem(BaseModel):
    codigo: Optional[str] = None
    tipo: TipoLiteral
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    autor: AutorLiteral
    status: StatusLiteral
    prioridade: PrioridadeLiteral
    data_abertura: datetime
    data_resolucao: Optional[datetime] = None
    resolucao_texto: Optional[str] = None
    commit_ref: Optional[str] = None
    motivo_descarte: Optional[str] = None


class RelatorioResponse(BaseModel):
    periodo_inicio: Optional[str] = None
    periodo_fim: Optional[str] = None
    total_resolvidas: int
    total_descartadas: int
    itens: List[RelatorioItem]


# ── Formulário de pendência ──────────────────────────────────────────────────

TipoPergunta = Literal[
    "texto_curto", "texto_longo", "numero", "valor", "data",
    "sim_nao", "escolha_unica", "escolha_multipla",
]
FormStatusLiteral = Literal["RASCUNHO", "ENVIADO", "EM_PREENCHIMENTO", "RESPONDIDO"]


class Pergunta(BaseModel):
    id: str                              # id estável (p1, p2, ...) — gerado no front
    enunciado: str
    tipo: TipoPergunta = "texto_curto"
    obrigatoria: bool = False
    ajuda: Optional[str] = None
    opcoes: List[str] = []               # só escolha_unica / escolha_multipla
    sugestao: Optional[Any] = None       # resposta pré-preenchida (o "default")


class FormularioCreate(BaseModel):
    titulo: str
    contexto: Optional[str] = None
    perguntas: List[Pergunta] = []


class FormularioUpdate(BaseModel):
    titulo: Optional[str] = None
    contexto: Optional[str] = None
    perguntas: Optional[List[Pergunta]] = None


class ResponderFormularioRequest(BaseModel):
    autor: AutorLiteral
    respostas: Dict[str, Any]            # pergunta_id -> valor
    finalizar: bool = False             # false = salva parcial; true = valida obrigatórias e encerra


class FormularioResponse(BaseModel):
    id: int
    item_id: int
    titulo: str
    contexto: Optional[str] = None
    perguntas: List[Pergunta] = []
    respostas: Dict[str, Any] = {}
    status: FormStatusLiteral
    preenchido_por: Optional[AutorLiteral] = None
    respondido_em: Optional[datetime] = None
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None


# ItemResponse referencia FormularioResponse por forward ref (definido depois)
ItemResponse.model_rebuild()
