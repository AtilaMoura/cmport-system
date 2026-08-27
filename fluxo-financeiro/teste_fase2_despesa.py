"""Teste manual (nao automatizado) da Fase 2 -- roda direto contra o banco
local, sem precisar do router (que ainda nao existe, e' a Fase 3)."""
import sys
sys.path.insert(0, ".")

import app.main  # noqa -- forca import de todos os models pra registry do SQLAlchemy resolver relationships por nome
from app.core.database import SessionLocal
from app.services.despesa_service import DespesaService
from app.schemas.despesa_schema import DespesaCreate, MarcarPagoRequest

db = SessionLocal()

try:
    # pega uma categoria e um banco reais pra usar no teste
    from app.models.fin_categoria_model import CategoriaFinanceira
    from app.models.banco_model import Banco

    categoria = db.query(CategoriaFinanceira).filter(CategoriaFinanceira.grupo == "DESPESA").first()
    banco = db.query(Banco).first()
    assert categoria, "nenhuma categoria DESPESA encontrada"
    assert banco, "nenhum banco encontrado"
    print(f"usando categoria={categoria.nome} (id={categoria.id}) banco={banco.nome} (id={banco.id})")

    # 1) despesa UNICA
    req_unica = DespesaCreate(
        descricao="[TESTE] Despesa unica",
        categoria_id=categoria.id,
        cnpj="CMPORT",
        tipo_pagamento="UNICO",
        valor_total=150.00,
        total_parcelas=1,
        data_primeira_parcela="2026-08-21",
    )
    resp_unica = DespesaService.criar(db, req_unica)
    print(f"\n[UNICA] despesa id={resp_unica.id} parcelas={len(resp_unica.parcelas)}")
    assert len(resp_unica.parcelas) == 1
    assert float(resp_unica.parcelas[0].valor) == 150.00
    print("  OK: 1 parcela, valor bate")

    # 2) despesa PARCELADA (3x de um valor que nao divide exato, pra testar arredondamento)
    req_parc = DespesaCreate(
        descricao="[TESTE] Despesa parcelada",
        categoria_id=categoria.id,
        cnpj="CMPORT",
        tipo_pagamento="PARCELADO",
        valor_total=100.00,
        total_parcelas=3,
        data_primeira_parcela="2026-08-21",
    )
    resp_parc = DespesaService.criar(db, req_parc)
    print(f"\n[PARCELADA] despesa id={resp_parc.id} parcelas={len(resp_parc.parcelas)}")
    assert len(resp_parc.parcelas) == 3
    soma = sum(float(p.valor) for p in resp_parc.parcelas)
    print(f"  parcelas: {[(p.numero_parcela, float(p.valor), str(p.data_vencimento)) for p in resp_parc.parcelas]}")
    print(f"  soma={soma} (esperado 100.00)")
    assert abs(soma - 100.00) < 0.01, f"soma das parcelas nao bate: {soma}"
    assert all(p.status == "PENDENTE" for p in resp_parc.parcelas)
    print("  OK: 3 parcelas, soma bate, todas pendentes")

    # 3) marcar 1a parcela da despesa parcelada como paga
    parcela_1 = resp_parc.parcelas[0]
    req_pago = MarcarPagoRequest(data_pagamento="2026-08-21", banco_id=banco.id, forma_pagamento="PIX")
    resp_pago = DespesaService.marcar_pago(db, parcela_1.id, req_pago)
    parcela_1_atualizada = [p for p in resp_pago.parcelas if p.id == parcela_1.id][0]
    print(f"\n[MARCAR PAGO] parcela id={parcela_1.id} status={parcela_1_atualizada.status} movimentacao_id={parcela_1_atualizada.movimentacao_id}")
    assert parcela_1_atualizada.status == "PAGO"
    assert parcela_1_atualizada.movimentacao_id is not None

    from app.models.fin_movimentacao_model import MovimentacaoFinanceira
    mov = db.query(MovimentacaoFinanceira).filter(MovimentacaoFinanceira.id == parcela_1_atualizada.movimentacao_id).first()
    print(f"  movimentacao criada: descricao='{mov.descricao}' valor={mov.valor} tipo={mov.tipo} banco_id={mov.banco_id} status={mov.status}")
    assert mov.tipo == "SAIDA"
    assert float(mov.valor) == float(parcela_1.valor)
    assert mov.banco_id == banco.id
    print("  OK: movimentacao gerada e linkada corretamente")

    # 4) excluir a despesa unica (soft delete)
    DespesaService.deletar(db, resp_unica.id)
    from app.models.despesa_model import Despesa
    despesa_deletada = db.query(Despesa).filter(Despesa.id == resp_unica.id).first()
    print(f"\n[DELETAR] despesa id={resp_unica.id} deletado_em={despesa_deletada.deletado_em}")
    assert despesa_deletada.deletado_em is not None
    listagem_apos_delete = DespesaService.listar(db, cnpj="CMPORT")
    ids_listados = [d.id for d in listagem_apos_delete]
    assert resp_unica.id not in ids_listados
    print("  OK: soft delete aplicado, despesa some da listagem")

    print("\n=== TODOS OS TESTES PASSARAM ===")

finally:
    # limpa os dados de teste (hard delete direto, so pra nao sujar o banco local)
    from app.models.despesa_model import Despesa, DespesaParcela
    from app.models.fin_movimentacao_model import MovimentacaoFinanceira
    ids_teste = [d.id for d in db.query(Despesa).filter(Despesa.descricao.like("[TESTE]%")).all()]
    if ids_teste:
        db.query(MovimentacaoFinanceira).filter(
            MovimentacaoFinanceira.descricao.like("[TESTE]%")
        ).delete(synchronize_session=False)
        db.query(DespesaParcela).filter(DespesaParcela.despesa_id.in_(ids_teste)).delete(synchronize_session=False)
        db.query(Despesa).filter(Despesa.id.in_(ids_teste)).delete(synchronize_session=False)
        db.commit()
        print(f"\n(limpeza: {len(ids_teste)} despesa(s) de teste removida(s) do banco)")
    db.close()
