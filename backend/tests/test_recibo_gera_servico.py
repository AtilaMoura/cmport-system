"""
Testes do comportamento: Recibo ENTRADA gera serviço (ManutencaoAssistencia, opcional via
gerar_servico, default true); Recibo SAIDA nunca gera serviço, gera despesa em
fin_movimentacoes quando pago. Ver Refatoracao.md — "Recibo: parcelas + ENTRADA gera
serviço + SAÍDA gera despesa".

Cobre:
  1. ENTRADA + cliente vinculado a condomínio existente -> serviço com condominio_id preenchido
  2. ENTRADA + cliente externo sem condomínio -> serviço com condominio_id=None, sem erro
  3. ENTRADA + nome avulso (sem cliente cadastrado) -> serviço criado, descrição usa nome avulso
  4. ENTRADA + numero_os + condomínio -> reaproveita OS existente, sem duplicar
  5. SAIDA pendente (ainda não paga) -> nenhuma despesa criada ainda, nenhum serviço nunca
  6. SAIDA já paga na criação -> cria despesa em fin_movimentacoes (nunca serviço)
  7. Termo de Garantia para serviço sem condomínio -> não quebra, usa nome do cliente do recibo
"""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest


# ─── helpers ─────────────────────────────────────────────────────────────────

def _db_mock():
    return MagicMock()


def _patches(create_side_effect):
    return (
        patch("app.repositories.recibo_repository.ReciboRepository.proximo_numero", return_value="REC-2026-100"),
        patch("app.repositories.recibo_repository.ReciboRepository.get_by_numero", return_value=None),
        patch("app.repositories.recibo_repository.ReciboRepository.create", side_effect=create_side_effect),
    )


def _cliente_mock(id_, nome, condominio_id=None):
    c = MagicMock()
    c.id = id_
    c.nome = nome
    c.condominio_id = condominio_id
    return c


# ─── 1. ENTRADA + cliente vinculado a condomínio existente ───────────────────

def test_entrada_cliente_vinculado_condominio_gera_servico():
    from app.schemas.recibo_schema import ReciboCreate
    from app.services.recibo_service import ReciboService
    from app.models.servico_model import ManutencaoAssistencia

    cliente = _cliente_mock(10, "Joao Sindico", condominio_id=42)
    db = _db_mock()
    db.get.return_value = cliente
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

    def _create(db_arg, recibo_obj):
        recibo_obj.id = 900
        recibo_obj.cliente = cliente
        return recibo_obj

    p1, p2, p3 = _patches(_create)
    with p1, p2, p3:
        payload = ReciboCreate(
            tipo="ENTRADA", cliente_id=10, descricao_servico="Assistencia tecnica",
            valor=250.0, data_emissao=date(2026, 3, 5),
        )
        ReciboService.criar(db, payload)

    db.add.assert_called_once()
    servico = db.add.call_args[0][0]
    assert isinstance(servico, ManutencaoAssistencia)
    assert servico.condominio_id == 42
    assert servico.recibo_id == 900
    assert servico.tipo.value == "assistencia"


# ─── 2. ENTRADA + cliente externo sem condomínio ─────────────────────────────

def test_entrada_cliente_externo_sem_condominio_gera_servico_sem_condominio():
    from app.schemas.recibo_schema import ReciboCreate
    from app.services.recibo_service import ReciboService

    cliente = _cliente_mock(11, "Cliente Externo LTDA", condominio_id=None)
    db = _db_mock()
    db.get.return_value = cliente

    def _create(db_arg, recibo_obj):
        recibo_obj.id = 901
        recibo_obj.cliente = cliente
        return recibo_obj

    p1, p2, p3 = _patches(_create)
    with p1, p2, p3:
        payload = ReciboCreate(
            tipo="ENTRADA", cliente_id=11, descricao_servico="Manutencao pontual",
            valor=180.0, data_emissao=date(2026, 3, 6),
        )
        ReciboService.criar(db, payload)

    db.add.assert_called_once()
    servico = db.add.call_args[0][0]
    assert servico.condominio_id is None
    assert servico.recibo_id == 901


# ─── 3. ENTRADA + nome avulso (sem cliente cadastrado) ───────────────────────

def test_entrada_nome_avulso_gera_servico():
    from app.schemas.recibo_schema import ReciboCreate
    from app.services.recibo_service import ReciboService

    db = _db_mock()

    def _create(db_arg, recibo_obj):
        recibo_obj.id = 902
        recibo_obj.cliente = None
        return recibo_obj

    p1, p2, p3 = _patches(_create)
    with p1, p2, p3:
        payload = ReciboCreate(
            tipo="ENTRADA", cliente_nome_avulso="Maria da Silva", descricao_servico="Reparo avulso",
            valor=90.0, data_emissao=date(2026, 3, 7),
        )
        ReciboService.criar(db, payload)

    db.add.assert_called_once()
    servico = db.add.call_args[0][0]
    assert servico.condominio_id is None
    assert "Maria da Silva" in servico.descricao


# ─── 4. ENTRADA + numero_os + condomínio → reaproveita OS existente ──────────

def test_entrada_com_numero_os_reaproveita_os_existente():
    from app.schemas.recibo_schema import ReciboCreate
    from app.services.recibo_service import ReciboService

    cliente = _cliente_mock(12, "Sindico X", condominio_id=42)
    db = _db_mock()
    db.get.return_value = cliente

    servico_existente = MagicMock()
    servico_existente.recibo_id = None
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = servico_existente

    def _create(db_arg, recibo_obj):
        recibo_obj.id = 903
        recibo_obj.cliente = cliente
        return recibo_obj

    p1, p2, p3 = _patches(_create)
    with p1, p2, p3:
        payload = ReciboCreate(
            tipo="ENTRADA", cliente_id=12, numero_os="55555", descricao_servico="Assistencia com OS",
            valor=300.0, data_emissao=date(2026, 3, 8),
        )
        ReciboService.criar(db, payload)

    db.add.assert_not_called()
    assert servico_existente.recibo_id == 903


def _db_get_dispatch(cliente=None, categoria=None):
    """db.get(Model, id) precisa devolver coisas diferentes conforme o Model —
    Cliente pra resolver condominio_id, CategoriaFinanceira pra validar categoria_id."""
    from app.models.cliente_model import Cliente
    from app.models.fin_categoria_model import CategoriaFinanceira

    def _get(model, id_):
        if model is Cliente:
            return cliente
        if model is CategoriaFinanceira:
            return categoria
        return None
    return _get


# ─── 5. SAIDA pendente → nenhuma despesa ainda, nenhum serviço nunca ─────────

def test_saida_pendente_nao_gera_despesa_nem_servico():
    from app.schemas.recibo_schema import ReciboCreate
    from app.services.recibo_service import ReciboService

    cliente = _cliente_mock(13, "Fornecedor Y", condominio_id=None)
    categoria = MagicMock(grupo="DESPESA")
    db = _db_mock()
    db.get.side_effect = _db_get_dispatch(cliente=cliente, categoria=categoria)

    def _create(db_arg, recibo_obj):
        recibo_obj.id = 904
        recibo_obj.cliente = cliente
        return recibo_obj

    p1, p2, p3 = _patches(_create)
    with p1, p2, p3:
        payload = ReciboCreate(
            tipo="SAIDA", cliente_id=13, categoria_id=30, descricao_servico="Pagamento subcontratado",
            valor=500.0, data_emissao=date(2026, 3, 9),  # status default PENDENTE
        )
        ReciboService.criar(db, payload)

    db.add.assert_not_called()  # nem serviço (nunca), nem despesa (ainda não foi paga)


# ─── 6. SAIDA já paga na criação → cria despesa em fin_movimentacoes ─────────

def test_saida_paga_gera_despesa_nao_servico():
    from app.schemas.recibo_schema import ReciboCreate
    from app.services.recibo_service import ReciboService
    from app.models.fin_movimentacao_model import MovimentacaoFinanceira

    cliente = _cliente_mock(14, "Fornecedor Z", condominio_id=42)
    categoria = MagicMock(grupo="DESPESA")
    db = _db_mock()
    db.get.side_effect = _db_get_dispatch(cliente=cliente, categoria=categoria)
    db.query.return_value.filter.return_value.first.return_value = None  # nenhuma despesa prévia

    def _create(db_arg, recibo_obj):
        recibo_obj.id = 905
        recibo_obj.cliente = cliente
        return recibo_obj

    p1, p2, p3 = _patches(_create)
    with p1, p2, p3:
        payload = ReciboCreate(
            tipo="SAIDA", cliente_id=14, categoria_id=30, status="PAGO",
            data_pagamento=date(2026, 3, 10), descricao_servico="Pagamento com controle",
            valor=700.0, data_emissao=date(2026, 3, 10),
        )
        ReciboService.criar(db, payload)

    db.add.assert_called_once()
    despesa = db.add.call_args[0][0]
    assert isinstance(despesa, MovimentacaoFinanceira)
    assert despesa.tipo == "SAIDA"
    assert despesa.valor == 700.0
    assert despesa.recibo_id == 905
    assert despesa.categoria_id == 30


def test_saida_sem_categoria_id_rejeitada():
    from app.schemas.recibo_schema import ReciboCreate
    from app.services.recibo_service import ReciboService
    from fastapi import HTTPException

    db = _db_mock()
    payload = ReciboCreate(
        tipo="SAIDA", cliente_nome_avulso="Fornecedor sem categoria",
        descricao_servico="Pagamento", valor=100.0, data_emissao=date(2026, 3, 11),
    )
    with pytest.raises(HTTPException) as exc_info:
        ReciboService.criar(db, payload)
    assert exc_info.value.status_code == 422


# ─── 7. Termo de Garantia para serviço sem condomínio → usa nome do cliente ──

def test_termo_garantia_servico_sem_condominio_usa_nome_cliente():
    from app.services.termo_garantia_service import _build_context

    recibo_mock = MagicMock()
    recibo_mock.cliente_id = None
    recibo_mock.cliente_nome_avulso = "Maria da Silva"

    servico_mock = MagicMock()
    servico_mock.condominio = None
    servico_mock.recibo = recibo_mock
    servico_mock.nota_fiscal = None
    servico_mock.numero_os = None
    servico_mock.ordem_servico = None
    servico_mock.data_servico = date(2026, 3, 1)
    servico_mock.tipo = MagicMock(value="assistencia")

    termo_mock = MagicMock()
    termo_mock.servico = servico_mock
    termo_mock.produto_descricao = None
    termo_mock.prazo_meses = 12
    termo_mock.data_inicio = date(2026, 3, 1)
    termo_mock.data_fim = date(2027, 3, 1)

    db = _db_mock()
    db.query.return_value.first.return_value = None  # ConfiguracaoEmpresa -> fallback

    with patch("app.services.termo_garantia_service.TermoGarantiaRepository.get_by_id", return_value=termo_mock):
        contexto = _build_context(db, termo_id=1)

    assert contexto["cliente_nome"] == "Maria da Silva"
    assert contexto["cliente_endereco"] == ""


# ─── 8-9. Retrofit: editar recibo antigo com condominio_id novo (Passo 7) ────

def test_atualizar_condominio_novo_entrada_sem_servico_cria_retroativo():
    """Recibo ENTRADA antigo sem condomínio e sem serviço nenhum: ao informar
    condominio_id no PATCH, dispara a criação retroativa do serviço."""
    from app.models.recibo_model import Recibo
    from app.services.recibo_service import ReciboService
    from app.schemas.recibo_schema import ReciboUpdate

    recibo = Recibo(
        id=950, numero_recibo="REC-2026-021", tipo="ENTRADA", condominio_id=None,
        valor=650.0, data_emissao=date(2026, 2, 16), status="PENDENTE",
        descricao_servico="Servico Eraseg",
    )
    recibo.servicos = []

    db = _db_mock()

    with (
        patch("app.repositories.recibo_repository.ReciboRepository.get_by_id", return_value=recibo),
        patch("app.repositories.recibo_repository.ReciboRepository.save", side_effect=lambda db_arg, r: r),
        patch("app.services.recibo_service.ReciboService._criar_servico") as mock_criar,
    ):
        ReciboService.atualizar(db, 950, ReciboUpdate(condominio_id=77))

    mock_criar.assert_called_once_with(db, recibo, 77, tipo="ASSISTENCIA")


def test_atualizar_condominio_novo_recibo_ja_tem_servico_nao_duplica():
    """Recibo que já tem serviço vinculado: mudar condominio_id não deve
    disparar criação de um segundo serviço."""
    from app.models.recibo_model import Recibo
    from app.services.recibo_service import ReciboService
    from app.schemas.recibo_schema import ReciboUpdate

    recibo = Recibo(
        id=951, numero_recibo="REC-2026-022", tipo="ENTRADA", condominio_id=10,
        valor=500.0, data_emissao=date(2026, 2, 20), status="PENDENTE",
        descricao_servico="Servico ja com OS",
    )
    recibo.servicos = [MagicMock()]

    db = _db_mock()

    with (
        patch("app.repositories.recibo_repository.ReciboRepository.get_by_id", return_value=recibo),
        patch("app.repositories.recibo_repository.ReciboRepository.save", side_effect=lambda db_arg, r: r),
        patch("app.services.recibo_service.ReciboService._criar_servico") as mock_criar,
    ):
        ReciboService.atualizar(db, 951, ReciboUpdate(condominio_id=99))

    mock_criar.assert_not_called()


def test_atualizar_sem_mudanca_de_condominio_nao_dispara_retrofit():
    """condominio_id ausente do payload (None) não conta como mudança — não dispara nada."""
    from app.models.recibo_model import Recibo
    from app.services.recibo_service import ReciboService
    from app.schemas.recibo_schema import ReciboUpdate

    recibo = Recibo(
        id=952, numero_recibo="REC-2026-023", tipo="ENTRADA", condominio_id=None,
        valor=300.0, data_emissao=date(2026, 2, 21), status="PENDENTE",
        descricao_servico="Servico sem mudanca",
    )
    recibo.servicos = []

    db = _db_mock()

    with (
        patch("app.repositories.recibo_repository.ReciboRepository.get_by_id", return_value=recibo),
        patch("app.repositories.recibo_repository.ReciboRepository.save", side_effect=lambda db_arg, r: r),
        patch("app.services.recibo_service.ReciboService._criar_servico") as mock_criar,
    ):
        ReciboService.atualizar(db, 952, ReciboUpdate(observacao="so um texto novo"))

    mock_criar.assert_not_called()
