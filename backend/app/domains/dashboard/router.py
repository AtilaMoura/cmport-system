from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, date, timedelta
from typing import Optional, List
import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from app.core.database import SessionLocal
from app.domains.notas_fiscais.model import NotaFiscal
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

    # --- Lógica corrigida para mês/ano passado ---
    primeiro_dia_mes_atual = hoje.replace(day=1)
    ultimo_dia_mes_passado = primeiro_dia_mes_atual - timedelta(days=1)
    mes_passado = ultimo_dia_mes_passado.month
    ano_mes_passado = ultimo_dia_mes_passado.year # Garante que janeiro aponte para o ano anterior
    ano_passado = ano_atual - 1

    # === NOTAS FISCAIS (Consultas mais eficientes) ===
    
    # Mês Atual
    stats_notas_mes_atual = db.query(
        func.count(NotaFiscal.id),
        func.sum(NotaFiscal.valor)
    ).filter(
        extract('month', NotaFiscal.data_vencimento) == hoje.month,
        extract('year', NotaFiscal.data_vencimento) == ano_atual
    ).first()
    notas_mes_atual = stats_notas_mes_atual[0] or 0
    valor_mes_atual = stats_notas_mes_atual[1] or 0.0

    # Mês Passado
    stats_notas_mes_passado = db.query(
        func.count(NotaFiscal.id),
        func.sum(NotaFiscal.valor)
    ).filter(
        extract('month', NotaFiscal.data_vencimento) == mes_passado,
        extract('year', NotaFiscal.data_vencimento) == ano_mes_passado
    ).first()
    notas_mes_passado = stats_notas_mes_passado[0] or 0
    valor_mes_passado = stats_notas_mes_passado[1] or 0.0

    # Anual
    valor_ano_atual = db.query(func.sum(NotaFiscal.valor)).filter(extract('year', NotaFiscal.data_vencimento) == ano_atual).scalar() or 0.0
    valor_ano_passado = db.query(func.sum(NotaFiscal.valor)).filter(extract('year', NotaFiscal.data_vencimento) == ano_passado).scalar() or 0.0
    
    # Totais
    total_notas_geral = db.query(func.count(NotaFiscal.id)).scalar() or 0
    total_valor_geral = db.query(func.sum(NotaFiscal.valor)).scalar() or 0.0

    # === SERVIÇOS (Consultas mais eficientes) ===
    
    # Mês Atual e Passado
    servicos_mes_atual = db.query(func.count(ManutencaoAssistencia.id)).filter(
        extract('month', ManutencaoAssistencia.data_servico) == hoje.month,
        extract('year', ManutencaoAssistencia.data_servico) == ano_atual
    ).scalar() or 0

    servicos_mes_passado = db.query(func.count(ManutencaoAssistencia.id)).filter(
        extract('month', ManutencaoAssistencia.data_servico) == mes_passado,
        extract('year', ManutencaoAssistencia.data_servico) == ano_mes_passado
    ).scalar() or 0

    # Totais por tipo
    stats_servicos_tipo = db.query(
        ManutencaoAssistencia.tipo,
        func.count(ManutencaoAssistencia.id)
    ).group_by(ManutencaoAssistencia.tipo).all()
    
    manutencoes = next((count for tipo, count in stats_servicos_tipo if tipo == 'manutencao'), 0)
    assistencias = next((count for tipo, count in stats_servicos_tipo if tipo == 'assistencia'), 0)
    total_servicos = manutencoes + assistencias

    # === RANKINGS ===
    top_condominios = db.query(
        Condominio.nome,
        func.sum(NotaFiscal.valor).label('total')
    ).join(NotaFiscal, NotaFiscal.condominio_id == Condominio.id
    ).group_by(Condominio.id, Condominio.nome
    ).order_by(func.sum(NotaFiscal.valor).desc()
    ).limit(5).all()

    servicos_por_mes = db.query(
        extract('month', ManutencaoAssistencia.data_servico).label('mes'),
        extract('year', ManutencaoAssistencia.data_servico).label('ano'),
        func.count(ManutencaoAssistencia.id).label('quantidade')
    ).filter(ManutencaoAssistencia.data_servico >= hoje - timedelta(days=365)
    ).group_by('mes', 'ano'
    ).order_by(func.count(ManutencaoAssistencia.id).desc()
    ).limit(5).all()

    # ==== DIAS DA SEMANA (CORRIGIDO PARA MYSQL) ====
    # MySQL: DAYOFWEEK retorna 1=Domingo, 2=Segunda, ..., 7=Sábado
    servicos_por_dia_semana = db.query(
        func.dayofweek(ManutencaoAssistencia.data_servico).label('dia_semana_mysql'),
        func.count(ManutencaoAssistencia.id).label('quantidade')
    ).group_by('dia_semana_mysql').all()

    dias_semana_nomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    
    # Inicializa o ranking com 0 para todos os dias
    ranking_dias_dict = {dia: 0 for dia in dias_semana_nomes}
    for r in servicos_por_dia_semana:
        if r.dia_semana_mysql is not None:
            # Ajusta o índice (1-7 do MySQL para 0-6 da lista)
            dia_index = int(r.dia_semana_mysql) - 1
            ranking_dias_dict[dias_semana_nomes[dia_index]] = int(r.quantidade or 0)

    ranking_dias_formatado = [{"dia": dia, "quantidade": qtd} for dia, qtd in ranking_dias_dict.items()]

    # === CÁLCULO DAS VARIAÇÕES ===
    def calcular_variacao(atual, passado):
        if passado is None or passado == 0:
            return 100.0 if atual > 0 else 0.0
        return round(((atual - passado) / passado) * 100, 2)

    variacao_notas_mes = calcular_variacao(notas_mes_atual, notas_mes_passado)
    variacao_valor_mes = calcular_variacao(valor_mes_atual, valor_mes_passado)
    variacao_valor_ano = calcular_variacao(valor_ano_atual, valor_ano_passado)
    variacao_servicos_mes = calcular_variacao(servicos_mes_atual, servicos_mes_passado)

    return {
        "resumo_geral": {
            "total_condominios": db.query(func.count(Condominio.id)).scalar() or 0,
            "total_notas": total_notas_geral,
            "total_valor_notas": float(total_valor_geral),
            "total_servicos": total_servicos,
            "total_manutencoes": manutencoes,
            "total_assistencias": assistencias
        },
        "mes_atual": {
            "notas": notas_mes_atual,
            "valor": float(valor_mes_atual),
            "servicos": servicos_mes_atual,
            "variacao_notas_percentual": variacao_notas_mes,
            "variacao_valor_percentual": variacao_valor_mes,
            "variacao_servicos_percentual": variacao_servicos_mes
        },
        "mes_passado": {
            "notas": notas_mes_passado,
            "valor": float(valor_mes_passado),
            "servicos": servicos_mes_passado
        },
        "ano_atual": {
            "valor": float(valor_ano_atual),
            "variacao_percentual": variacao_valor_ano
        },
        "ano_passado": {
            "valor": float(valor_ano_passado)
        },
        "rankings": {
            "top_condominios": [
                {"nome": nome, "valor": float(total or 0)} for nome, total in top_condominios
            ],
            "top_meses_servicos": [
                {
                    "mes": int(mes),
                    "ano": int(ano),
                    "quantidade": int(qtd),
                    "nome_mes": ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][int(mes)-1]
                }
                for mes, ano, qtd in servicos_por_mes
            ],
            "dias_semana": ranking_dias_formatado
        }
    }

@router.get("/relatorios/notas/exportar")
def exportar_notas_excel(
    data_inicio: Optional[date] = Query(None),
    data_fim: Optional[date] = Query(None),
    condominio_id: Optional[int] = Query(None),
    tipo: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exporta notas fiscais para Excel com filtros
    """
    # Query base
    query = db.query(NotaFiscal).join(
        Condominio, NotaFiscal.condominio_id == Condominio.id, isouter=True
    )
    
    # Aplicar filtros
    if data_inicio:
        query = query.filter(NotaFiscal.data_vencimento >= data_inicio)
    if data_fim:
        query = query.filter(NotaFiscal.data_vencimento <= data_fim)
    if condominio_id:
        query = query.filter(NotaFiscal.condominio_id == condominio_id)
    if tipo:
        query = query.filter(NotaFiscal.tipo == tipo)
    
    notas = query.all()
    
    # Criar workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Notas Fiscais"
    
    # Estilos
    header_fill = PatternFill(start_color="1e3a5f", end_color="1e3a5f", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=12)
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Cabeçalhos
    headers = ['ID', 'Número', 'Tipo', 'Condomínio', 'Valor', 'Parcelas', 'Data Vencimento', 'Data Pagamento', 'Cliente', 'Observação']
    ws.append(headers)
    
    # Estilizar cabeçalho
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = border
    
    # Dados
    for nota in notas:
        condominio_nome = nota.condominio.nome if nota.condominio else "Sem condomínio"
        ws.append([
            nota.id,
            nota.numero_nota,
            nota.tipo.value,
            condominio_nome,
            float(nota.valor),
            nota.parcelas,
            nota.data_vencimento.strftime('%d/%m/%Y'),
            nota.data_pagamento.strftime('%d/%m/%Y') if nota.data_pagamento else '',
            nota.cliente_nome or '',
            nota.observacao or ''
        ])
    
    # Ajustar largura das colunas
    for column_cells in ws.columns:
        length = max(len(str(cell.value or '')) for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = min(length + 2, 50)
    
    # Adicionar totais
    total_row = ws.max_row + 2
    ws.cell(row=total_row, column=4).value = "TOTAL:"
    ws.cell(row=total_row, column=4).font = Font(bold=True)
    ws.cell(row=total_row, column=5).value = f"=SUM(E2:E{ws.max_row-1})"
    ws.cell(row=total_row, column=5).font = Font(bold=True)
    ws.cell(row=total_row, column=5).number_format = 'R$ #,##0.00'
    
    # Formatar coluna de valor
    for row in range(2, ws.max_row + 1):
        ws.cell(row=row, column=5).number_format = 'R$ #,##0.00'
    
    # Salvar em memória
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"notas_fiscais_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/relatorios/servicos/exportar")
def exportar_servicos_excel(
    data_inicio: Optional[date] = Query(None),
    data_fim: Optional[date] = Query(None),
    condominio_id: Optional[int] = Query(None),
    tipo: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exporta serviços para Excel com filtros
    """
    query = db.query(ManutencaoAssistencia).join(
        Condominio, ManutencaoAssistencia.condominio_id == Condominio.id
    )
    
    if data_inicio:
        query = query.filter(ManutencaoAssistencia.data_servico >= data_inicio)
    if data_fim:
        query = query.filter(ManutencaoAssistencia.data_servico <= data_fim)
    if condominio_id:
        query = query.filter(ManutencaoAssistencia.condominio_id == condominio_id)
    if tipo:
        query = query.filter(ManutencaoAssistencia.tipo == tipo)
    
    servicos = query.all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Serviços"
    
    # Estilos
    header_fill = PatternFill(start_color="7c3aed", end_color="7c3aed", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=12)
    
    # Cabeçalhos
    headers = ['ID', 'Condomínio', 'Tipo', 'Data Serviço', 'Descrição', 'Nota Fiscal ID']
    ws.append(headers)
    
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center', vertical='center')
    
    # Dados
    for servico in servicos:
        ws.append([
            servico.id,
            servico.condominio.nome,
            servico.tipo.value,
            servico.data_servico.strftime('%d/%m/%Y'),
            servico.descricao or '',
            servico.nota_fiscal_id or ''
        ])
    
    # Ajustar colunas
    for column_cells in ws.columns:
        length = max(len(str(cell.value or '')) for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = min(length + 2, 60)
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"servicos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )