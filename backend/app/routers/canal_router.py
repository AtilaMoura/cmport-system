"""
canal_router.py — handlers FastAPI do módulo Demandas Dev (canal Atila ↔ CMPort).
Só chama o service. Prefixo montado em main.py: /api/v1/canal
"""
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.dependencies import get_storage_client
from app.core.storage_client import StorageClient
from app.schemas.canal_schema import (
    ItemCreate, ItemUpdate, MudarStatusRequest, ResolverRequest, DescartarRequest,
    PromoverRequest, ArquivarRequest, VistoRequest, ComentarioCreate,
    ItemResponse, ItemListResponse, AnexoResponse, ResumoResponse,
)
from app.services.canal_service import CanalService

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Listagem / resumo ────────────────────────────────────────────────────────

@router.get("", response_model=ItemListResponse)
@router.get("/", response_model=ItemListResponse)
def listar(
    tipo: Optional[str] = Query(None, description="DEMANDA | NOTA"),
    status: Optional[str] = None,
    autor: Optional[str] = Query(None, description="ATILA | ALMIRA | FABIANA"),
    busca: Optional[str] = None,
    incluir_arquivados: bool = False,
    incluir_encerrados: bool = True,
    db: Session = Depends(get_db),
):
    return CanalService.listar(
        db, tipo=tipo, status=status, autor=autor, busca=busca,
        incluir_arquivados=incluir_arquivados, incluir_encerrados=incluir_encerrados,
    )


@router.get("/resumo", response_model=ResumoResponse)
def resumo(db: Session = Depends(get_db)):
    return CanalService.resumo(db)


# ── Anexos (rotas fixas antes de /{item_id}) ─────────────────────────────────

@router.get("/anexos/{anexo_id}")
def baixar_anexo(
    anexo_id: int,
    db: Session = Depends(get_db),
    storage: StorageClient = Depends(get_storage_client),
):
    conteudo, filename, content_type = CanalService.baixar_anexo(db, storage, anexo_id)
    return StreamingResponse(
        BytesIO(conteudo),
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.delete("/anexos/{anexo_id}", status_code=204)
def remover_anexo(anexo_id: int, db: Session = Depends(get_db)):
    CanalService.remover_anexo(db, anexo_id)


# ── Item ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=ItemResponse, status_code=201)
@router.post("/", response_model=ItemResponse, status_code=201)
def criar(req: ItemCreate, db: Session = Depends(get_db)):
    return CanalService.criar(db, req)


@router.get("/{item_id}", response_model=ItemResponse)
def obter(item_id: int, db: Session = Depends(get_db)):
    return CanalService.obter(db, item_id)


@router.patch("/{item_id}", response_model=ItemResponse)
def editar(item_id: int, req: ItemUpdate, db: Session = Depends(get_db)):
    return CanalService.editar(db, item_id, req)


@router.delete("/{item_id}", status_code=204)
def deletar(item_id: int, db: Session = Depends(get_db)):
    CanalService.deletar(db, item_id)


@router.post("/{item_id}/status", response_model=ItemResponse)
def mudar_status(item_id: int, req: MudarStatusRequest, db: Session = Depends(get_db)):
    return CanalService.mudar_status(db, item_id, req)


@router.post("/{item_id}/resolver", response_model=ItemResponse)
def resolver(item_id: int, req: ResolverRequest, db: Session = Depends(get_db)):
    return CanalService.resolver(db, item_id, req)


@router.post("/{item_id}/descartar", response_model=ItemResponse)
def descartar(item_id: int, req: DescartarRequest, db: Session = Depends(get_db)):
    return CanalService.descartar(db, item_id, req)


@router.post("/{item_id}/promover", response_model=ItemResponse)
def promover(item_id: int, req: PromoverRequest, db: Session = Depends(get_db)):
    return CanalService.promover(db, item_id, req)


@router.post("/{item_id}/arquivar", response_model=ItemResponse)
def arquivar(item_id: int, req: ArquivarRequest, db: Session = Depends(get_db)):
    return CanalService.arquivar(db, item_id, req)


@router.post("/{item_id}/visto", response_model=ItemResponse)
def marcar_visto(item_id: int, req: VistoRequest, db: Session = Depends(get_db)):
    return CanalService.marcar_visto(db, item_id, req.lado)


@router.post("/{item_id}/comentarios", response_model=ItemResponse, status_code=201)
def comentar(item_id: int, req: ComentarioCreate, db: Session = Depends(get_db)):
    return CanalService.comentar(db, item_id, req)


@router.post("/{item_id}/anexos", response_model=AnexoResponse, status_code=201)
async def upload_anexo(
    item_id: int,
    arquivo: UploadFile = File(...),
    enviado_por: str = Form(...),
    comentario_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    storage: StorageClient = Depends(get_storage_client),
):
    conteudo = await arquivo.read()
    return CanalService.upload_anexo(
        db, item_id, storage,
        nome_arquivo=arquivo.filename or "arquivo",
        conteudo=conteudo,
        content_type=arquivo.content_type,
        enviado_por=enviado_por,
        comentario_id=comentario_id,
    )
