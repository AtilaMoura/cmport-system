"""
Testes do fix: detecção de tipo de NFe via <natOp> + correção de nota.tipo
pelo tipo do CorpoNota já vinculado.

Motivação: uma NFe de série 2 (que hoje força ASSISTENCIA) pode na verdade ser
uma venda de mercadoria (natOp = "Venda de Mercadoria"/"Venda de Produtos
Adquirido de Terceiros") — confirmado contra XML real em
xmls_consultados/nfe/nfe_000000000004870_NFe.xml. O <natOp> passa a ser sinal
mais forte que a série. Além disso, quando o corpo de nota já vinculado tem
tipo divergente do classificado automaticamente, o corpo (mais confiável,
casado por numero_nf+CNPJ) agora corrige nota.tipo.
"""
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from tests.conftest import make_nota_fiscal, make_corpo_nota


# ─── _nat_op_e_produto (função pura) ──────────────────────────────────────────

def test_nat_op_venda_mercadoria_e_produto():
    from app.services.nota_fiscal_service import _nat_op_e_produto
    assert _nat_op_e_produto("Venda de Mercadoria") is True


def test_nat_op_venda_produtos_adquiridos_e_produto():
    from app.services.nota_fiscal_service import _nat_op_e_produto
    assert _nat_op_e_produto("Venda de Produtos Adquirido de Terceiros") is True


def test_nat_op_prestacao_servicos_nao_e_produto():
    from app.services.nota_fiscal_service import _nat_op_e_produto
    assert _nat_op_e_produto("Prestação de Serviços") is False


def test_nat_op_ausente_nao_e_produto():
    from app.services.nota_fiscal_service import _nat_op_e_produto
    assert _nat_op_e_produto(None) is False
    assert _nat_op_e_produto("") is False


# ─── extrair_dados_nfe: natOp tem prioridade sobre série ──────────────────────

_NFE_NS = "http://www.portalfiscal.inf.br/nfe"


def _xml_nfe(nat_op: str, serie: str = "2") -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="{_NFE_NS}">
  <NFe>
    <infNFe>
      <ide>
        <nNF>4870</nNF>
        <serie>{serie}</serie>
        <natOp>{nat_op}</natOp>
        <dhEmi>2026-05-20T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000100</CNPJ>
        <xNome>Fornecedor Teste</xNome>
      </emit>
      <dest>
        <CNPJ>98765432000199</CNPJ>
        <xNome>Condominio Teste</xNome>
      </dest>
      <total>
        <ICMSTot>
          <vNF>1500.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>"""


def _db_sem_configuracao_inter():
    """DB mock cuja query de ConfiguracaoInter retorna lista vazia (não força PRODUTO por CNPJ)."""
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []
    return db


def test_extrair_dados_nfe_natop_produto_sobrepoe_serie_2():
    from app.services.nota_fiscal_service import extrair_dados_nfe
    from app.models.nota_fiscal_model import TipoNota

    xml = _xml_nfe(nat_op="Venda de Mercadoria", serie="2")
    dados = extrair_dados_nfe(xml, _db_sem_configuracao_inter(), tipo_fornecido=None)

    assert dados["tipo"] == TipoNota.PRODUTO


def test_extrair_dados_nfe_sem_natop_produto_serie_2_continua_assistencia():
    from app.services.nota_fiscal_service import extrair_dados_nfe
    from app.models.nota_fiscal_model import TipoNota

    xml = _xml_nfe(nat_op="Prestação de Serviços", serie="2")
    dados = extrair_dados_nfe(xml, _db_sem_configuracao_inter(), tipo_fornecido=None)

    assert dados["tipo"] == TipoNota.ASSISTENCIA


def test_extrair_dados_nfe_tipo_fornecido_ignora_natop():
    """tipo_fornecido explícito continua tendo prioridade máxima (comportamento preexistente)."""
    from app.services.nota_fiscal_service import extrair_dados_nfe
    from app.models.nota_fiscal_model import TipoNota

    xml = _xml_nfe(nat_op="Venda de Mercadoria", serie="2")
    dados = extrair_dados_nfe(xml, _db_sem_configuracao_inter(), tipo_fornecido="ASSISTENCIA")

    assert dados["tipo"] == TipoNota.ASSISTENCIA


# ─── CorpoNotaService._tipo_nota_do_corpo ─────────────────────────────────────

def test_tipo_nota_do_corpo_mapeia_os_tres_tipos():
    from app.services.corpo_nota_service import CorpoNotaService
    from app.models.ciclo_nota_model import TipoNotaCorpo
    from app.models.nota_fiscal_model import TipoNota

    assert CorpoNotaService._tipo_nota_do_corpo(TipoNotaCorpo.MANUTENCAO) == TipoNota.MANUTENCAO
    assert CorpoNotaService._tipo_nota_do_corpo(TipoNotaCorpo.SERVICO) == TipoNota.ASSISTENCIA
    assert CorpoNotaService._tipo_nota_do_corpo(TipoNotaCorpo.PRODUTO) == TipoNota.PRODUTO


# ─── tentar_vincular_por_nota_fiscal: corpo corrige nota.tipo divergente ──────

def test_vincular_por_numero_nf_corrige_tipo_da_nota_pelo_corpo():
    """
    Nota classificada como ASSISTENCIA (ex: NFe série 2 sem natOp de produto),
    mas o único corpo candidato (casado por numero_nf+CNPJ) é do tipo PRODUTO.
    O corpo é o sinal mais confiável — nota.tipo deve ser corrigido para PRODUTO.
    """
    from app.models.nota_fiscal_model import TipoNota
    from app.models.ciclo_nota_model import TipoNotaCorpo

    nota = make_nota_fiscal(
        id=1, numero_nota="42", tipo=TipoNota.ASSISTENCIA,
        condominio_id=1, cnpj_emitente="12345678000100",
        data_vencimento=date(2026, 5, 20),
    )
    corpo = make_corpo_nota(
        id=10, condominio_id=1, tipo_nota=TipoNotaCorpo.PRODUTO,
        numero_nf=42, nota_produto_id=None,
    )

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = nota

    with (
        patch("app.services.corpo_nota_service.CorpoNotaRepository.list_candidatos_por_numero_nf", return_value=[corpo]),
        patch("app.services.corpo_nota_service.CorpoNotaRepository.save", return_value=corpo),
        patch("app.services.corpo_nota_service.CicloNotaRepository.get_by_id", return_value=None),
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        resultado = CorpoNotaService.tentar_vincular_por_nota_fiscal(db, nota_fiscal_id=1)

    assert resultado == []
    assert nota.tipo == TipoNota.PRODUTO
    assert corpo.nota_fiscal_id == nota.id


def test_vincular_por_numero_nf_mantem_tipo_quando_ja_bate():
    """Corpo e nota já concordam em tipo — nota.tipo não deve ser tocado."""
    from app.models.nota_fiscal_model import TipoNota
    from app.models.ciclo_nota_model import TipoNotaCorpo

    nota = make_nota_fiscal(
        id=2, numero_nota="43", tipo=TipoNota.ASSISTENCIA,
        condominio_id=1, cnpj_emitente="12345678000100",
        data_vencimento=date(2026, 5, 20),
    )
    corpo = make_corpo_nota(
        id=11, condominio_id=1, tipo_nota=TipoNotaCorpo.SERVICO,
        numero_nf=43, nota_produto_id=None,
    )

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = nota

    with (
        patch("app.services.corpo_nota_service.CorpoNotaRepository.list_candidatos_por_numero_nf", return_value=[corpo]),
        patch("app.services.corpo_nota_service.CorpoNotaRepository.save", return_value=corpo),
        patch("app.services.corpo_nota_service.CicloNotaRepository.get_by_id", return_value=None),
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        resultado = CorpoNotaService.tentar_vincular_por_nota_fiscal(db, nota_fiscal_id=2)

    assert resultado == []
    assert nota.tipo == TipoNota.ASSISTENCIA
