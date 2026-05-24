from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.dependencies import get_current_user
from app.models.ciclo_nota_model import StatusCiclo
from app.schemas.ciclo_nota_schema import CicloNotaResponse, CicloNotaComCorposResponse
from app.services.ciclo_nota_service import CicloNotaService

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=List[CicloNotaComCorposResponse])
def listar_ciclos(
    ano: int,
    mes: int,
    condominio_id: Optional[int] = None,
    status: Optional[StatusCiclo] = None,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    from app.models.corpo_nota_model import CorpoNota
    ciclos = CicloNotaService.list_by_periodo(db, ano, mes, condominio_id, status)
    resultado = []
    for ciclo in ciclos:
        corpos_ativos = (
            db.query(CorpoNota)
            .filter(CorpoNota.ciclo_id == ciclo.id, CorpoNota.deletado_em.is_(None))
            .all()
        )
        if not corpos_ativos:
            continue  # Ciclo sem corpos ativos não aparece na lista
        ciclo.corpos = corpos_ativos
        resultado.append(ciclo)
    return resultado


@router.get("/condominio/{condominio_id}", response_model=List[CicloNotaResponse])
def listar_ciclos_por_condominio(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return CicloNotaService.list_by_condominio(db, condominio_id)


@router.get("/{ciclo_id}", response_model=CicloNotaComCorposResponse)
def get_ciclo(
    ciclo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    from app.models.corpo_nota_model import CorpoNota
    ciclo = CicloNotaService.get_by_id(db, ciclo_id)
    if not ciclo:
        raise HTTPException(status_code=404, detail="Ciclo não encontrado.")
    # Filtra corpos deletados antes de serializar
    corpos_ativos = (
        db.query(CorpoNota)
        .filter(CorpoNota.ciclo_id == ciclo_id, CorpoNota.deletado_em.is_(None))
        .all()
    )
    ciclo.corpos = corpos_ativos
    return ciclo
