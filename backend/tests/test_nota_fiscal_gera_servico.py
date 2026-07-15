"""
Testes de baseline — comportamento ATUAL do serviço (ManutencaoAssistencia) gerado
a partir da importação de Nota Fiscal (NotaFiscalService.importar_xmls), antes da
refatoração do fluxo de Recibo (ver Refatoracao.md).

Cobre o trecho de app/services/nota_fiscal_service.py (dentro do loop de importação):

    if dados_nota['condominio_id'] and dados_nota['tipo'] in [TipoNota.ASSISTENCIA, TipoNota.MANUTENCAO]:
        servico = ServicoCreate(condominio_id=..., tipo=..., data_servico=..., descricao=...,
                                 nota_fiscal_id=db_nota.id, numero_os=...)
        ServicoService.create_servico(db, servico)

Estes testes NÃO podem mudar de resultado depois da refatoração do recibo — são o
baseline de regressão (Passo 4 do Refatoracao.md: rodar de novo e comparar).
"""
import asyncio
from datetime import date
from unittest.mock import MagicMock, patch

import pytest


# ─── helpers ─────────────────────────────────────────────────────────────────

def _upload_file_mock(filename="nota.xml", content=b"<xml/>"):
    f = MagicMock()
    f.filename = filename

    async def _read():
        return content

    f.read = _read
    return f


def _dados_nota_base(**overrides):
    from app.models.nota_fiscal_model import TipoNota, StatusNota

    dados = {
        'numero_nota': '7999',
        'tipo': TipoNota.ASSISTENCIA,
        'status': StatusNota.AUTORIZADA,
        'parcelas': 1,
        'valor': 500.0,
        'valor_boleto_parcela': 500.0,
        'parcelas_json': None,
        'data_vencimento': date(2026, 3, 10),
        'data_emissao': date(2026, 3, 1),
        'data_servico': date(2026, 3, 1),
        'numero_os': '12345',
        'cliente_nome': 'Condominio Teste',
        'cnpj_emitente': '12345678000100',
        'observacao': 'Emitente: X | CNPJ: Y',
        'descricao_servico': 'Servico de assistencia',
        'condominio_id': 42,
        '_aviso': None,
        'xml_original': '<xml/>',
        'iss': None, 'pis': None, 'cofins': None, 'inss': None, 'csll': None,
    }
    dados.update(overrides)
    return dados


def _run_import(db, dados_nota, storage=None):
    from app.services.nota_fiscal_service import NotaFiscalService

    db_nota_mock = MagicMock()
    db_nota_mock.id = 555
    db_nota_mock.numero_nota = dados_nota['numero_nota']
    db_nota_mock.corpo_nota_id = None
    db_nota_mock.pdf_object_key = None

    with (
        patch("app.services.nota_fiscal_service.detectar_tipo_xml", return_value="NFSe"),
        patch("app.services.nota_fiscal_service.extrair_dados_nfse", return_value=dict(dados_nota)),
        patch("app.services.nota_fiscal_service.NotaFiscalRepository.get_by_numero", return_value=None),
        patch("app.services.nota_fiscal_service.NotaFiscalRepository.create_importada", return_value=db_nota_mock),
        patch("app.services.nota_fiscal_service._validar_impostos_vs_config"),
        patch("app.services.corpo_nota_service.CorpoNotaService.tentar_vincular_por_nota_fiscal", return_value=None),
        patch("app.services.servico_service.ServicoService.create_servico") as mock_create_servico,
    ):
        files = [_upload_file_mock()]
        resultado = asyncio.run(NotaFiscalService.importar_xmls(db, files, None, storage))

    return resultado, mock_create_servico, db_nota_mock


def _db_mock():
    return MagicMock()


# ─── 1. ASSISTENCIA + condomínio → cria serviço ──────────────────────────────

def test_nota_assistencia_com_condominio_cria_servico():
    dados = _dados_nota_base()
    resultado, mock_create_servico, db_nota = _run_import(_db_mock(), dados)

    assert resultado["processados"] == 1
    assert resultado["erros"] == []
    mock_create_servico.assert_called_once()

    args, _ = mock_create_servico.call_args
    servico = args[1]
    assert servico.condominio_id == 42
    assert servico.tipo.value == "assistencia"
    assert servico.nota_fiscal_id == 555
    assert servico.numero_os == "12345"
    assert servico.data_servico == date(2026, 3, 1)
    assert servico.descricao == "Servico de assistencia"


# ─── 2. MANUTENCAO + condomínio → cria serviço (tipo correto) ────────────────

def test_nota_manutencao_com_condominio_cria_servico():
    from app.models.nota_fiscal_model import TipoNota

    dados = _dados_nota_base(tipo=TipoNota.MANUTENCAO, numero_nota="8000")
    resultado, mock_create_servico, db_nota = _run_import(_db_mock(), dados)

    assert resultado["processados"] == 1
    mock_create_servico.assert_called_once()

    args, _ = mock_create_servico.call_args
    servico = args[1]
    assert servico.tipo.value == "manutencao"
    assert servico.condominio_id == 42


# ─── 3. PRODUTO → NÃO cria serviço ───────────────────────────────────────────

def test_nota_produto_nao_cria_servico():
    from app.models.nota_fiscal_model import TipoNota

    dados = _dados_nota_base(tipo=TipoNota.PRODUTO, numero_nota="8001")
    resultado, mock_create_servico, db_nota = _run_import(_db_mock(), dados)

    assert resultado["processados"] == 1
    mock_create_servico.assert_not_called()


# ─── 4. Sem condomínio → NÃO cria serviço, mesmo sendo ASSISTENCIA/MANUTENCAO ─

def test_nota_sem_condominio_nao_cria_servico():
    dados = _dados_nota_base(condominio_id=None, numero_nota="8002")
    resultado, mock_create_servico, db_nota = _run_import(_db_mock(), dados)

    assert resultado["processados"] == 1
    mock_create_servico.assert_not_called()


# ─── 5. numero_os ausente no XML → repassado como None, sem erro ────────────

def test_nota_sem_numero_os_repassa_none_sem_erro():
    dados = _dados_nota_base(numero_os=None, numero_nota="8003")
    resultado, mock_create_servico, db_nota = _run_import(_db_mock(), dados)

    assert resultado["processados"] == 1
    assert resultado["erros"] == []
    mock_create_servico.assert_called_once()

    args, _ = mock_create_servico.call_args
    servico = args[1]
    assert servico.numero_os is None
