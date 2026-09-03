"""
Testes para CorpoNotaService.deletar — garante que o soft-delete de um corpo
desfaz o vínculo com a nota fiscal (antes o vínculo ficava pendurado num corpo
que não existia mais e a nota nunca mais podia ser religada a outro corpo).

Cobre:
  1. deletar limpa notas_fiscais.corpo_nota_id e corpo.nota_fiscal_id
  2. deletar é bloqueado (409) quando a nota vinculada tem boleto ativo
  3. deletar de corpo sem nota vinculada continua funcionando normal
  4. tentar_vincular_por_nota_fiscal ignora corpo soft-deletado e libera o matching
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from tests.conftest import make_nota_fiscal, make_corpo_nota


def _query_router(**por_model):
    """Cria um db.query(X) que devolve resultados diferentes por model."""
    def _dispatch(model):
        nome = getattr(model, "__name__", str(model))
        alvo = por_model.get(nome, MagicMock())
        q = MagicMock()
        q.filter.return_value = q
        q.filter_by.return_value = q
        q.first.return_value = alvo if not isinstance(alvo, list) else (alvo[0] if alvo else None)
        q.all.return_value = alvo if isinstance(alvo, list) else [alvo]
        return q
    db = MagicMock()
    db.query.side_effect = _dispatch
    return db


def test_deletar_desvincula_nota_fiscal():
    from app.models.corpo_nota_model import StatusCorpoNota

    corpo = make_corpo_nota(id=352, nota_fiscal_id=1665, nota_produto_id=None,
                            status=StatusCorpoNota.XML_VINCULADO)
    nota = make_nota_fiscal(id=1665, corpo_nota_id=352)

    db = _query_router(Boleto=[], NotaFiscal=nota)

    with (
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.get_by_id", return_value=corpo),
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.save", return_value=corpo),
        patch("app.routers.auditoria_router.registrar_exclusao") as mock_audit,
        patch("app.repositories.ciclo_nota_repository.CicloNotaRepository.get_by_id", return_value=None),
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        CorpoNotaService.deletar(db, 352, usuario="Comercial")

    assert nota.corpo_nota_id is None            # nota liberada
    assert corpo.nota_fiscal_id is None          # corpo não segura mais a nota
    assert corpo.deletado_em is not None         # soft-delete aplicado
    mock_audit.assert_called_once()


def test_deletar_bloqueia_com_boleto_ativo():
    from app.models.corpo_nota_model import StatusCorpoNota

    corpo = make_corpo_nota(id=352, nota_fiscal_id=1665, status=StatusCorpoNota.XML_VINCULADO)
    boleto = MagicMock()

    db = _query_router(Boleto=boleto)

    with (
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.get_by_id", return_value=corpo),
        patch("app.routers.auditoria_router.registrar_exclusao") as mock_audit,
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        with pytest.raises(HTTPException) as exc:
            CorpoNotaService.deletar(db, 352, usuario="Comercial")

    assert exc.value.status_code == 409
    assert corpo.deletado_em is None
    mock_audit.assert_not_called()


def test_deletar_sem_nota_vinculada_ok():
    from app.models.corpo_nota_model import StatusCorpoNota

    corpo = make_corpo_nota(id=400, nota_fiscal_id=None, nota_produto_id=None,
                            status=StatusCorpoNota.EM_MONTAGEM)
    db = _query_router()

    with (
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.get_by_id", return_value=corpo),
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.save", return_value=corpo),
        patch("app.routers.auditoria_router.registrar_exclusao") as mock_audit,
        patch("app.repositories.ciclo_nota_repository.CicloNotaRepository.get_by_id", return_value=None),
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        CorpoNotaService.deletar(db, 400)

    assert corpo.deletado_em is not None
    mock_audit.assert_called_once()


def test_tentar_vincular_ignora_corpo_soft_deletado():
    """Nota presa a um corpo soft-deletado: o vínculo morto é limpo e o matching prossegue."""
    from app.models.nota_fiscal_model import TipoNota

    nota = make_nota_fiscal(id=1665, numero_nota="160-2", tipo=TipoNota.MANUTENCAO,
                            condominio_id=505, corpo_nota_id=351)
    corpo_morto = make_corpo_nota(id=351, nota_fiscal_id=1665)
    corpo_morto.deletado_em = "2026-09-02 17:37:28"

    db = MagicMock()
    # 1ª query: NotaFiscal por id -> nota ; 2ª query: CorpoNota por id -> corpo_morto
    db.query.return_value.filter.return_value.first.side_effect = [nota, corpo_morto]

    with (
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.list_candidatos_por_numero_nf", return_value=[]),
        patch("app.repositories.corpo_nota_repository.CorpoNotaRepository.list_candidatos_para_nota", return_value=[]),
    ):
        from app.services.corpo_nota_service import CorpoNotaService
        CorpoNotaService.tentar_vincular_por_nota_fiscal(db, 1665)

    assert nota.corpo_nota_id is None
    assert corpo_morto.nota_fiscal_id is None
