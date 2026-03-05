# ─────────────────────────────────────────────────────────────────────────────
# ADICIONE esta importação no topo do seu router de dashboard:
#
#   from app.domains.notas_fiscais.model import NotaFiscal, StatusNota
#
# Substitua as queries de NotaFiscal no dashboard por versões que excluem
# notas canceladas. Exemplos abaixo:
# ─────────────────────────────────────────────────────────────────────────────

# Exemplo — substitua cada bloco no seu get_dashboard_stats:

# ANTES (sem filtro):
#   stats_notas_mes_atual = db.query(
#       func.count(NotaFiscal.id),
#       func.sum(NotaFiscal.valor)
#   ).filter(
#       extract('month', NotaFiscal.data_vencimento) == hoje.month,
#       extract('year', NotaFiscal.data_vencimento) == ano_atual
#   ).first()

# DEPOIS (excluindo canceladas):
#   stats_notas_mes_atual = db.query(
#       func.count(NotaFiscal.id),
#       func.sum(NotaFiscal.valor)
#   ).filter(
#       extract('month', NotaFiscal.data_vencimento) == hoje.month,
#       extract('year', NotaFiscal.data_vencimento) == ano_atual,
#       NotaFiscal.status != StatusNota.CANCELADA          # ✅ FILTRO
#   ).first()

# O mesmo padrão se aplica a TODAS as queries do dashboard que usam NotaFiscal:
#   - stats_notas_mes_passado
#   - valor_ano_atual
#   - valor_ano_passado
#   - total_notas_geral
#   - total_valor_geral
#   - top_condominios (JOIN com NotaFiscal)

# ─────────────────────────────────────────────────────────────────────────────
# Versão completa da função get_dashboard_stats com o filtro aplicado:
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, date, timedelta
from typing import Optional, List
import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from app.core.database import SessionLocal
from app.domains.notas_fiscais.model import NotaFiscal, StatusNota   # ✅ importa StatusNota
from app.domains.manutencoes_assistencias.model import ManutencaoAssistencia
from app.domains.condominios.model import Condominio

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/estatisticas")
def get_dashboard_stats(db: Session = Depends(get_db)):
    hoje = date.today()
    ano_atual = hoje.year

    primeiro_dia_mes_atual = hoje.replace(day=1)
    ultimo_dia_mes_passado = primeiro_dia_mes_atual - timedelta(days=1)
    mes_passado    = ultimo_dia_mes_passado.month
    ano_mes_passado = ultimo_dia_mes_passado.year
    ano_passado    = ano_atual - 1

    # ── Filtro base que exclui canceladas ──────────────────────────────────
    nf_ativas = NotaFiscal.status != StatusNota.CANCELADA

    # === NOTAS FISCAIS =====================================================

    stats_notas_mes_atual = db.query(
        func.count(NotaFiscal.id),
        func.sum(NotaFiscal.valor)
    ).filter(
        extract('month', NotaFiscal.data_vencimento) == hoje.month,
        extract('year',  NotaFiscal.data_vencimento) == ano_atual,
        nf_ativas,                                                  # ✅
    ).first()
    notas_mes_atual = stats_notas_mes_atual[0] or 0
    valor_mes_atual = stats_notas_mes_atual[1] or 0.0

    stats_notas_mes_passado = db.query(
        func.count(NotaFiscal.id),
        func.sum(NotaFiscal.valor)
    ).filter(
        extract('month', NotaFiscal.data_vencimento) == mes_passado,
        extract('year',  NotaFiscal.data_vencimento) == ano_mes_passado,
        nf_ativas,                                                  # ✅
    ).first()
    notas_mes_passado = stats_notas_mes_passado[0] or 0
    valor_mes_passado = stats_notas_mes_passado[1] or 0.0

    valor_ano_atual = db.query(func.sum(NotaFiscal.valor)).filter(
        extract('year', NotaFiscal.data_vencimento) == ano_atual,
        nf_ativas,                                                   # ✅
    ).scalar() or 0.0

    valor_ano_passado = db.query(func.sum(NotaFiscal.valor)).filter(
        extract('year', NotaFiscal.data_vencimento) == ano_passado,
        nf_ativas,                                                   # ✅
    ).scalar() or 0.0

    total_notas_geral = db.query(func.count(NotaFiscal.id)).filter(nf_ativas).scalar() or 0   # ✅
    total_valor_geral = db.query(func.sum(NotaFiscal.valor)).filter(nf_ativas).scalar() or 0.0 # ✅

    # === SERVIÇOS ==========================================================

    servicos_mes_atual = db.query(func.count(ManutencaoAssistencia.id)).filter(
        extract('month', ManutencaoAssistencia.data_servico) == hoje.month,
        extract('year',  ManutencaoAssistencia.data_servico) == ano_atual
    ).scalar() or 0

    servicos_mes_passado = db.query(func.count(ManutencaoAssistencia.id)).filter(
        extract('month', ManutencaoAssistencia.data_servico) == mes_passado,
        extract('year',  ManutencaoAssistencia.data_servico) == ano_mes_passado
    ).scalar() or 0

    stats_servicos_tipo = db.query(
        ManutencaoAssistencia.tipo,
        func.count(ManutencaoAssistencia.id)
    ).group_by(ManutencaoAssistencia.tipo).all()

    manutencoes  = next((c for t, c in stats_servicos_tipo if t == 'manutencao'), 0)
    assistencias = next((c for t, c in stats_servicos_tipo if t == 'assistencia'), 0)
    total_servicos = manutencoes + assistencias

    # === RANKINGS ==========================================================

    top_condominios = db.query(
        Condominio.nome,
        func.sum(NotaFiscal.valor).label('total')
    ).join(NotaFiscal, NotaFiscal.condominio_id == Condominio.id
    ).filter(nf_ativas                                               # ✅
    ).group_by(Condominio.id, Condominio.nome
    ).order_by(func.sum(NotaFiscal.valor).desc()
    ).limit(5).all()

    servicos_por_mes = db.query(
        extract('month', ManutencaoAssistencia.data_servico).label('mes'),
        extract('year',  ManutencaoAssistencia.data_servico).label('ano'),
        func.count(ManutencaoAssistencia.id).label('quantidade')
    ).filter(ManutencaoAssistencia.data_servico >= hoje - timedelta(days=365)
    ).group_by('mes', 'ano'
    ).order_by(func.count(ManutencaoAssistencia.id).desc()
    ).limit(5).all()

    servicos_por_dia_semana = db.query(
        func.dayofweek(ManutencaoAssistencia.data_servico).label('dia_semana_mysql'),
        func.count(ManutencaoAssistencia.id).label('quantidade')
    ).group_by('dia_semana_mysql').all()

    dias_semana_nomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    ranking_dias_dict = {dia: 0 for dia in dias_semana_nomes}
    for r in servicos_por_dia_semana:
        if r.dia_semana_mysql is not None:
            dia_index = int(r.dia_semana_mysql) - 1
            ranking_dias_dict[dias_semana_nomes[dia_index]] = int(r.quantidade or 0)

    ranking_dias_formatado = [{"dia": dia, "quantidade": qtd} for dia, qtd in ranking_dias_dict.items()]

    # === VARIAÇÕES =========================================================

    def calcular_variacao(atual, passado):
        if passado is None or passado == 0:
            return 100.0 if atual > 0 else 0.0
        return round(((atual - passado) / passado) * 100, 2)

    return {
        "resumo_geral": {
            "total_condominios": db.query(func.count(Condominio.id)).scalar() or 0,
            "total_notas":       total_notas_geral,
            "total_valor_notas": float(total_valor_geral),
            "total_servicos":    total_servicos,
            "total_manutencoes": manutencoes,
            "total_assistencias": assistencias,
        },
        "mes_atual": {
            "notas":    notas_mes_atual,
            "valor":    float(valor_mes_atual),
            "servicos": servicos_mes_atual,
            "variacao_notas_percentual":    calcular_variacao(notas_mes_atual, notas_mes_passado),
            "variacao_valor_percentual":    calcular_variacao(valor_mes_atual, valor_mes_passado),
            "variacao_servicos_percentual": calcular_variacao(servicos_mes_atual, servicos_mes_passado),
        },
        "mes_passado": {
            "notas":    notas_mes_passado,
            "valor":    float(valor_mes_passado),
            "servicos": servicos_mes_passado,
        },
        "ano_atual": {
            "valor":              float(valor_ano_atual),
            "variacao_percentual": calcular_variacao(valor_ano_atual, valor_ano_passado),
        },
        "ano_passado": {
            "valor": float(valor_ano_passado),
        },
        "rankings": {
            "top_condominios": [
                {"nome": nome, "valor": float(total or 0)} for nome, total in top_condominios
            ],
            "top_meses_servicos": [
                {
                    "mes":      int(mes),
                    "ano":      int(ano),
                    "quantidade": int(qtd),
                    "nome_mes": ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][int(mes)-1]
                }
                for mes, ano, qtd in servicos_por_mes
            ],
            "dias_semana": ranking_dias_formatado,
        },
    }