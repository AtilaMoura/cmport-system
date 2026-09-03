from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import SessionLocal
from app.services.fluxo_financeiro_service import FluxoFinanceiroService
from app.services.fin_dashboard_service import FinDashboardService
from app.services.fin_conciliacao_service import FinConciliacaoService
from app.services.fin_export_service import FinExportService
from app.schemas.fluxo_financeiro_schema import (
    FluxoFinanceiroResponse, AlertaDuplicata, DispensarDuplicataRequest, PendenciasResponse,
    AlertaNotaSemBoleto, DispensarNotaSemBoletoRequest,
    AlertaNotaSemServico, DispensarNotaSemServicoRequest,
    AlertaParcelaFaltando, DispensarParcelaFaltandoRequest,
)
from app.schemas.fin_dashboard_schema import DashboardPorBancoResponse
from app.schemas.fin_saldo_inicial_schema import (
    SaldoInicialUpsert, SaldoInicialResponse, SaldoInicialPorBancoResponse,
)
from app.schemas.fin_extrato_saldo_schema import (
    ExtratoSaldoUpsert, ExtratoSaldoResponse, ExtratoSaldoPorBancoResponse, ImportarInterResponse,
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
    ano: Optional[int] = Query(None),
    mes: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.detectar_notas_sem_boleto(db, dias_atras=dias, ano=ano, mes=mes)


@router.post("/notas-sem-boleto/dispensar", status_code=204)
def dispensar_nota_sem_boleto(
    request: DispensarNotaSemBoletoRequest,
    db: Session = Depends(get_db),
):
    FluxoFinanceiroService.dispensar_nota_sem_boleto(db, request.nota_id)


@router.get("/notas-sem-servico", response_model=List[AlertaNotaSemServico])
def notas_sem_servico(
    dias: Optional[int] = Query(None, description="Limita aos ultimos N dias (por data_vencimento). Omitir varre todo o historico."),
    ano: Optional[int] = Query(None),
    mes: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.detectar_notas_sem_servico(db, dias_atras=dias, ano=ano, mes=mes)


@router.post("/notas-sem-servico/dispensar", status_code=204)
def dispensar_nota_sem_servico(
    request: DispensarNotaSemServicoRequest,
    db: Session = Depends(get_db),
):
    FluxoFinanceiroService.dispensar_nota_sem_servico(db, request.nota_id)


@router.get("/parcelas-faltando", response_model=List[AlertaParcelaFaltando])
def parcelas_faltando(
    dias: Optional[int] = Query(None, description="Limita aos ultimos N dias (por data de vencimento esperada). Omitir varre todo o historico."),
    ano: Optional[int] = Query(None),
    mes: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return FluxoFinanceiroService.detectar_parcelas_faltando(db, dias_atras=dias, ano=ano, mes=mes)


@router.post("/parcelas-faltando/dispensar", status_code=204)
def dispensar_parcela_faltando(
    request: DispensarParcelaFaltandoRequest,
    db: Session = Depends(get_db),
):
    FluxoFinanceiroService.dispensar_parcela_faltando(db, request.nota_id, request.numero_parcela)


# ── Dashboard "por banco" + conciliação bancária ─────────────────────────────

@router.get("/dashboard/por-banco", response_model=DashboardPorBancoResponse)
def dashboard_por_banco(
    ano: int = Query(..., ge=2020, le=2100),
    mes: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    """Demonstrativo em cascata de cada conta bancária: saldo inicial → entradas
    (boleto/recibo/avulso) → transferências → saídas (fornecedor/despesa/
    funcionário/tarifa) → saldo calculado × saldo do extrato × diferença."""
    return FinDashboardService.por_banco(db, ano=ano, mes=mes)


@router.get("/saldo-inicial-banco/{ano}/{mes}", response_model=SaldoInicialPorBancoResponse)
def saldo_inicial_por_banco(ano: int, mes: int, db: Session = Depends(get_db)):
    return FinConciliacaoService.saldo_inicial_por_banco(db, ano, mes)


@router.put("/saldo-inicial-banco/{ano}/{mes}/{banco_id}", response_model=SaldoInicialResponse)
def upsert_saldo_inicial_banco(
    ano: int, mes: int, banco_id: int, req: SaldoInicialUpsert, db: Session = Depends(get_db),
):
    try:
        return FinConciliacaoService.upsert_saldo_inicial_banco(db, ano, mes, banco_id, req)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


@router.get("/extrato-saldo/{ano}/{mes}", response_model=ExtratoSaldoPorBancoResponse)
def extrato_saldo_por_banco(ano: int, mes: int, db: Session = Depends(get_db)):
    return FinConciliacaoService.extrato_saldo_por_banco(db, ano, mes)


@router.put("/extrato-saldo/{ano}/{mes}/{banco_id}", response_model=ExtratoSaldoResponse)
def upsert_extrato_saldo(
    ano: int, mes: int, banco_id: int, req: ExtratoSaldoUpsert, db: Session = Depends(get_db),
):
    try:
        return FinConciliacaoService.upsert_extrato_saldo(db, ano, mes, banco_id, req)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


@router.post("/extrato-saldo/{ano}/{mes}/importar-inter", response_model=ImportarInterResponse)
def importar_extrato_saldo_inter(ano: int, mes: int, db: Session = Depends(get_db)):
    try:
        return FinConciliacaoService.importar_inter(db, ano, mes)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


@router.get("/exportar-fluxo")
def exportar_fluxo_xlsx(
    ano_inicio: int = Query(..., ge=2020, le=2100),
    mes_inicio: int = Query(..., ge=1, le=12),
    ano_fim: Optional[int] = Query(None, ge=2020, le=2100),
    mes_fim: Optional[int] = Query(None, ge=1, le=12),
    cnpj: Optional[str] = Query(None, description="CMPORT (22761557000188) ou TEC (65756913000188). Omitir = ambos."),
    incluir_pendentes: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Gera o .xlsx completo do Fluxo Financeiro (Resumo / Entradas / Saídas /
    Transferências / Categoria x Mês / Pendências), regime de caixa, no filtro
    escolhido (mês único ou intervalo, um CNPJ ou os dois)."""
    a_fim = ano_fim or ano_inicio
    m_fim = mes_fim or mes_inicio
    if (a_fim, m_fim) < (ano_inicio, mes_inicio):
        raise HTTPException(400, "Fim do período antes do início.")
    try:
        conteudo = FinExportService.gerar_xlsx(
            db, ano_inicio, mes_inicio, a_fim, m_fim, cnpj=cnpj, incluir_pendentes=incluir_pendentes,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))
    empresa = {"22761557000188": "cmport", "65756913000188": "tec"}.get("".join(filter(str.isdigit, cnpj or "")), "geral")
    nome = f"fluxo_{empresa}_{ano_inicio}{mes_inicio:02d}-{a_fim}{m_fim:02d}_{datetime.now():%Y%m%d_%H%M}.xlsx"
    return Response(
        content=conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={nome}"},
    )
