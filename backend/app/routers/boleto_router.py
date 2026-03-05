from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List

from app.core.database import SessionLocal
from app.services.boleto_service import BoletoService
from app.schemas.boleto_schema import BoletoResponse, GerarBoletosRequest, GerarBoletosResponse, SincronizarResponse

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/gerar", response_model=GerarBoletosResponse)
def gerar_boletos(request: GerarBoletosRequest, db: Session = Depends(get_db)):
    """Gera boleto(s) para uma ou mais notas fiscais."""
    return BoletoService.gerar_boletos(db, request.nota_ids)


@router.get("/", response_model=List[BoletoResponse])
def listar_boletos(db: Session = Depends(get_db)):
    """Lista todos os boletos."""
    return BoletoService.listar_boletos(db)


@router.get("/nota/{nota_fiscal_id}", response_model=BoletoResponse)
def get_boleto_por_nota(nota_fiscal_id: int, db: Session = Depends(get_db)):
    """Retorna o boleto vinculado a uma nota fiscal."""
    boleto = BoletoService.get_boleto_por_nota(db, nota_fiscal_id)
    if not boleto:
        raise HTTPException(status_code=404, detail="Nenhum boleto encontrado para esta nota.")
    return boleto


@router.post("/{codigo}/cancelar", response_model=BoletoResponse)
def cancelar_boleto(codigo: str, db: Session = Depends(get_db)):
    """Cancela um boleto no Inter e atualiza o status no banco."""
    try:
        return BoletoService.cancelar_boleto(db, codigo)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{codigo}/pdf")
def baixar_pdf(codigo: str, db: Session = Depends(get_db)):
    """Faz download do PDF do boleto."""
    try:
        pdf_bytes = BoletoService.baixar_pdf(db, codigo)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=boleto_{codigo}.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sincronizar", response_model=SincronizarResponse)
def sincronizar_status(db: Session = Depends(get_db)):
    """Consulta o Inter e atualiza o status de todos os boletos em aberto."""
    return BoletoService.sincronizar_status(db)
