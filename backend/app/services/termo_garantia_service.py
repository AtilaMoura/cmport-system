import base64
import io
import os
from datetime import datetime
from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session

from app.repositories.termo_garantia_repository import TermoGarantiaRepository
from app.models.configuracao_model import ConfiguracaoEmpresa

_EXTENSO = {3: "três", 6: "seis", 12: "doze", 24: "vinte e quatro"}
_EMPRESA_FALLBACK = "CMPORT Sistemas Eletrônicos de Segurança"
_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
_TIMBRADO_PATH = os.path.join(_ASSETS_DIR, "timbrado.png")
_ASSINATURA_PATH = os.path.join(_ASSETS_DIR, "assinatura_andre.png")
_JINJA_ENV = Environment(loader=FileSystemLoader(_ASSETS_DIR), autoescape=False)


def _fmt_date(d) -> str:
    return d.strftime('%d/%m/%Y') if d else ""


def _fmt_numero_nota(numero_raw: str, tipo_servico) -> str:
    import re
    clean = str(numero_raw).strip().replace('.', '')
    m = re.match(r'^(\d+)', clean)
    if not m:
        return numero_raw
    num = int(m.group(1))
    digits = f"{num:09d}"
    formatted = f"{digits[0:3]}.{digits[3:6]}.{digits[6:9]}"
    valor_tipo = getattr(tipo_servico, 'value', str(tipo_servico)).lower()
    sufixo = '-A' if valor_tipo == 'assistencia' else '-M'
    return f"{formatted}{sufixo}"


def _fmt_data_extenso(d) -> str:
    meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
             "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


def _b64_file(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def _build_context(db: Session, termo_id: int) -> dict:
    termo = TermoGarantiaRepository.get_by_id(db, termo_id)
    if not termo:
        raise Exception("Termo de garantia não encontrado")

    servico = termo.servico
    condominio = servico.condominio

    empresa_obj = db.query(ConfiguracaoEmpresa).first()
    empresa_nome = empresa_obj.nome if empresa_obj and empresa_obj.nome else _EMPRESA_FALLBACK

    end = getattr(condominio, 'endereco', None)
    if end:
        partes = [p for p in [end.rua, end.numero, end.bairro, end.cidade] if p]
        endereco_str = ", ".join(partes)
    else:
        endereco_str = ""

    numero_nota_fmt = ""
    if getattr(servico, 'nota_fiscal', None):
        numero_nota = servico.nota_fiscal.numero_nota or ""
        if numero_nota:
            numero_nota_fmt = _fmt_numero_nota(numero_nota, servico.tipo)

    numero_os = servico.numero_os or ""
    prazo_extenso = _EXTENSO.get(termo.prazo_meses, str(termo.prazo_meses))
    prazo_fmt = f"{termo.prazo_meses:02d} ({prazo_extenso})"

    produto_desc = termo.produto_descricao or ""
    if not produto_desc:
        if getattr(servico, 'ordem_servico', None):
            produto_desc = servico.ordem_servico.report or ""

    # Serviço nascido de Recibo pode não ter condomínio — usa nome do cliente do recibo.
    if condominio:
        cliente_nome = condominio.nome
    elif getattr(servico, 'recibo', None):
        recibo = servico.recibo
        cliente_nome = recibo.cliente.nome if recibo.cliente_id and recibo.cliente else (recibo.cliente_nome_avulso or "Cliente")
    else:
        cliente_nome = "Cliente"

    return {
        "data_hoje":         f"São Paulo, {_fmt_data_extenso(datetime.now())}",
        "cliente_nome":      cliente_nome,
        "cliente_endereco":  endereco_str,
        "produto_descricao": produto_desc,
        "data_servico":      _fmt_date(servico.data_servico),
        "numero_nota":       numero_nota_fmt,
        "numero_os":         numero_os,
        "prazo_fmt":         prazo_fmt,
        "data_inicio":       _fmt_date(termo.data_inicio),
        "data_fim":          _fmt_date(termo.data_fim),
        "empresa_nome":      empresa_nome,
        "timbrado_b64":      _b64_file(_TIMBRADO_PATH),
        "assinatura_src":    f"data:image/png;base64,{_b64_file(_ASSINATURA_PATH)}",
    }


class TermoGarantiaService:

    @staticmethod
    def gerar_html_preview(db: Session, termo_id: int) -> str:
        context = _build_context(db, termo_id)
        tpl = _JINJA_ENV.get_template("termo_garantia_template.html")
        return tpl.render(**context)

    @staticmethod
    def gerar_pdf(db: Session, termo_id: int) -> io.BytesIO:
        from weasyprint import HTML
        termo_check = TermoGarantiaRepository.get_by_id(db, termo_id)
        if not termo_check or not termo_check.data_inicio:
            raise ValueError("Termo com data de execução pendente — preencha a data para gerar o PDF")
        context = _build_context(db, termo_id)
        context["assinatura_src"] = "assinatura_andre.png"
        tpl = _JINJA_ENV.get_template("termo_garantia_template.html")
        html_str = tpl.render(**context)
        base_url = f"file://{os.path.abspath(_ASSETS_DIR)}/"
        pdf_bytes = HTML(string=html_str, base_url=base_url).write_pdf()
        return io.BytesIO(pdf_bytes)

    @staticmethod
    def montar_descricao_de_orcamento(db: Session, orcamento_id: int) -> str:
        """Formata '3x PRODUTO_X · 1x PRODUTO_Y' — apenas itens do tipo PRODUTO."""
        from app.repositories.orcamento_repository import OrcamentoRepository
        from app.models.orcamento_model import TipoItemOrcamento
        orc = OrcamentoRepository.get_by_id(db, orcamento_id)
        if not orc or not orc.itens:
            return ""
        partes = []
        for item in orc.itens:
            if item.tipo != TipoItemOrcamento.PRODUTO:
                continue
            nome = item.nome or f"Item #{item.id}"
            qtd = item.quantidade or 1
            qtd_fmt = int(qtd) if qtd == int(qtd) else qtd
            partes.append(f"{qtd_fmt}x {nome}")
        return " · ".join(partes)
