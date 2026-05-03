from fastapi import APIRouter, Body, Depends, HTTPException, Query, Form, File, UploadFile
from fastapi.responses import Response, HTMLResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import json

from app.core.database import SessionLocal
from app.core.dependencies import get_storage_client
from app.core.storage_client import StorageClient
from app.services.boleto_service import BoletoService
from app.schemas.boleto_schema import (
    BoletoResponse, GerarBoletosRequest, GerarBoletosResponse,
    SincronizarResponse, SincronizarInterResponse, BoletoStats,
    RegistrarPagamentoRequest, CriarBoletoManualRequest, GerarParcelasFaltantesResponse,
    GerarParcelasFaltantesRequest, VincularNotaRequest, NotaSemBoletoResponse,
    ConfigImpostosResponse,
)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/config-impostos/{nota_id}", response_model=ConfigImpostosResponse)
def get_config_impostos(nota_id: int, db: Session = Depends(get_db)):
    """Retorna configuração de impostos e valor líquido para modal de pré-visualização."""
    try:
        return BoletoService.get_config_impostos(db, nota_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/gerar", response_model=GerarBoletosResponse)
def gerar_boletos(request: GerarBoletosRequest, db: Session = Depends(get_db)):
    """Gera boleto(s) para uma ou mais notas fiscais."""
    return BoletoService.gerar_boletos(
        db, request.nota_ids, request.data_vencimento_override,
        request.valor_total_override, request.mensagem,
        request.pct_pis, request.pct_cofins,
        request.pct_inss, request.pct_csll,
        request.aplicar_juros, request.taxa_juros,
    )


@router.get("", response_model=List[BoletoResponse])
def listar_boletos(db: Session = Depends(get_db)):
    """Lista todos os boletos."""
    return BoletoService.listar_boletos(db)


@router.get("/stats", response_model=BoletoStats)
def get_stats(db: Session = Depends(get_db)):
    """Retorna estatísticas gerais dos boletos."""
    return BoletoService.get_stats(db)


@router.post("/sincronizar", response_model=SincronizarResponse)
def sincronizar_status(db: Session = Depends(get_db)):
    """Consulta o Inter e atualiza o status de todos os boletos em aberto."""
    return BoletoService.sincronizar_status(db)


@router.post("/sincronizar-inter", response_model=SincronizarInterResponse)
def sincronizar_do_inter(
    data_inicio: str = Query(..., description="Data inicial YYYY-MM-DD"),
    data_fim: str = Query(..., description="Data final YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """Busca todas as cobranças do Banco Inter no período e cria/atualiza vínculos com notas fiscais."""
    return BoletoService.sincronizar_do_inter(db, data_inicio, data_fim)


@router.get("/nota/{nota_fiscal_id}", response_model=List[BoletoResponse])
def get_boletos_por_nota(nota_fiscal_id: int, db: Session = Depends(get_db)):
    """Retorna todos os boletos (parcelas) vinculados a uma nota fiscal."""
    return BoletoService.get_boletos_por_nota(db, nota_fiscal_id)


@router.post("/manual", response_model=BoletoResponse)
def criar_boleto_manual(request: CriarBoletoManualRequest, db: Session = Depends(get_db)):
    """Cria boleto sem emitir no Inter (PIX, dinheiro, Itaú, cheque)."""
    try:
        return BoletoService.criar_boleto_manual(db, request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{boleto_id}/registrar-pagamento", response_model=BoletoResponse)
def registrar_pagamento(boleto_id: int, request: RegistrarPagamentoRequest, db: Session = Depends(get_db)):
    """Registra pagamento manual em um boleto (PIX, dinheiro, Itaú, etc.)."""
    try:
        return BoletoService.registrar_pagamento(db, boleto_id, request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/gerar-parcelas-faltantes/{nota_id}", response_model=GerarParcelasFaltantesResponse)
def gerar_parcelas_faltantes(
    nota_id: int,
    request: GerarParcelasFaltantesRequest = Body(default_factory=GerarParcelasFaltantesRequest),
    db: Session = Depends(get_db),
):
    """Gera parcelas que ainda não foram emitidas para uma nota parcelada."""
    return BoletoService.gerar_parcelas_faltantes(
        db, nota_id, request.valor_total_override, request.mensagem,
        request.pct_pis, request.pct_cofins,
        request.pct_inss, request.pct_csll,
        request.aplicar_juros, request.taxa_juros,
        request.data_vencimento_override, request.parcelas_selecionadas,
        request.imposto_config_vinculo,
    )


@router.get("/inconsistencias")
def get_inconsistencias(db: Session = Depends(get_db)):
    """
    Detecta boletos incorretamente vinculados a notas fiscais.
    Retorna notas com excesso de boletos ou valores incompatíveis.
    """
    return BoletoService.get_inconsistencias(db)


@router.get("/notas-sem-boleto", response_model=List[NotaSemBoletoResponse])
def get_notas_sem_boleto(db: Session = Depends(get_db)):
    """Lista notas fiscais ativas que ainda não têm boleto gerado."""
    return BoletoService.get_notas_sem_boleto(db)


@router.patch("/{boleto_id}/vincular", response_model=BoletoResponse)
def vincular_nota(boleto_id: int, request: VincularNotaRequest, db: Session = Depends(get_db)):
    """Vincula (ou re-vincula) um boleto a uma nota fiscal."""
    try:
        return BoletoService.vincular_nota(db, boleto_id, request.nota_fiscal_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{boleto_id}", status_code=204)
def deletar_boleto(boleto_id: int, db: Session = Depends(get_db)):
    """Remove um boleto do banco de dados local (não cancela no Inter)."""
    try:
        BoletoService.deletar_boleto(db, boleto_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{codigo}/cancelar", response_model=BoletoResponse)
def cancelar_boleto(codigo: str, db: Session = Depends(get_db)):
    """Cancela um boleto no Inter e atualiza o status no banco."""
    try:
        return BoletoService.cancelar_boleto(db, codigo)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{boleto_id}/preview-email", response_class=HTMLResponse)
def preview_email_boleto(boleto_id: int, db: Session = Depends(get_db)):
    """Retorna o HTML do email que seria enviado para o boleto (para preview)."""
    try:
        html = BoletoService.preview_email_boleto(db, boleto_id)
        return HTMLResponse(content=html)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{boleto_id}/enviar-email", response_model=Dict[str, Any])
async def enviar_email_boleto(
    boleto_id: int,
    destinatarios: str = Form(...),
    assunto: Optional[str] = Form(None),
    saudacao: Optional[str] = Form(None),
    corpo: Optional[str] = Form(None),
    rodape: Optional[str] = Form(None),
    arquivos: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    storage: StorageClient = Depends(get_storage_client),
):
    """Envia o PDF do boleto por email. Aceita assunto/saudação/corpo/rodapé customizados e anexos extras."""
    try:
        lista_dest = json.loads(destinatarios)
        anexos_extras = []
        for arq in arquivos:
            conteudo = await arq.read()
            anexos_extras.append((arq.filename, conteudo, arq.content_type or "application/octet-stream"))
        return BoletoService.enviar_email_boleto(
            db, boleto_id, lista_dest, assunto, saudacao, corpo, rodape, anexos_extras, storage
        )
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
