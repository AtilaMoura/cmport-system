from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.core.dependencies import get_db
from app.schemas.produto_schema import ProdutoResponse, ProdutoListResponse, SyncResult
from app.services.produto_service import ProdutoService

router = APIRouter()

@router.post("/sync", response_model=SyncResult)
def sync_produtos(db: Session = Depends(get_db)):
    """Dispara a sincronização manual dos produtos com o Auvo."""
    try:
        resultado = ProdutoService.sincronizar(db)
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar produtos: {str(e)}")

@router.get("", response_model=ProdutoListResponse)
def list_produtos(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    ativo: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100)
):
    """Lista produtos locais sincronizados do Auvo."""
    items, total = ProdutoService.listar(db, search=search, ativo=ativo, page=page, page_size=page_size)
    return {"total": total, "items": items}

@router.get("/{auvo_id}", response_model=ProdutoResponse)
def get_produto(auvo_id: int, db: Session = Depends(get_db)):
    """Busca um produto pelo ID do Auvo."""
    db_product = ProdutoService.get_by_auvo_id(db, auvo_id)
    if not db_product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return db_product
