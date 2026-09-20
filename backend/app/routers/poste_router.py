"""
poste_router.py — handlers FastAPI de Poste. Só chama o service.
Prefixo montado em main.py: /api/v1/postes
"""
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database_cameras import SessionLocalCameras
from app.schemas.poste_schema import PosteCreate, PosteUpdate, PosteResponse
from app.services.poste_service import PosteService

router = APIRouter()


def get_db_cameras():
    db = SessionLocalCameras()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=list[PosteResponse])
@router.get("/", response_model=list[PosteResponse])
def listar(
    condominio_id: Optional[int] = None,
    incluir_inativos: bool = False,
    db: Session = Depends(get_db_cameras),
):
    return PosteService.listar(db, condominio_id=condominio_id, incluir_inativos=incluir_inativos)


@router.post("", response_model=PosteResponse, status_code=201)
@router.post("/", response_model=PosteResponse, status_code=201)
def criar(req: PosteCreate, db: Session = Depends(get_db_cameras)):
    return PosteService.criar(db, req)


@router.get("/{poste_id}", response_model=PosteResponse)
def obter(poste_id: int, db: Session = Depends(get_db_cameras)):
    return PosteService.obter(db, poste_id)


@router.patch("/{poste_id}", response_model=PosteResponse)
def editar(poste_id: int, req: PosteUpdate, db: Session = Depends(get_db_cameras)):
    return PosteService.editar(db, poste_id, req)


@router.delete("/{poste_id}", status_code=204)
def desativar(poste_id: int, db: Session = Depends(get_db_cameras)):
    PosteService.desativar(db, poste_id)
