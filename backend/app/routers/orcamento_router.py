from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List

from app.core.dependencies import get_db
from app.schemas.orcamento_schema import OrcamentoResponse, OrcamentoFullResponse, OrcamentoListResponse, SyncResult
from app.services.orcamento_service import OrcamentoService
from app.repositories.orcamento_repository import OrcamentoRepository

router = APIRouter()

@router.post("/sync", response_model=SyncResult)
def sync_orcamentos(
    date_start: str = Query(..., description="Formato YYYY-MM-DD"),
    date_end: str = Query(..., description="Formato YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """Dispara a sincronização de orçamentos por período."""
    try:
        resultado = OrcamentoService.sincronizar(db, date_start, date_end)
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar orçamentos: {str(e)}")

@router.get("", response_model=OrcamentoListResponse)
def list_orcamentos(
    db: Session = Depends(get_db),
    condominio_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100)
):
    """Lista orçamentos locais sincronizados do Auvo."""
    items, total = OrcamentoService.listar(db, condominio_id=condominio_id, search=search, page=page, page_size=page_size)
    return {"total": total, "items": items}

@router.get("/candidatos/{servico_id}", response_model=List[OrcamentoResponse])
def get_orcamentos_candidatos(servico_id: int, db: Session = Depends(get_db)):
    """Retorna orçamentos do condomínio nos 90 dias antes da data do serviço (para termo de garantia)."""
    return OrcamentoService.listar_candidatos_para_servico(db, servico_id)


@router.get("/por-servico/{servico_id}", response_model=Optional[OrcamentoFullResponse])
def get_orcamento_por_servico(servico_id: int, db: Session = Depends(get_db)):
    """Retorna o orçamento vinculado ao serviço (orcamento_id manual primeiro, depois task_id)."""
    return OrcamentoService.get_por_servico(db, servico_id)


@router.get("/{orcamento_id}/servicos", response_model=List)
def get_servicos_do_orcamento(orcamento_id: int, db: Session = Depends(get_db)):
    """Lista serviços manualmente vinculados a este orçamento."""
    from app.services.servico_service import ServicoService
    from app.schemas.servico_schema import ServicoResponse
    servicos = ServicoService.list_by_orcamento(db, orcamento_id)
    return [ServicoResponse.model_validate(s) for s in servicos]


@router.get("/condominio/{condo_id}", response_model=List[OrcamentoResponse])
def list_orcamentos_by_condo(condo_id: int, db: Session = Depends(get_db)):
    """Lista últimos 10 orçamentos de um condomínio específico."""
    return OrcamentoService.listar_por_condominio(db, condo_id)

@router.get("/{auvo_public_id}", response_model=OrcamentoFullResponse)
def get_orcamento(auvo_public_id: int, db: Session = Depends(get_db)):
    """Busca detalhe completo de um orçamento pelo publicId do Auvo."""
    db_orcamento_brief = OrcamentoRepository.get_by_auvo_id(db, auvo_public_id)
    if not db_orcamento_brief:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    
    # Busca objeto completo com relações carregadas
    db_orcamento = OrcamentoService.detalhe(db, db_orcamento_brief.id)
    return db_orcamento
