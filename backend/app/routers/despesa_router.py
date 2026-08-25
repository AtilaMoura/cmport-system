from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import SessionLocal
from app.services.despesa_service import DespesaService
from app.schemas.despesa_schema import DespesaCreate, DespesaResponse, MarcarPagoRequest, EditarParcelaRequest, DespesaUpdate

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=List[DespesaResponse])
@router.get("/", response_model=List[DespesaResponse])
def listar(
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    cnpj: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return DespesaService.listar(db, mes=mes, ano=ano, cnpj=cnpj, status=status)


@router.post("", response_model=DespesaResponse, status_code=201)
@router.post("/", response_model=DespesaResponse, status_code=201)
def criar(req: DespesaCreate, db: Session = Depends(get_db)):
    try:
        return DespesaService.criar(db, req)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/{id}", response_model=DespesaResponse)
def buscar(id: int, db: Session = Depends(get_db)):
    try:
        return DespesaService.buscar(db, id)
    except Exception as e:
        raise HTTPException(404, str(e))


@router.put("/{id}", response_model=DespesaResponse)
def editar(id: int, req: DespesaUpdate, db: Session = Depends(get_db)):
    try:
        return DespesaService.editar(db, id, req)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.patch("/parcelas/{parcela_id}/pagar", response_model=DespesaResponse)
def marcar_pago(parcela_id: int, req: MarcarPagoRequest, db: Session = Depends(get_db)):
    try:
        return DespesaService.marcar_pago(db, parcela_id, req)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.put("/parcelas/{parcela_id}", response_model=DespesaResponse)
def editar_parcela(parcela_id: int, req: EditarParcelaRequest, db: Session = Depends(get_db)):
    try:
        return DespesaService.editar_parcela(db, parcela_id, req)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.delete("/{id}", status_code=204)
def deletar(id: int, db: Session = Depends(get_db)):
    try:
        DespesaService.deletar(db, id)
    except Exception as e:
        raise HTTPException(400, str(e))
