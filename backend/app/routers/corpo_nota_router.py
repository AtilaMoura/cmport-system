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
    PreGerarTermoResponse,
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
    tipo_nota: Optional[str] = None,
    meses_historico: int = 2,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Retorna OSs do condomínio para seleção ao criar corpo de nota.

    Para MANUTENCAO filtra task_type_description ILIKE '%Manuten%'.
    Para SERVICO retorna todas as OS (sem filtro de tipo).
    meses_historico=2 → mês atual + 1 anterior.
    """
    import calendar
    from datetime import date, datetime
    from app.models.ordem_servico_model import OrdemServico
    from app.models.condominio_model import Condominio

    condo = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condo or not condo.auvo_id:
        return {"lista": [], "preenchimento_manual": True}

    # Calcular janela de datas: N meses atrás até último dia do mês de referência
    meses_back = max(1, meses_historico) - 1
    year_from, month_from = ano, mes
    for _ in range(meses_back):
        month_from -= 1
        if month_from < 1:
            month_from = 12
            year_from -= 1
    date_from = date(year_from, month_from, 1)
    last_day = calendar.monthrange(ano, mes)[1]
    date_to = date(ano, mes, last_day)

    query = db.query(OrdemServico).filter(
        OrdemServico.customer_id == condo.auvo_id,
        OrdemServico.finished == True,
        OrdemServico.task_date >= datetime(date_from.year, date_from.month, date_from.day),
        OrdemServico.task_date <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59),
    )

    if tipo_nota != "SERVICO":
        query = query.filter(OrdemServico.task_type_description.ilike("%Manuten%"))

    ordens = query.order_by(OrdemServico.task_date.desc()).all()

    if not ordens:
        return {"lista": [], "preenchimento_manual": True}

    return {
        "lista": [
            {
                "servico_id": None,
                "numero_os": str(o.task_id),
                "data_servico": o.task_date.date().isoformat() if o.task_date else None,
                "descricao_preview": (o.task_type_description or "")[:60].strip(),
                "descricao_completa": o.orientation or o.task_type_description,
            }
            for o in ordens
        ],
        "preenchimento_manual": False,
    }


@router.get("/buscar-orcamentos")
def buscar_orcamentos_para_corpo(
    condominio_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Retorna orçamentos Auvo do condomínio não cancelados, ordenados por data."""
    from app.models.orcamento_model import Orcamento, OrcamentoItem, OrcamentoTaskId
    from app.models.condominio_model import Condominio
    from sqlalchemy.orm import joinedload

    condo = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condo or not condo.auvo_id:
        return []

    orcamentos = (
        db.query(Orcamento)
        .options(joinedload(Orcamento.itens), joinedload(Orcamento.task_ids))
        .filter(
            Orcamento.condominio_id == condominio_id,
            Orcamento.is_cancelled == False,
        )
        .order_by(Orcamento.request_date.desc())
        .limit(30)
        .all()
    )

    return [
        {
            "id": o.id,
            "auvo_public_id": o.auvo_public_id,
            "observations": o.observations,
            "request_date": o.request_date.isoformat() if o.request_date else None,
            "current_stage_description": o.current_stage_description,
            "total_services": float(o.total_services or 0),
            "total_products": float(o.total_products or 0),
            "gross_total_value": float(o.gross_total_value or 0),
            "task_ids": [t.task_id for t in o.task_ids],
            "itens": [
                {
                    "tipo": item.tipo.value,
                    "nome": item.nome,
                    "descricao": item.descricao,
                    "quantidade": float(item.quantidade or 1),
                    "valor_unitario": float(item.valor_unitario or 0),
                    "valor_total": float(item.valor_total or 0),
                }
                for item in o.itens
            ],
        }
        for o in orcamentos
    ]


@router.get("/condominios-pendentes")
def condominios_pendentes(
    tipo_nota: str,
    ano: int,
    mes: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Retorna condomínios que ainda não têm ciclo no mês/tipo informado.

    SERVICO: todos os condomínios com ativo=True (sem exigir contrato).
    MANUTENCAO / PRODUTO: apenas condomínios com contrato ativo.
    """
    from app.models.contrato_condominio_model import ContratoCondominio
    from app.models.ciclo_nota_model import CicloNota, TipoNotaCorpo
    from app.models.condominio_model import Condominio
    from sqlalchemy.orm import joinedload

    try:
        tipo_enum = TipoNotaCorpo(tipo_nota)
    except ValueError:
        return []

    from app.models.corpo_nota_model import CorpoNota, StatusCorpoNota

    # ── SERVIÇO: qualquer condomínio ativo, sem exigir contrato ──────────
    if tipo_enum == TipoNotaCorpo.SERVICO:
        ids_cond_com_corpo = (
            db.query(CicloNota.condominio_id)
            .join(CorpoNota, CorpoNota.ciclo_id == CicloNota.id)
            .filter(
                CicloNota.tipo_nota == tipo_enum,
                CicloNota.ano == ano,
                CicloNota.mes == mes,
                CorpoNota.deletado_em.is_(None),
                CorpoNota.status != StatusCorpoNota.CANCELADO,
            )
            .scalar_subquery()
        )
        condominios = (
            db.query(Condominio)
            .filter(
                Condominio.ativo.is_(True),
                ~Condominio.id.in_(ids_cond_com_corpo),
            )
            .order_by(Condominio.nome)
            .all()
        )
        return [
            {
                "condominio_id": c.id,
                "contrato_id": None,
                "nome": c.nome,
                "descricao_contrato": None,
                "data_inicio_contrato": None,
                "valor_fixo_mensal": None,
                "dia_vencimento_padrao": None,
                "descricao_padrao_servico": None,
            }
            for c in condominios
        ]

    # ── MANUTENCAO / PRODUTO: retorna uma linha por contrato ativo ───────
    # IDs de contratos que já têm corpo ativo neste ciclo
    contratos_com_corpo = (
        db.query(CicloNota.contrato_id)
        .join(CorpoNota, CorpoNota.ciclo_id == CicloNota.id)
        .filter(
            CicloNota.tipo_nota == tipo_enum,
            CicloNota.ano == ano,
            CicloNota.mes == mes,
            CicloNota.contrato_id.isnot(None),
            CorpoNota.deletado_em.is_(None),
            CorpoNota.status != StatusCorpoNota.CANCELADO,
        )
        .scalar_subquery()
    )

    # Para ciclos legados (sem contrato_id), bloqueia apenas o contrato mais antigo
    # do condomínio (assumindo que o corpo foi gerado para o contrato original)
    from sqlalchemy import func as sqlfunc

    contratos_legados_bloqueados = (
        db.query(sqlfunc.min(ContratoCondominio.id).label("min_id"))
        .join(CicloNota, CicloNota.condominio_id == ContratoCondominio.condominio_id)
        .join(CorpoNota, CorpoNota.ciclo_id == CicloNota.id)
        .filter(
            CicloNota.tipo_nota == tipo_enum,
            CicloNota.ano == ano,
            CicloNota.mes == mes,
            CicloNota.contrato_id.is_(None),
            ContratoCondominio.ativo.is_(True),
            ContratoCondominio.deletado_em.is_(None),
            CorpoNota.deletado_em.is_(None),
            CorpoNota.status != StatusCorpoNota.CANCELADO,
        )
        .group_by(CicloNota.condominio_id)
        .subquery()
    )

    contratos = (
        db.query(ContratoCondominio)
        .options(joinedload(ContratoCondominio.condominio))
        .filter(
            ContratoCondominio.ativo.is_(True),
            ContratoCondominio.deletado_em.is_(None),
            ~ContratoCondominio.id.in_(contratos_com_corpo),
            ~ContratoCondominio.id.in_(db.query(contratos_legados_bloqueados.c.min_id)),
        )
        .order_by(ContratoCondominio.condominio_id, ContratoCondominio.id)
        .all()
    )

    # Detecta quais condomínios têm mais de um contrato (para exibir badge)
    from collections import Counter
    contagem = Counter(c.condominio_id for c in contratos)

    return [
        {
            "condominio_id": c.condominio_id,
            "contrato_id": c.id,
            "nome": c.condominio.nome if c.condominio else f"Condomínio #{c.condominio_id}",
            "descricao_contrato": c.descricao if contagem[c.condominio_id] > 1 else None,
            "data_inicio_contrato": c.data_inicio.isoformat() if c.data_inicio else None,
            "valor_fixo_mensal": float(c.valor_fixo_mensal) if c.valor_fixo_mensal else None,
            "dia_vencimento_padrao": c.dia_vencimento_padrao,
            "descricao_padrao_servico": c.descricao_padrao_servico,
        }
        for c in contratos
    ]


@router.get("/proximo-numero")
def proximo_numero(
    tipo_nota: str,
    ano: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Retorna o próximo numero_referencia que seria gerado para o tipo/ano informado."""
    try:
        tipo_enum = TipoNotaCorpo(tipo_nota)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"tipo_nota inválido: {tipo_nota}")

    from app.services.corpo_nota_service import CorpoNotaService
    numero = CorpoNotaService._gerar_numero_referencia(db, tipo_enum, ano)
    return {"numero_referencia": numero}


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
        data_servico_texto=payload.data_servico_texto,
        descricao_garantia=payload.descricao_garantia,
        valor_nota_produto=payload.valor_nota_produto,
        numero_parcelas=payload.numero_parcelas,
        numero_nf=payload.numero_nf,
        parcelas_json=payload.parcelas_json,
        produtos_json=payload.produtos_json,
        sem_retencao=payload.sem_retencao,
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
        contrato_id=payload.contrato_id,
        servico_id=payload.servico_id,
        numero_os=payload.numero_os,
        data_servico=payload.data_servico,
        descricao_servico=payload.descricao_servico,
        valor_bruto=payload.valor_bruto,
        data_vencimento=payload.data_vencimento,
        observacoes=payload.observacoes,
        tem_garantia=payload.tem_garantia,
        usuario=getattr(usuario, "nome", None),
        configuracao_inter_id=payload.configuracao_inter_id,
        orcamento_id=payload.orcamento_id,
        data_servico_texto=payload.data_servico_texto,
        descricao_garantia=payload.descricao_garantia,
        valor_nota_produto=payload.valor_nota_produto,
        numero_parcelas=payload.numero_parcelas,
        parcelas_json=payload.parcelas_json,
        produtos_json=payload.produtos_json,
        sem_retencao=payload.sem_retencao,
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
            "status": n.status.value if hasattr(n.status, "value") else n.status,
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
        configuracao_inter_id=payload.configuracao_inter_id,
        orcamento_id=payload.orcamento_id,
        data_servico_texto=payload.data_servico_texto,
        descricao_garantia=payload.descricao_garantia,
        valor_nota_produto=payload.valor_nota_produto,
        numero_parcelas=payload.numero_parcelas,
        numero_nf=payload.numero_nf,
        numero_nf_produto=getattr(payload, "numero_nf_produto", None),
        parcelas_json=payload.parcelas_json,
        produtos_json=payload.produtos_json,
        sem_retencao=payload.sem_retencao,
    )


@router.patch("/{corpo_id}/status", response_model=CorpoNotaResponse)
def atualizar_status(
    corpo_id: int,
    payload: CorpoNotaStatusUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return CorpoNotaService.atualizar_status(db, corpo_id, payload.status, payload.motivo)


@router.post("/{corpo_id}/gerar-numero-nf", response_model=CorpoNotaResponse)
def gerar_numero_nf(
    corpo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Atribui o próximo número sequencial de NF (da conta Inter) e regenera o corpo."""
    return CorpoNotaService.gerar_numero_nf(db, corpo_id)


@router.post("/{corpo_id}/gerar-numero-nf-produto", response_model=CorpoNotaResponse)
def gerar_numero_nf_produto(
    corpo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Atribui o próximo número sequencial de NF de produto (conta Inter PRODUTO) e regenera o corpo."""
    return CorpoNotaService.gerar_numero_nf_produto(db, corpo_id)


@router.post("/{corpo_id}/regenerar", response_model=CorpoNotaResponse)
def regenerar_conteudo(
    corpo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Regenera o conteudo_gerado e recalcula impostos se necessário."""
    corpo = CorpoNotaService.get_by_id(db, corpo_id)
    corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)
    from app.repositories.corpo_nota_repository import CorpoNotaRepository
    return CorpoNotaRepository.save(db, corpo)


@router.get("/{corpo_id}/pre-gerar-termo", response_model=PreGerarTermoResponse)
def pre_gerar_termo(
    corpo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    """Pré-calcula dados para geração de Termo de Garantia a partir do corpo da nota."""
    return CorpoNotaService.pre_gerar_termo(db, corpo_id)


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
