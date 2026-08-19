from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import SessionLocal
from app.services.fluxo_financeiro_service import FluxoFinanceiroService
from app.schemas.fluxo_financeiro_schema import (
    FluxoFinanceiroResponse, AlertaDuplicata, DispensarDuplicataRequest, PendenciasResponse,
    AlertaNotaSemBoleto, DispensarNotaSemBoletoRequest,
    AlertaNotaSemServico, DispensarNotaSemServicoRequest,
    AlertaParcelaFaltando, DispensarParcelaFaltandoRequest,
)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/fluxo-mensal", response_model=FluxoFinanceiroResponse)
def fluxo_mensal(
    ano: int,
    mes: int,
    cnpj: Optional[str] = Query(None, description="CNPJ do emitente (com ou sem mascara). Omitir retorna todos os CNPJs."),
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.fluxo_mensal(db, ano=ano, mes=mes, cnpj=cnpj)


@router.get("/pendencias", response_model=PendenciasResponse)
def pendencias(
    ano: int,
    mes: int,
    cnpj: Optional[str] = Query(None, description="CNPJ do emitente (com ou sem mascara). Omitir retorna os dois."),
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.pendencias_ate_mes(db, ano=ano, mes=mes, cnpj=cnpj)


@router.get("/fluxo-mensal/alertas", response_model=List[AlertaDuplicata])
def fluxo_mensal_alertas(
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.detectar_duplicatas(db, ano=ano, mes=mes)


@router.post("/fluxo-mensal/alertas/dispensar", status_code=204)
def dispensar_alerta_duplicata(
    request: DispensarDuplicataRequest,
    db: Session = Depends(get_db),
):
    FluxoFinanceiroService.dispensar_duplicata(db, request.nota_id_1, request.nota_id_2)


@router.get("/notas-sem-boleto", response_model=List[AlertaNotaSemBoleto])
def notas_sem_boleto(
    dias: Optional[int] = Query(None, description="Limita aos ultimos N dias (por criado_em). Omitir varre todo o historico."),
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.detectar_notas_sem_boleto(db, dias_atras=dias)


@router.post("/notas-sem-boleto/dispensar", status_code=204)
def dispensar_nota_sem_boleto(
    request: DispensarNotaSemBoletoRequest,
    db: Session = Depends(get_db),
):
    FluxoFinanceiroService.dispensar_nota_sem_boleto(db, request.nota_id)


@router.get("/notas-sem-servico", response_model=List[AlertaNotaSemServico])
def notas_sem_servico(
    dias: Optional[int] = Query(None, description="Limita aos ultimos N dias (por data_vencimento). Omitir varre todo o historico."),
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.detectar_notas_sem_servico(db, dias_atras=dias)


@router.post("/notas-sem-servico/dispensar", status_code=204)
def dispensar_nota_sem_servico(
    request: DispensarNotaSemServicoRequest,
    db: Session = Depends(get_db),
):
    FluxoFinanceiroService.dispensar_nota_sem_servico(db, request.nota_id)


@router.get("/parcelas-faltando", response_model=List[AlertaParcelaFaltando])
def parcelas_faltando(
    dias: Optional[int] = Query(None, description="Limita aos ultimos N dias (por data de vencimento esperada). Omitir varre todo o historico."),
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.detectar_parcelas_faltando(db, dias_atras=dias)


@router.post("/parcelas-faltando/dispensar", status_code=204)
def dispensar_parcela_faltando(
    request: DispensarParcelaFaltandoRequest,
    db: Session = Depends(get_db),
):
    FluxoFinanceiroService.dispensar_parcela_faltando(db, request.nota_id, request.numero_parcela)
