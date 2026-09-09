"""
Testes para DespesaService.estornar_pagamento — desfaz um pagamento marcado por engano.

Cobre:
  1. parcela PAGO com movimentacao MANUAL -> volta a PENDENTE, movimentacao soft-deletada, auditoria
  2. parcela que nao esta paga -> erro, nada muda
  3. movimentacao conciliada do banco (origem=BANCO) -> bloqueia o estorno
"""
from unittest.mock import MagicMock, patch

import pytest

from app.models.despesa_model import StatusParcelaDespesa


def _fake_update(db, obj, dados):
    for k, v in dados.items():
        setattr(obj, k, v)
    return obj


def _make_parcela(status=StatusParcelaDespesa.PAGO, movimentacao_id=50):
    p = MagicMock()
    p.id = 1930
    p.despesa_id = 1199
    p.status = status
    p.valor = 315.00
    p.data_pagamento = "2026-09-12"
    p.banco_id = 4
    p.forma_pagamento = "PIX"
    p.movimentacao_id = movimentacao_id
    p.despesa = MagicMock()
    return p


def _make_mov(origem="MANUAL"):
    m = MagicMock()
    m.id = 50
    m.data = "2026-09-12"
    m.descricao = "Vale refeicao"
    m.valor = 315.00
    m.tipo = "SAIDA"
    m.origem = origem
    m.deletado_em = None
    return m


def test_estorno_devolve_parcela_e_apaga_movimentacao():
    parcela = _make_parcela()
    mov = _make_mov("MANUAL")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = mov

    with (
        patch("app.repositories.despesa_repository.DespesaRepository.get_parcela_by_id", return_value=parcela),
        patch("app.repositories.despesa_repository.DespesaRepository.update", side_effect=_fake_update),
        patch("app.routers.auditoria_router.registrar_exclusao") as mock_audit,
        patch("app.schemas.despesa_schema.DespesaResponse.model_validate", return_value="ok"),
    ):
        from app.services.despesa_service import DespesaService
        out = DespesaService.estornar_pagamento(db, 1930)

    assert out == "ok"
    assert parcela.status == StatusParcelaDespesa.PENDENTE
    assert parcela.data_pagamento is None
    assert parcela.banco_id is None
    assert parcela.forma_pagamento is None
    assert parcela.movimentacao_id is None
    assert mov.deletado_em is not None            # movimentacao soft-deletada
    assert mock_audit.call_count == 2             # snapshot da parcela + da movimentacao


def test_estorno_bloqueado_se_nao_esta_pago():
    parcela = _make_parcela(status=StatusParcelaDespesa.PENDENTE)
    db = MagicMock()

    with (
        patch("app.repositories.despesa_repository.DespesaRepository.get_parcela_by_id", return_value=parcela),
        patch("app.routers.auditoria_router.registrar_exclusao") as mock_audit,
    ):
        from app.services.despesa_service import DespesaService
        with pytest.raises(Exception, match="nao esta paga"):
            DespesaService.estornar_pagamento(db, 1930)

    mock_audit.assert_not_called()


def test_estorno_bloqueado_se_movimentacao_veio_do_banco():
    parcela = _make_parcela()
    mov = _make_mov("BANCO")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = mov

    with (
        patch("app.repositories.despesa_repository.DespesaRepository.get_parcela_by_id", return_value=parcela),
        patch("app.routers.auditoria_router.registrar_exclusao") as mock_audit,
    ):
        from app.services.despesa_service import DespesaService
        with pytest.raises(Exception, match="conciliad"):
            DespesaService.estornar_pagamento(db, 1930)

    assert parcela.status == StatusParcelaDespesa.PAGO
    assert mov.deletado_em is None
    mock_audit.assert_not_called()
