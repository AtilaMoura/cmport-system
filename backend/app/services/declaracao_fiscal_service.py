import base64
import io
import os
import re
from datetime import datetime

from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session

from app.models.configuracao_model import ConfiguracaoEmpresa, ConfiguracaoInter

_EMPRESA_FALLBACK = "CMPORT TEC Sistemas de Eletrônicos de Segurança LTDA"
_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
_TIMBRADO_PATH = os.path.join(_ASSETS_DIR, "timbrado.png")
_ASSINATURA_PATH = os.path.join(_ASSETS_DIR, "assinatura_andre.png")
_JINJA_ENV = Environment(loader=FileSystemLoader(_ASSETS_DIR), autoescape=False)


def _fmt_data_extenso(d) -> str:
    meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
             "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    return f"São Paulo, {d.day} de {meses[d.month - 1]} de {d.year}"


def _b64_file(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def _fmt_cnpj(cnpj_raw: str) -> str:
    """Formata string de dígitos como XX.XXX.XXX/XXXX-XX."""
    digits = re.sub(r'\D', '', cnpj_raw or "")
    if len(digits) != 14:
        return cnpj_raw
    return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"


def _fmt_numero_nota_simples(numero_raw: str, tipo_servico) -> tuple[str, str]:
    """Retorna (numero_formatado, numero_simples): ex. ('00024-M', '0024 M')."""
    clean = str(numero_raw).strip().replace('.', '')
    m = re.match(r'^(\d+)', clean)
    if not m:
        return numero_raw, numero_raw
    num = int(m.group(1))
    valor_tipo = getattr(tipo_servico, 'value', str(tipo_servico)).lower()
    sufixo = 'M' if valor_tipo != 'assistencia' else 'A'
    formatado = f"{num:05d}-{sufixo}"
    simples = f"{num:04d} {sufixo}"
    return formatado, simples


def _build_context(db: Session, servico_id: int) -> dict:
    from app.models.servico_model import ManutencaoAssistencia
    servico = db.query(ManutencaoAssistencia).filter_by(id=servico_id).first()
    if not servico:
        raise ValueError(f"Serviço #{servico_id} não encontrado")

    if not getattr(servico, 'nota_fiscal', None):
        raise ValueError("Serviço não possui nota fiscal vinculada — declaração não disponível")

    condominio = servico.condominio
    nota = servico.nota_fiscal

    empresa_obj = db.query(ConfiguracaoEmpresa).first()

    # Descobre o ConfiguracaoInter correto pela cadeia: nota → corpo_nota → configuracao_inter
    inter = None
    if getattr(nota, 'corpo_nota_id', None):
        from app.models.corpo_nota_model import CorpoNota
        corpo = db.query(CorpoNota).filter_by(id=nota.corpo_nota_id).first()
        if corpo and corpo.configuracao_inter_id:
            inter = db.query(ConfiguracaoInter).filter_by(id=corpo.configuracao_inter_id).first()

    # Fallback: cnpj_emitente da NF → match na tabela
    if inter is None and getattr(nota, 'cnpj_emitente', None):
        cnpj_raw = re.sub(r'\D', '', nota.cnpj_emitente)
        for ci in db.query(ConfiguracaoInter).all():
            if re.sub(r'\D', '', ci.cnpj) == cnpj_raw:
                inter = ci
                break

    # Último fallback: primeiro registro
    if inter is None:
        inter = db.query(ConfiguracaoInter).first()

    empresa_cnpj = _fmt_cnpj(inter.cnpj) if inter and inter.cnpj else ""
    empresa_nome_razao = (
        (inter.razao_social if inter and inter.razao_social else None)
        or (empresa_obj.nome if empresa_obj and empresa_obj.nome else _EMPRESA_FALLBACK)
    )
    empresa_sede = (
        getattr(empresa_obj, 'endereco_fiscal', None) or ""
        if empresa_obj else ""
    )
    empresa_nome_display = empresa_obj.nome if empresa_obj and empresa_obj.nome else _EMPRESA_FALLBACK

    numero_fmt, numero_simples = _fmt_numero_nota_simples(nota.numero_nota or "", servico.tipo)

    return {
        "data_hoje":             _fmt_data_extenso(datetime.now()),
        "cliente_nome":          condominio.nome,
        "numero_nota":           numero_fmt,
        "numero_nota_simples":   numero_simples,
        "empresa_nome":          empresa_nome_display,
        "empresa_nome_completo": empresa_nome_razao,
        "empresa_sede":          empresa_sede,
        "empresa_cnpj":          empresa_cnpj,
        "timbrado_b64":          _b64_file(_TIMBRADO_PATH),
        "assinatura_src":        f"data:image/png;base64,{_b64_file(_ASSINATURA_PATH)}",
    }


class DeclaracaoFiscalService:

    @staticmethod
    def gerar(db: Session, servico_id: int, tipo: str):
        """Valida que o serviço tem nota e registra/atualiza o registro no DB."""
        _build_context(db, servico_id)  # levanta ValueError se inválido
        from app.repositories.declaracao_fiscal_repository import DeclaracaoFiscalRepository
        return DeclaracaoFiscalRepository.criar_ou_atualizar(db, servico_id, tipo)

    @staticmethod
    def remover(db: Session, servico_id: int, tipo: str) -> bool:
        from app.repositories.declaracao_fiscal_repository import DeclaracaoFiscalRepository
        return DeclaracaoFiscalRepository.deletar(db, servico_id, tipo)

    @staticmethod
    def gerar_html_preview(db: Session, servico_id: int, tipo: str) -> str:
        """tipo: 'inss' | 'simples'"""
        context = _build_context(db, servico_id)
        template_name = f"declaracao_{tipo}_template.html"
        tpl = _JINJA_ENV.get_template(template_name)
        return tpl.render(**context)

    @staticmethod
    def gerar_pdf(db: Session, servico_id: int, tipo: str) -> io.BytesIO:
        """tipo: 'inss' | 'simples'"""
        from weasyprint import HTML
        context = _build_context(db, servico_id)
        context["assinatura_src"] = "assinatura_andre.png"
        template_name = f"declaracao_{tipo}_template.html"
        tpl = _JINJA_ENV.get_template(template_name)
        html_str = tpl.render(**context)
        base_url = f"file://{os.path.abspath(_ASSETS_DIR)}/"
        pdf_bytes = HTML(string=html_str, base_url=base_url).write_pdf()
        return io.BytesIO(pdf_bytes)
