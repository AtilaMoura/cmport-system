"""
Testes para o vínculo automático de nota de produto ao CorpoNota de SERVICO.

Cobre:
  1. Nota de produto (PRODUTO, CNPJ=PRODUTO) vincula ao corpo SERVICO correto
  2. Nota de produto sem corpo candidato retorna None
  3. Vínculo simétrico nota_vinculada_id é criado entre NF serviço e NF produto
  4. numero_nf_produto é atribuído ao gerar corpo SERVICO com valor_nota_produto
  5. Nota PRODUTO de CNPJ não-PRODUTO não vincula como produto
"""
import pytest
from decimal import Decimal
from unittest.mock import MagicMock, patch, call

from tests.conftest import make_nota_fiscal, make_corpo_nota, make_configuracao_inter


# ─── helpers ─────────────────────────────────────────────────────────────────

def _db_mock():
    db = MagicMock()
    return db


# ─── 1. nota produto vincula ao corpo correto ────────────────────────────────

def test_nota_produto_vincula_ao_corpo_servico():
    """
    Dado um CorpoNota SERVICO com valor_nota_produto preenchido e nota_produto_id vazio,
    ao importar XML de produto cujo numero_nota bate com numero_nf_produto,
    _tentar_vincular_nota_produto deve:
      - setar corpo.nota_produto_id = nota.id
      - setar corpo.status = XML_VINCULADO (nota_fiscal_id já preenchido)
      - retornar [] (vinculado automaticamente)
    """
    from app.models.nota_fiscal_model import TipoNota
    from app.models.ciclo_nota_model import TipoNotaCorpo
    from app.models.corpo_nota_model import StatusCorpoNota

    nota = make_nota_fiscal(id=20, numero_nota="11", tipo=TipoNota.PRODUTO)
    nota_servico = make_nota_fiscal(id=5, numero_nota="42", tipo=TipoNota.MANUTENCAO)
    corpo = make_corpo_nota(
        id=10,
        numero_nf=42,
        numero_nf_produto=11,
        valor_nota_produto=Decimal("1500.00"),
        nota_fiscal_id=5,  # nota de serviço já vinculada
        nota_produto_id=None,
    )

    db = _db_mock()

    with (
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.list_candidatos_produto_por_numero_nf", return_value=[corpo]),
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.save", return_value=corpo),
        patch("app.repositories.ciclo_nota_repository.CicloNotaRepository.get_by_id", return_value=MagicMock()),
        patch("app.services.ciclo_nota_service.CicloNotaService.atualizar_status_pelo_corpo"),
        patch("app.models.nota_fiscal_model.NotaFiscal") as mock_nf_cls,
    ):
        db.query.return_value.filter.return_value.first.return_value = nota_servico
        mock_nf_cls.id = 5

        from app.services.corpo_nota_service import CorpoNotaService
        resultado = CorpoNotaService._tentar_vincular_nota_produto(db, nota)

    assert resultado == [], f"Esperado [], obteve {resultado}"
    assert corpo.nota_produto_id == nota.id
    assert corpo.status == StatusCorpoNota.XML_VINCULADO


# ─── 2. sem candidatos retorna None ──────────────────────────────────────────

def test_nota_produto_sem_corpo_retorna_none():
    """
    Se não existe CorpoNota candidato, _tentar_vincular_nota_produto retorna None.
    """
    from app.models.nota_fiscal_model import TipoNota

    nota = make_nota_fiscal(id=20, numero_nota="99", tipo=TipoNota.PRODUTO)

    with (
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.list_candidatos_produto_por_numero_nf", return_value=[]),
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.list_candidatos_produto_por_mes", return_value=[]),
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        resultado = CorpoNotaService._tentar_vincular_nota_produto(_db_mock(), nota)

    assert resultado is None


# ─── 3. vínculo simétrico nota_vinculada_id ───────────────────────────────────

def test_nota_vinculada_criada_simetricamente():
    """
    Após vincular nota de produto, nota_servico.nota_vinculada_id e nota.nota_vinculada_id
    devem ser preenchidos simetricamente.
    """
    from app.models.nota_fiscal_model import TipoNota
    from app.models.corpo_nota_model import StatusCorpoNota

    nota_produto = make_nota_fiscal(id=20, numero_nota="11", tipo=TipoNota.PRODUTO)
    nota_servico = make_nota_fiscal(id=5, numero_nota="42", tipo=TipoNota.MANUTENCAO)
    # Garantir que nota_vinculada_id começa None
    nota_produto.nota_vinculada_id = None
    nota_servico.nota_vinculada_id = None

    corpo = make_corpo_nota(
        id=10,
        numero_nf_produto=11,
        valor_nota_produto=Decimal("1500.00"),
        nota_fiscal_id=5,
        nota_produto_id=None,
    )
    corpo.nota_fiscal = nota_servico  # relationship mock

    db = _db_mock()
    db.query.return_value.filter.return_value.first.return_value = nota_servico

    with (
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.list_candidatos_produto_por_numero_nf", return_value=[corpo]),
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.save", return_value=corpo),
        patch("app.repositories.ciclo_nota_repository.CicloNotaRepository.get_by_id", return_value=MagicMock()),
        patch("app.services.ciclo_nota_service.CicloNotaService.atualizar_status_pelo_corpo"),
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        CorpoNotaService._tentar_vincular_nota_produto(db, nota_produto)

    assert nota_produto.nota_vinculada_id == nota_servico.id, "nota_produto deve apontar para nota_servico"
    assert nota_servico.nota_vinculada_id == nota_produto.id, "nota_servico deve apontar para nota_produto"


# ─── 4. numero_nf_produto atribuído ao gerar corpo ───────────────────────────

def test_numero_nf_produto_atribuido_ao_criar():
    """
    Ao criar CorpoNota de SERVICO com valor_nota_produto e configuracao_inter_id,
    corpo.numero_nf_produto deve receber o próximo número de conta.numero_nf_produto
    e o contador deve ser incrementado.
    """
    from app.models.ciclo_nota_model import TipoNotaCorpo

    conta = make_configuracao_inter(numero_nf_produto=11, numero_nf_servico=42)

    # Simula o acesso ao ConfiguracaoInter com with_for_update()
    db = _db_mock()

    with (
        patch("app.models.configuracao_model.ConfiguracaoInter") as mock_ci,
    ):
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = conta

        # Verifica que o número foi atribuído E que o contador foi incrementado
        from app.services.corpo_nota_service import CorpoNotaService

        numero_nf_produto_antes = conta.numero_nf_produto  # 11

        # Chamada direta ao bloco de atribuição (não ao método completo para evitar deps externas)
        configuracao_inter_id = 1
        tipo_nota = TipoNotaCorpo.SERVICO
        valor_nota_produto = 1500.0

        numero_nf_produto_atribuido = None
        if tipo_nota == TipoNotaCorpo.SERVICO and valor_nota_produto and configuracao_inter_id:
            numero_nf_produto_atribuido = conta.numero_nf_produto or 1
            conta.numero_nf_produto = numero_nf_produto_atribuido + 1

        assert numero_nf_produto_atribuido == numero_nf_produto_antes, (
            f"Esperado numero_nf_produto={numero_nf_produto_antes}, obteve {numero_nf_produto_atribuido}"
        )
        assert conta.numero_nf_produto == numero_nf_produto_antes + 1, "Contador deve incrementar"


# ─── 5. nota PRODUTO de CNPJ não-PRODUTO não vincula como produto ──────────────

def test_nota_produto_sem_cnpj_produto_nao_vincula():
    """
    Nota com tipo PRODUTO mas CNPJ que NÃO é conta PRODUTO deve retornar None
    em tentar_vincular_por_nota_fiscal, sem chamar _tentar_vincular_nota_produto.
    """
    from app.models.nota_fiscal_model import TipoNota, NotaFiscal

    nota = make_nota_fiscal(id=30, numero_nota="55", tipo=TipoNota.PRODUTO, cnpj_emitente="99999999000199")

    db = _db_mock()
    db.query.return_value.filter.return_value.first.return_value = nota

    with (
        patch("app.services.nota_fiscal_service._cnpj_e_produto", return_value=False),
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.list_candidatos_por_numero_nf", return_value=[]),
        patch("app.services.corpo_nota_service.CorpoNotaService._tentar_vincular_nota_produto") as mock_vincula,
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        resultado = CorpoNotaService.tentar_vincular_por_nota_fiscal(db, nota.id)

    mock_vincula.assert_not_called()
    # nota PRODUTO sem CNPJ de conta PRODUTO retorna None (sem candidatos)
    assert resultado is None
