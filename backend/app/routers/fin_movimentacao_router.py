from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.core.database import SessionLocal
from app.services.fin_movimentacao_service import FinMovimentacaoService
from app.schemas.fin_movimentacao_schema import (
    MovimentacaoCreate, MovimentacaoUpdate, MovimentacaoResponse,
    DashboardFinanceiroResponse, SincronizarInterResponse,
)
from app.schemas.fin_saldo_inicial_schema import SaldoInicialUpsert, SaldoInicialResponse

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/movimentacoes", response_model=List[MovimentacaoResponse])
def listar(
    mes:          Optional[int] = None,
    ano:          Optional[int] = None,
    tipo:         Optional[str] = None,
    grupo:        Optional[str] = None,
    categoria_id: Optional[int] = None,
    origem:       Optional[str] = None,
    status:       Optional[str] = None,
    db: Session = Depends(get_db),
):
    return FinMovimentacaoService.listar(
        db, mes=mes, ano=ano, tipo=tipo, grupo=grupo,
        categoria_id=categoria_id, origem=origem, status=status,
    )


@router.post("/movimentacoes", response_model=MovimentacaoResponse, status_code=201)
def criar(req: MovimentacaoCreate, db: Session = Depends(get_db)):
    try:
        return FinMovimentacaoService.criar(db, req)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.put("/movimentacoes/{id}", response_model=MovimentacaoResponse)
def atualizar(id: int, req: MovimentacaoUpdate, db: Session = Depends(get_db)):
    try:
        return FinMovimentacaoService.atualizar(db, id, req)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.delete("/movimentacoes/{id}", status_code=204)
def deletar(id: int, db: Session = Depends(get_db)):
    try:
        FinMovimentacaoService.deletar(db, id)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/movimentacoes/{id}/validar", response_model=MovimentacaoResponse)
def validar(id: int, db: Session = Depends(get_db)):
    try:
        return FinMovimentacaoService.validar(db, id)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/dashboard", response_model=DashboardFinanceiroResponse)
def dashboard(
    mes: int = Query(..., ge=1, le=12),
    ano: int = Query(..., ge=2020, le=2100),
    db: Session = Depends(get_db),
):
    return FinMovimentacaoService.dashboard(db, mes, ano)


@router.post("/sincronizar-inter", response_model=SincronizarInterResponse)
def sincronizar_inter(
    data_inicio: str = Query(..., description="YYYY-MM-DD"),
    data_fim:    str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    try:
        return FinMovimentacaoService.sincronizar_inter(db, data_inicio, data_fim)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/saldo-inicial/{ano}/{mes}", response_model=SaldoInicialResponse)
def get_saldo_inicial(ano: int, mes: int, db: Session = Depends(get_db)):
    return FinMovimentacaoService.get_saldo_inicial(db, ano, mes)


@router.put("/saldo-inicial/{ano}/{mes}", response_model=SaldoInicialResponse)
def upsert_saldo_inicial(ano: int, mes: int, req: SaldoInicialUpsert, db: Session = Depends(get_db)):
    try:
        return FinMovimentacaoService.upsert_saldo_inicial(db, ano, mes, req)
    except Exception as e:
        raise HTTPException(400, str(e))
