"""
dev_router.py — Endpoints exclusivos para o role DEV.
Protegidos por require_dev — apenas usuários com role=DEV podem acessar.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date, timedelta
from typing import Optional

from app.core.database import SessionLocal
from app.core.dependencies import require_dev
from app.models.usuario_model import Usuario

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



# ─── Schemas ────────────────────────────────────────────────────────────────

class ResetRequest(BaseModel):
    confirmar: bool = False
    incluir_condominios_teste: bool = False  # deleta condominios com nome começando em "TESTE"


class ResetResponse(BaseModel):
    boletos_deletados: int
    notas_deletadas: int
    servicos_deletados: int
    condominios_deletados: int
    mensagem: str


class ResetTudoRequest(BaseModel):
    confirmar: bool = False
    frase_confirmacao: str = ""  # deve ser "LIMPAR TUDO"


class ResetTudoResponse(BaseModel):
    boletos_deletados: int
    notas_deletadas: int
    servicos_deletados: int
    exclusoes_deletadas: int
    contatos_deletados: int
    enderecos_deletados: int
    condominios_deletados: int
    mensagem: str


class SeedResponse(BaseModel):
    condominio_id: int
    condominio_nome: str
    condominio_cnpj: str
    nota_id: Optional[int] = None
    nota_numero: Optional[str] = None
    nota_valor: Optional[float] = None
    boleto_codigo: Optional[str] = None
    mensagem: str


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/reset", response_model=ResetResponse)
def reset_dados_teste(request: ResetRequest, db: Session = Depends(get_db), _: Usuario = Depends(require_dev)):
    """
    Apaga TODOS os boletos, notas fiscais e serviços do banco.
    Condominios só são apagados se incluir_condominios_teste=True e nome começa com 'TESTE'.
    Requer confirmar=True.
    """
    if not request.confirmar:
        raise HTTPException(status_code=400, detail="Envie confirmar=true para executar o reset.")

    from app.models.boleto_model import Boleto
    from app.models.nota_fiscal_model import NotaFiscal
    from app.models.servico_model import ManutencaoAssistencia
    from app.models.condominio_model import Condominio

    # 1. Boletos (deve ser primeiro por FK)
    n_boletos = db.query(Boleto).delete(synchronize_session=False)

    # 2. Serviços
    n_servicos = db.query(ManutencaoAssistencia).delete(synchronize_session=False)

    # 3. Anula FK auto-referencial antes de deletar notas
    from sqlalchemy import text
    db.execute(text("UPDATE notas_fiscais SET nota_vinculada_id = NULL WHERE nota_vinculada_id IS NOT NULL"))

    # 4. Notas fiscais
    n_notas = db.query(NotaFiscal).delete(synchronize_session=False)

    # 4. Condominios de teste (opcional)
    n_condominios = 0
    if request.incluir_condominios_teste:
        n_condominios = db.query(Condominio).filter(
            Condominio.nome.like("TESTE%")
        ).delete(synchronize_session=False)

    db.commit()

    return ResetResponse(
        boletos_deletados=n_boletos,
        notas_deletadas=n_notas,
        servicos_deletados=n_servicos,
        condominios_deletados=n_condominios,
        mensagem=f"Reset concluído: {n_boletos} boletos, {n_notas} notas, {n_servicos} serviços, {n_condominios} condominios deletados.",
    )


@router.post("/reset-tudo", response_model=ResetTudoResponse)
def reset_tudo(request: ResetTudoRequest, db: Session = Depends(get_db), _: Usuario = Depends(require_dev)):
    """
    Apaga ABSOLUTAMENTE TUDO do banco de dados: boletos, notas, serviços,
    auditoria, contatos, endereços e condomínios.
    Requer confirmar=True e frase_confirmacao='LIMPAR TUDO'.
    """
    if not request.confirmar or request.frase_confirmacao != "LIMPAR TUDO":
        raise HTTPException(
            status_code=400,
            detail="Envie confirmar=true e frase_confirmacao='LIMPAR TUDO' para executar."
        )

    from app.models.boleto_model import Boleto
    from app.models.nota_fiscal_model import NotaFiscal
    from app.models.servico_model import ManutencaoAssistencia
    from app.models.exclusao_model import RegistroExclusao
    from app.models.contato_model import Contato
    from app.models.endereco_model import Endereco
    from app.models.condominio_model import Condominio

    n_boletos    = db.query(Boleto).delete(synchronize_session=False)
    n_servicos   = db.query(ManutencaoAssistencia).delete(synchronize_session=False)
    from sqlalchemy import text as _text
    db.execute(_text("UPDATE notas_fiscais SET nota_vinculada_id = NULL WHERE nota_vinculada_id IS NOT NULL"))
    n_notas      = db.query(NotaFiscal).delete(synchronize_session=False)
    n_exclusoes  = db.query(RegistroExclusao).delete(synchronize_session=False)
    n_contatos   = db.query(Contato).delete(synchronize_session=False)
    n_enderecos  = db.query(Endereco).delete(synchronize_session=False)
    n_condominios = db.query(Condominio).delete(synchronize_session=False)
    db.commit()

    return ResetTudoResponse(
        boletos_deletados=n_boletos,
        notas_deletadas=n_notas,
        servicos_deletados=n_servicos,
        exclusoes_deletadas=n_exclusoes,
        contatos_deletados=n_contatos,
        enderecos_deletados=n_enderecos,
        condominios_deletados=n_condominios,
        mensagem=f"TUDO deletado: {n_condominios} condominios, {n_notas} notas, {n_boletos} boletos, {n_servicos} serviços.",
    )


@router.post("/limpar-dados")
def limpar_dados(db: Session = Depends(get_db), _: Usuario = Depends(require_dev)):
    """
    Apaga boletos, serviços e notas fiscais. NÃO apaga condominios.
    Sem confirmação — use apenas em desenvolvimento.
    """
    from app.models.boleto_model import Boleto
    from app.models.nota_fiscal_model import NotaFiscal
    from app.models.servico_model import ManutencaoAssistencia

    n_boletos  = db.query(Boleto).delete(synchronize_session=False)
    n_servicos = db.query(ManutencaoAssistencia).delete(synchronize_session=False)
    from sqlalchemy import text as _text2
    db.execute(_text2("UPDATE notas_fiscais SET nota_vinculada_id = NULL WHERE nota_vinculada_id IS NOT NULL"))
    n_notas    = db.query(NotaFiscal).delete(synchronize_session=False)
    db.commit()

    return {
        "boletos_deletados": n_boletos,
        "servicos_deletados": n_servicos,
        "notas_deletadas": n_notas,
        "mensagem": f"Limpeza concluída: {n_boletos} boletos, {n_servicos} serviços, {n_notas} notas deletados. Condominios mantidos.",
    }



@router.post("/limpar-corpos-nota")
def limpar_corpos_nota(db: Session = Depends(get_db), _: Usuario = Depends(require_dev)):
    """
    Soft-deleta todos os corpos de nota que não estão com status PAGO.
    Usado para limpar corpos de teste sem perder dados financeiros finalizados.
    """
    from app.models.corpo_nota_model import CorpoNota, StatusCorpoNota
    from datetime import datetime

    corpos = (
        db.query(CorpoNota)
        .filter(
            CorpoNota.deletado_em.is_(None),
            CorpoNota.status != StatusCorpoNota.PAGO,
        )
        .all()
    )

    agora = datetime.utcnow()
    for corpo in corpos:
        corpo.deletado_em = agora

    db.commit()

    return {
        "corpos_deletados": len(corpos),
        "mensagem": f"{len(corpos)} corpos de nota soft-deletados (status PAGO preservados).",
    }


@router.post("/seed", response_model=SeedResponse)
def seed_dados_teste(
    gerar_nota: bool = True,
    gerar_boleto: bool = False,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_dev),
):
    """
    Cria dados de teste:
    - Condomínio TESTE (reutiliza se já existir)
    - Nota fiscal de teste (se gerar_nota=True)
    - Boleto via Inter (se gerar_boleto=True, requer Inter configurado)
    """
    from app.models.condominio_model import Condominio
    from app.models.endereco_model import Endereco
    from app.models.contato_model import Contato
    from app.models.nota_fiscal_model import NotaFiscal, TipoNota, StatusNota

    # ── Condomínio de teste ──────────────────────────────────────────────
    NOME_TESTE = "TESTE - Condomínio Demo"
    CNPJ_TESTE = "00000000000191"  # CNPJ fictício

    cond = db.query(Condominio).filter(Condominio.nome == NOME_TESTE).first()
    if not cond:
        cond = Condominio(
            nome=NOME_TESTE,
            razao_social="TESTE CONDOMINIO DEMO LTDA",
            cnpj=CNPJ_TESTE,
            ativo=True,
        )
        db.add(cond)
        db.flush()

        end = Endereco(
            condominio_id=cond.id,
            rua="Rua de Teste",
            numero="123",
            bairro="Centro",
            cidade="São Paulo",
            estado="SP",
            cep="01310100",
        )
        db.add(end)

        contato = Contato(
            condominio_id=cond.id,
            nome="Contato Teste",
            email="teste@cmport.com.br",
            telefone="11999999999",
            principal=True,
        )
        db.add(contato)
        db.commit()
        db.refresh(cond)

    resp = SeedResponse(
        condominio_id=cond.id,
        condominio_nome=cond.nome,
        condominio_cnpj=cond.cnpj or CNPJ_TESTE,
        mensagem="Condomínio de teste pronto.",
    )

    if not gerar_nota:
        return resp

    # ── Nota fiscal de teste ─────────────────────────────────────────────
    vencimento = date.today() + timedelta(days=5)
    nota = NotaFiscal(
        condominio_id=cond.id,
        numero_nota=f"TESTE-{date.today().strftime('%Y%m%d%H%M%S')}",
        tipo=TipoNota.MANUTENCAO,
        status=StatusNota.AUTORIZADA,
        valor=100.00,
        data_vencimento=vencimento,
        parcelas=1,
        cliente_nome=NOME_TESTE,
        observacao="Nota gerada automaticamente para teste",
    )
    db.add(nota)
    db.commit()
    db.refresh(nota)

    resp.nota_id = nota.id
    resp.nota_numero = nota.numero_nota
    resp.nota_valor = float(nota.valor)
    resp.mensagem = f"Condomínio #{cond.id} e Nota #{nota.id} criados."

    if not gerar_boleto:
        return resp

    # ── Boleto via Inter ─────────────────────────────────────────────────
    from app.services.boleto_service import BoletoService
    resultado = BoletoService.gerar_boletos(db, [nota.id])
    if resultado.sucesso:
        b = resultado.sucesso[0]
        resp.boleto_codigo = b.codigo_solicitacao
        resp.mensagem += f" Boleto {b.codigo_solicitacao} gerado."
    elif resultado.erros:
        resp.mensagem += f" Boleto NÃO gerado: {resultado.erros[0].get('erro')}"

    return resp
