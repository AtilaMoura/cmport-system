import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from sqlalchemy.orm import Session

from app.repositories.termo_garantia_repository import TermoGarantiaRepository
from app.models.configuracao_model import ConfiguracaoEmpresa

_EXTENSO = {3: "três", 6: "seis", 12: "doze", 24: "vinte e quatro"}
_EMPRESA_FALLBACK = "CMPORT Sistemas Eletrônicos de Segurança"


def _fmt_date(d) -> str:
    return d.strftime('%d/%m/%Y') if d else ""


def _fmt_data_extenso(d) -> str:
    meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
             "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


class TermoGarantiaService:

    @staticmethod
    def gerar_pdf(db: Session, termo_id: int) -> io.BytesIO:
        termo = TermoGarantiaRepository.get_by_id(db, termo_id)
        if not termo:
            raise Exception("Termo de garantia não encontrado")

        servico = termo.servico
        condominio = servico.condominio

        # Nome da empresa
        empresa_obj = db.query(ConfiguracaoEmpresa).first()
        empresa_nome = (empresa_obj.nome if empresa_obj and empresa_obj.nome else _EMPRESA_FALLBACK)

        # Endereço completo
        end = getattr(condominio, 'endereco', None)
        if end:
            partes = [p for p in [end.rua, end.numero, end.bairro, end.cidade] if p]
            endereco_str = ", ".join(partes)
        else:
            endereco_str = ""

        # Número da nota fiscal
        numero_nota = ""
        if getattr(servico, 'nota_fiscal', None):
            numero_nota = servico.nota_fiscal.numero_nota or ""

        numero_os = servico.numero_os or ""
        prazo_extenso = _EXTENSO.get(termo.prazo_meses, str(termo.prazo_meses))

        hoje_str = _fmt_data_extenso(datetime.now())
        data_servico_str = _fmt_date(servico.data_servico)
        data_inicio_str = _fmt_date(termo.data_inicio)
        data_fim_str = _fmt_date(termo.data_fim)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=2.5 * cm, leftMargin=2.5 * cm,
            topMargin=2 * cm, bottomMargin=2 * cm
        )

        normal = ParagraphStyle(
            'Normal2', fontName='Helvetica', fontSize=11, leading=17, spaceAfter=6
        )
        bold_inline = ParagraphStyle(
            'BoldInline', fontName='Helvetica-Bold', fontSize=11, leading=17, spaceAfter=6
        )
        titulo = ParagraphStyle(
            'Titulo', fontName='Helvetica-Bold', fontSize=13, leading=20,
            alignment=TA_CENTER, spaceAfter=14, spaceBefore=8
        )
        right_style = ParagraphStyle(
            'Right2', fontName='Helvetica', fontSize=11, alignment=TA_RIGHT
        )
        center_style = ParagraphStyle(
            'Center2', fontName='Helvetica', fontSize=11, alignment=TA_CENTER, spaceAfter=2
        )
        bullet_style = ParagraphStyle(
            'Bullet', fontName='Helvetica', fontSize=11, leading=16,
            leftIndent=20, spaceAfter=4
        )

        elems = []

        # Cidade e data
        elems.append(Paragraph(f"São Paulo, {hoje_str}", right_style))
        elems.append(Spacer(1, 0.7 * cm))

        # Título
        elems.append(Paragraph("TERMO DE GARANTIA DO PRODUTO / SERVIÇO", titulo))

        # Dados do cliente
        elems.append(Paragraph(f"<b>Cliente:</b> {condominio.nome}", normal))
        elems.append(Paragraph(f"<b>Endereço:</b> {endereco_str}", normal))
        elems.append(Spacer(1, 0.5 * cm))

        # Texto principal
        elems.append(Paragraph(
            f"Pelo presente instrumento, formaliza-se o termo de garantia referente ao "
            f"serviço prestado, consistente em <b>{termo.produto_descricao}</b>, conforme abaixo descrito:",
            normal
        ))
        elems.append(Spacer(1, 0.4 * cm))

        elems.append(Paragraph(f"<b>Data da execução do serviço:</b> {data_servico_str}", normal))
        if numero_nota:
            elems.append(Paragraph(f"<b>Nota Fiscal:</b> nº {numero_nota}", normal))
        if numero_os:
            elems.append(Paragraph(f"<b>Ordem de Serviço:</b> nº {numero_os}", normal))
        elems.append(Spacer(1, 0.5 * cm))

        # Prazo
        elems.append(Paragraph("<b>Prazo de Garantia:</b>", bold_inline))
        elems.append(Paragraph(
            f"A garantia concedida é de {termo.prazo_meses} ({prazo_extenso}) meses, com início "
            f"em {data_inicio_str} e término em {data_fim_str}.",
            normal
        ))
        elems.append(Spacer(1, 0.5 * cm))

        # Condições
        elems.append(Paragraph("<b>Condições da Garantia:</b>", bold_inline))
        elems.append(Paragraph(
            "A presente garantia cobre exclusivamente defeitos decorrentes de falha de "
            "instalação ou do equipamento fornecido, dentro do prazo estabelecido.",
            normal
        ))
        elems.append(Spacer(1, 0.3 * cm))

        elems.append(Paragraph(
            "A garantia será automaticamente cancelada nas seguintes hipóteses:", normal
        ))
        bullets = [
            "Intervenção, manutenção ou reparo realizado por pessoas não autorizadas;",
            "Danos decorrentes de acidentes, quedas ou agentes externos;",
            "Variações de tensão elétrica, sobrecargas ou instalações elétricas inadequadas;",
            "Uso indevido ou em desacordo com as recomendações técnicas;",
            "Qualquer ocorrência imprevisível ou de força maior que comprometa o funcionamento do equipamento.",
        ]
        for b in bullets:
            elems.append(Paragraph(f"• {b}", bullet_style))

        elems.append(Spacer(1, 0.5 * cm))
        elems.append(Paragraph(
            "Sem mais, permanecemos à disposição para quaisquer esclarecimentos.", normal
        ))
        elems.append(Spacer(1, 0.3 * cm))
        elems.append(Paragraph("Atenciosamente,", normal))
        elems.append(Spacer(1, 1.8 * cm))

        # Assinatura
        elems.append(Paragraph("_" * 48, center_style))
        elems.append(Paragraph(empresa_nome, center_style))
        elems.append(Paragraph("André Moreira Rosa", center_style))
        elems.append(Paragraph("Diretor Comercial", center_style))

        doc.build(elems)
        buffer.seek(0)
        return buffer

    @staticmethod
    def montar_descricao_de_orcamento(db: Session, orcamento_id: int) -> str:
        """Formata '3x PRODUTO_X · 1x SERVICO_Y' a partir dos itens do orçamento local."""
        from app.repositories.orcamento_repository import OrcamentoRepository
        orc = OrcamentoRepository.get_by_id(db, orcamento_id)
        if not orc or not orc.itens:
            return ""
        partes = []
        for item in orc.itens:
            nome = item.nome or f"Item #{item.id}"
            qtd = item.quantidade or 1
            qtd_fmt = int(qtd) if qtd == int(qtd) else qtd
            partes.append(f"{qtd_fmt}x {nome}")
        return " · ".join(partes)
