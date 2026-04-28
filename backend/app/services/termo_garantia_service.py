import io
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.units import cm
from sqlalchemy.orm import Session

from app.repositories.termo_garantia_repository import TermoGarantiaRepository
from app.repositories.condominio_repository import CondominioRepository
from app.models.termo_garantia_model import TermoGarantia

class TermoGarantiaService:
    @staticmethod
    def gerar_pdf(db: Session, termo_id: int) -> io.BytesIO:
        termo = TermoGarantiaRepository.get_by_id(db, termo_id)
        if not termo:
            raise Exception("Termo de garantia não encontrado")
        
        servico = termo.servico
        condominio = servico.condominio
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        
        # Estilos customizados
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontSize=16,
            alignment=1, # Center
            spaceAfter=20
        )
        
        normal_style = styles['Normal']
        bold_style = ParagraphStyle('BoldStyle', parent=styles['Normal'], fontName='Helvetica-Bold')
        
        elements = []
        
        # 1. Logo (opcional)
        logo_path = os.path.join(os.getcwd(), "..", "cmport-front", "public", "logo.png")
        if os.path.exists(logo_path):
            img = Image(logo_path, width=4*cm, height=2*cm)
            img.hAlign = 'CENTER'
            elements.append(img)
            elements.append(Spacer(1, 0.5*cm))
        
        # 2. Título
        elements.append(Paragraph("TERMO DE GARANTIA", title_style))
        elements.append(Spacer(1, 0.5*cm))
        
        # 3. Informações do Cliente e Serviço
        data_table = [
            [Paragraph("<b>Cliente:</b>", normal_style), Paragraph(condominio.nome, normal_style)],
            [Paragraph("<b>CNPJ:</b>", normal_style), Paragraph(condominio.cnpj or "", normal_style)],
            [Paragraph("<b>Endereço:</b>", normal_style), Paragraph(f"{condominio.endereco.logradouro if condominio.endereco else ''}", normal_style)],
            [Paragraph("<b>Nº da OS:</b>", normal_style), Paragraph(servico.numero_os or str(servico.id), normal_style)],
            [Paragraph("<b>Data da Instalação:</b>", normal_style), Paragraph(servico.data_servico.strftime('%d/%m/%Y'), normal_style)],
        ]
        
        table = Table(data_table, colWidths=[4*cm, 12*cm])
        table.setStyle(TableStyle([
            ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 1*cm))
        
        # 4. Descrição do Produto e Garantia
        elements.append(Paragraph("OBJETO DA GARANTIA", styles['Heading2']))
        elements.append(Paragraph(f"<b>Produto/Serviço:</b> {termo.produto_descricao}", normal_style))
        elements.append(Paragraph(f"<b>Prazo de Garantia:</b> {termo.prazo_meses} meses", normal_style))
        elements.append(Paragraph(f"<b>Início:</b> {termo.data_inicio.strftime('%d/%m/%Y')}", normal_style))
        elements.append(Paragraph(f"<b>Término:</b> {termo.data_fim.strftime('%d/%m/%Y')}", normal_style))
        elements.append(Spacer(1, 1*cm))
        
        # 5. Cláusulas de Garantia
        elements.append(Paragraph("CONDIÇÕES GERAIS", styles['Heading2']))
        clausulas = [
            "1. A CM Port garante o funcionamento do equipamento/instalação acima descrito pelo prazo estipulado.",
            "2. A garantia cobre defeitos de fabricação e falhas de instalação executadas por nossa equipe.",
            "3. A garantia será automaticamente cancelada se o equipamento sofrer danos por: descargas elétricas, mau uso, vandalismo, intervenção de terceiros não autorizados ou desastres naturais.",
            "4. O atendimento em garantia será realizado no local da instalação, mediante agendamento prévio.",
            "5. Peças de desgaste natural (ex: baterias, controles remotos) possuem garantia limitada de 90 dias."
        ]
        
        for c in clausulas:
            elements.append(Paragraph(c, normal_style))
            elements.append(Spacer(1, 0.2*cm))
            
        elements.append(Spacer(1, 2*cm))
        
        # 6. Assinaturas
        elements.append(Paragraph("________________________________________________", ParagraphStyle('Center', alignment=1)))
        elements.append(Paragraph("CM PORT - SISTEMAS DE SEGURANÇA", ParagraphStyle('Center', alignment=1)))
        
        elements.append(Spacer(1, 1*cm))
        
        elements.append(Paragraph("________________________________________________", ParagraphStyle('Center', alignment=1)))
        elements.append(Paragraph(f"CONTRATANTE: {condominio.nome}", ParagraphStyle('Center', alignment=1)))
        
        # 7. Data de Emissão
        elements.append(Spacer(1, 2*cm))
        hoje = datetime.now().strftime('%d de %B de %Y')
        elements.append(Paragraph(f"Emitido em: {hoje}", ParagraphStyle('Right', alignment=2)))
        
        doc.build(elements)
        buffer.seek(0)
        return buffer
