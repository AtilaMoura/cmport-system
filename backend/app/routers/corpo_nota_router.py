from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.dependencies import get_current_user
from app.models.ciclo_nota_model import TipoNotaCorpo
from app.models.corpo_nota_model import StatusCorpoNota
from app.schemas.corpo_nota_schema import (
    CorpoNotaCreate,
    CorpoNotaUpdate,
    CorpoNotaStatusUpdate,
    CorpoNotaResponse,
    CorpoNotaPreviewRequest,
    CorpoNotaPreviewResponse,
    VincularNotaRequest,
    ImpostosCalculadosResponse,
)
from app.services.corpo_nota_service import CorpoNotaService

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Rotas estáticas (devem vir antes das dinâmicas /{corpo_id}) ────────────

@router.get("", response_model=List[CorpoNotaResponse])
def listar_corpos(
    condominio_id: Optional[int] = None,
    status: Optional[StatusCorpoNota] = None,
    ciclo_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    if ciclo_id:
        return CorpoNotaService.list_by_ciclo(db, ciclo_id)
    if condominio_id:
        return CorpoNotaService.list_by_condominio(db, condominio_id, status)
    raise HTTPException(status_code=422, detail="Informe condominio_id ou ciclo_id.")


@router.get("/buscar-os")
def buscar_os_para_corpo(
    condominio_id: int,
    mes: int,
    ano: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Retorna lista de OSs de manutenção do período para seleção manual ou auto-preenchimento."""
    from app.models.servico_model import ManutencaoAssistencia
    from sqlalchemy import extract

    servicos = (
        db.query(ManutencaoAssistencia)
        .filter(
            ManutencaoAssistencia.condominio_id == condominio_id,
            ManutencaoAssistencia.tipo == "manutencao",
            extract("year", ManutencaoAssistencia.data_servico) == ano,
            extract("month", ManutencaoAssistencia.data_servico) == mes,
            ManutencaoAssistencia.nota_fiscal_id.is_(None),
        )
        .order_by(ManutencaoAssistencia.data_servico.desc())
        .all()
    )

    if not servicos:
        return {"lista": [], "preenchimento_manual": True}

    return {
        "lista": [
            {
                "servico_id": s.id,
                "numero_os": s.numero_os,
                "data_servico": s.data_servico.isoformat() if s.data_servico else None,
                "descricao_preview": (s.descricao or "")[:60],
                "descricao_completa": s.descricao,
            }
            for s in servicos
        ],
        "preenchimento_manual": False,
    }


@router.get("/condominios-pendentes")
def condominios_pendentes(
    tipo_nota: str,
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Retorna condomínios com contrato ativo que ainda não têm ciclo no mês/tipo informado."""
    from app.models.contrato_condominio_model import ContratoCondominio
    from app.models.ciclo_nota_model import CicloNota, TipoNotaCorpo
    from sqlalchemy.orm import joinedload

    try:
        tipo_enum = TipoNotaCorpo(tipo_nota)
    except ValueError:
        return []

    # IDs dos condomínios que já têm ciclo neste mês/tipo
    ciclos_ids = (
        db.query(CicloNota.condominio_id)
        .filter(
            CicloNota.tipo_nota == tipo_enum,
            CicloNota.ano == ano,
            CicloNota.mes == mes,
        )
        .scalar_subquery()
    )

    contratos = (
        db.query(ContratoCondominio)
        .options(joinedload(ContratoCondominio.condominio))
        .filter(
            ContratoCondominio.ativo.is_(True),
            ContratoCondominio.deletado_em.is_(None),
            ~ContratoCondominio.condominio_id.in_(ciclos_ids),
        )
        .order_by(ContratoCondominio.condominio_id)
        .all()
    )

    return [
        {
            "condominio_id": c.condominio_id,
            "nome": c.condominio.nome if c.condominio else f"Condomínio #{c.condominio_id}",
            "data_inicio_contrato": c.data_inicio.isoformat() if c.data_inicio else None,
            "valor_fixo_mensal": float(c.valor_fixo_mensal) if c.valor_fixo_mensal else None,
            "dia_vencimento_padrao": c.dia_vencimento_padrao,
            "descricao_padrao_servico": c.descricao_padrao_servico,
        }
        for c in contratos
    ]


@router.post("/preview", response_model=CorpoNotaPreviewResponse)
def preview_corpo(
    payload: CorpoNotaPreviewRequest,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    percentuais = None
    if any([payload.pct_inss, payload.pct_cofins, payload.pct_pis, payload.pct_csll]):
        percentuais = {
            "pct_inss": payload.pct_inss,
            "pct_cofins": payload.pct_cofins,
            "pct_pis": payload.pct_pis,
            "pct_csll": payload.pct_csll,
        }
    resultado = CorpoNotaService.gerar_preview(
        db=db,
        condominio_id=payload.condominio_id,
        tipo_nota=payload.tipo_nota,
        numero_os=payload.numero_os,
        data_servico=payload.data_servico,
        descricao_servico=payload.descricao_servico,
        valor_bruto=payload.valor_bruto,
        data_vencimento=payload.data_vencimento,
        mes_referencia=payload.mes_referencia,
        observacoes=payload.observacoes,
        percentuais_override=percentuais,
    )
    impostos_resp = None
    if resultado["impostos_calculados"]:
        imp = resultado["impostos_calculados"]
        impostos_resp = ImpostosCalculadosResponse(
            percentual_inss=imp.percentual_inss,
            percentual_cofins=imp.percentual_cofins,
            percentual_pis=imp.percentual_pis,
            percentual_csll=imp.percentual_csll,
            percentual_iss=getattr(imp, "percentual_iss", 0.0),
            valor_inss=imp.valor_inss,
            valor_cofins=imp.valor_cofins,
            valor_pis=imp.valor_pis,
            valor_csll=imp.valor_csll,
            valor_iss=getattr(imp, "valor_iss", 0.0),
            valor_liquido=imp.valor_liquido,
        )
    return CorpoNotaPreviewResponse(
        conteudo_gerado=resultado["conteudo_gerado"],
        impostos_calculados=impostos_resp,
    )


@router.post("", response_model=CorpoNotaResponse, status_code=201)
def criar_corpo(
    payload: CorpoNotaCreate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return CorpoNotaService.criar(
        db=db,
        condominio_id=payload.condominio_id,
        tipo_nota=payload.tipo_nota,
        ano=payload.ano,
        mes=payload.mes,
        servico_id=payload.servico_id,
        numero_os=payload.numero_os,
        data_servico=payload.data_servico,
        descricao_servico=payload.descricao_servico,
        valor_bruto=payload.valor_bruto,
        data_vencimento=payload.data_vencimento,
        observacoes=payload.observacoes,
        tem_garantia=payload.tem_garantia,
        usuario=getattr(usuario, "nome", None),
    )


# ── Rotas dinâmicas ────────────────────────────────────────────────────────

@router.get("/{corpo_id}", response_model=CorpoNotaResponse)
def get_corpo(
    corpo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return CorpoNotaService.get_by_id(db, corpo_id)


@router.get("/{corpo_id}/candidatos-nota")
def listar_candidatos_nota(
    corpo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Retorna notas fiscais candidatas a vínculo com este corpo (mesmo condomínio, sem corpo vinculado)."""
    from app.models.nota_fiscal_model import NotaFiscal, TipoNota
    corpo = CorpoNotaService.get_by_id(db, corpo_id)

    tipo_map = {
        TipoNotaCorpo.MANUTENCAO: [TipoNota.MANUTENCAO],
        TipoNotaCorpo.SERVICO: [TipoNota.ASSISTENCIA],
    }
    tipos_validos = tipo_map.get(corpo.tipo_nota, [TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA])

    notas = (
        db.query(NotaFiscal)
        .filter(
            NotaFiscal.condominio_id == corpo.condominio_id,
            NotaFiscal.tipo.in_(tipos_validos),
            NotaFiscal.corpo_nota_id.is_(None),
        )
        .order_by(NotaFiscal.criado_em.desc())
        .limit(50)
        .all()
    )

    return [
        {
            "id": n.id,
            "numero_nota": n.numero_nota,
            "tipo": n.tipo.value if hasattr(n.tipo, "value") else n.tipo,
            "valor": float(n.valor) if n.valor else 0.0,
            "data_vencimento": n.data_vencimento.isoformat() if n.data_vencimento else None,
            "cliente_nome": n.cliente_nome,
        }
        for n in notas
    ]


@router.patch("/{corpo_id}", response_model=CorpoNotaResponse)
def atualizar_corpo(
    corpo_id: int,
    payload: CorpoNotaUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    percentuais = None
    if any([payload.percentual_inss, payload.percentual_cofins, payload.percentual_pis, payload.percentual_csll]):
        percentuais = {
            "pct_inss": payload.percentual_inss,
            "pct_cofins": payload.percentual_cofins,
            "pct_pis": payload.percentual_pis,
            "pct_csll": payload.percentual_csll,
        }
    return CorpoNotaService.atualizar(
        db=db,
        corpo_id=corpo_id,
        numero_os=payload.numero_os,
        data_servico=payload.data_servico,
        descricao_servico=payload.descricao_servico,
        valor_bruto=payload.valor_bruto,
        data_vencimento=payload.data_vencimento,
        observacoes=payload.observacoes,
        percentuais_override=percentuais,
        tem_garantia=payload.tem_garantia,
        termo_garantia_id=payload.termo_garantia_id,
    )


@router.patch("/{corpo_id}/status", response_model=CorpoNotaResponse)
def atualizar_status(
    corpo_id: int,
    payload: CorpoNotaStatusUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return CorpoNotaService.atualizar_status(db, corpo_id, payload.status, payload.motivo)


@router.post("/{corpo_id}/vincular-nota", response_model=CorpoNotaResponse)
def vincular_nota(
    corpo_id: int,
    payload: VincularNotaRequest,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return CorpoNotaService.vincular_nota_fiscal(db, corpo_id, payload.nota_fiscal_id)


@router.delete("/{corpo_id}", status_code=204)
def deletar_corpo(
    corpo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    CorpoNotaService.deletar(db, corpo_id, usuario=getattr(usuario, "nome", None))
