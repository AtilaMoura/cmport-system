"""
Testes de ReciboService.enviar_email (Refatoracao.md — Passo 6).

Regra chave: o destinatário vem SEMPRE do próprio recibo/cliente — nunca de
contatos de condomínio (diferença deliberada em relação ao fluxo de boleto/NF),
mesmo que o cliente esteja vinculado a um condomínio.
"""
import io
import json
from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException


def _db_mock():
    return MagicMock()


def _cliente_mock(email=None, condominio_id=None):
    c = MagicMock()
    c.email = email
    c.condominio_id = condominio_id
    return c


def _recibo_mock(cliente_id=None, cliente=None, nome_avulso=None, servicos=None):
    r = MagicMock()
    r.id = 950
    r.numero_recibo = "REC-2026-021"
    r.tipo = "ENTRADA"
    r.valor = 650.0
    r.data_emissao = date(2026, 2, 16)
    r.cliente_id = cliente_id
    r.cliente = cliente
    r.cliente_nome_avulso = nome_avulso
    r.servicos = servicos if servicos is not None else []
    return r


_PDF_FAKE = io.BytesIO(b"%PDF-fake")


# ─── 1. Destinatário resolvido do cliente cadastrado ──────────────────────────

def test_enviar_email_usa_email_do_cliente_cadastrado():
    from app.services.recibo_service import ReciboService

    cliente = _cliente_mock(email="sindico@condominio.com", condominio_id=42)
    recibo = _recibo_mock(cliente_id=10, cliente=cliente)
    db = _db_mock()

    with (
        patch("app.services.recibo_service.ReciboService.get_by_id", return_value=recibo),
        patch("app.services.recibo_service.ReciboService.gerar_pdf", return_value=_PDF_FAKE),
        patch("app.services.email_service.EmailService.enviar_recibo") as mock_enviar,
    ):
        resultado = ReciboService.enviar_email(db, 950)

    assert resultado["destinatarios"] == ["sindico@condominio.com"]
    mock_enviar.assert_called_once()
    kwargs = mock_enviar.call_args.kwargs
    assert kwargs["destinatarios"] == ["sindico@condominio.com"]
    assert kwargs["numero_recibo"] == "REC-2026-021"
    # Nunca deve receber nada derivado de contatos de condomínio — só dados do recibo/cliente.
    assert "condominio" not in kwargs


# ─── 2. Sem cliente/email e sem override → erro 422 ───────────────────────────

def test_enviar_email_erro_sem_cliente_e_sem_destinatarios():
    from app.services.recibo_service import ReciboService

    recibo = _recibo_mock(cliente_id=None, cliente=None, nome_avulso="Maria da Silva")
    db = _db_mock()

    with patch("app.services.recibo_service.ReciboService.get_by_id", return_value=recibo):
        with pytest.raises(HTTPException) as exc_info:
            ReciboService.enviar_email(db, 950)

    assert exc_info.value.status_code == 422


# ─── 3. Override explícito de destinatários é respeitado ──────────────────────

def test_enviar_email_override_destinatarios_ignora_cliente():
    from app.services.recibo_service import ReciboService

    cliente = _cliente_mock(email="sindico@condominio.com")
    recibo = _recibo_mock(cliente_id=10, cliente=cliente)
    db = _db_mock()

    with (
        patch("app.services.recibo_service.ReciboService.get_by_id", return_value=recibo),
        patch("app.services.recibo_service.ReciboService.gerar_pdf", return_value=_PDF_FAKE),
        patch("app.services.email_service.EmailService.enviar_recibo") as mock_enviar,
    ):
        resultado = ReciboService.enviar_email(db, 950, destinatarios=["outro@email.com"])

    assert resultado["destinatarios"] == ["outro@email.com"]
    assert mock_enviar.call_args.kwargs["destinatarios"] == ["outro@email.com"]


# ─── 4. Estampa email_enviado_em/email_destinatarios nos serviços vinculados ──

def test_enviar_email_estampa_servicos_vinculados():
    from app.services.recibo_service import ReciboService

    cliente = _cliente_mock(email="cliente@teste.com")
    servico = MagicMock()
    servico.email_enviado_em = None
    servico.email_destinatarios = None
    recibo = _recibo_mock(cliente_id=10, cliente=cliente, servicos=[servico])
    db = _db_mock()

    with (
        patch("app.services.recibo_service.ReciboService.get_by_id", return_value=recibo),
        patch("app.services.recibo_service.ReciboService.gerar_pdf", return_value=_PDF_FAKE),
        patch("app.services.email_service.EmailService.enviar_recibo"),
    ):
        ReciboService.enviar_email(db, 950)

    assert servico.email_enviado_em is not None
    assert json.loads(servico.email_destinatarios) == ["cliente@teste.com"]
    db.commit.assert_called()


# ─── 5. Sem serviço vinculado → não quebra, não tenta estampar nada ───────────

def test_enviar_email_sem_servico_vinculado_nao_quebra():
    from app.services.recibo_service import ReciboService

    cliente = _cliente_mock(email="cliente@teste.com")
    recibo = _recibo_mock(cliente_id=10, cliente=cliente, servicos=[])
    db = _db_mock()

    with (
        patch("app.services.recibo_service.ReciboService.get_by_id", return_value=recibo),
        patch("app.services.recibo_service.ReciboService.gerar_pdf", return_value=_PDF_FAKE),
        patch("app.services.email_service.EmailService.enviar_recibo"),
    ):
        resultado = ReciboService.enviar_email(db, 950)

    assert resultado["enviado"] is True
