"""
canal_service.py — lógica de negócio do módulo Demandas (canal Atila ↔ CMPort).

Regras principais:
- DEMANDA precisa de título; NOTA não.
- Código curto sequencial por tipo (D-<n> / N-<n>).
- Qualquer atividade de um lado zera a marca "visto" do outro lado (badge de novidade).
- Nada é apagado de verdade: item -> deletado_em, anexo -> removido, comentário -> deletado_em.
- Anexos ficam no MinIO já existente (bucket STORAGE_BUCKET, prefixo `canal/`).
"""
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.storage_client import StorageClient
from app.models.canal_model import (
    CanalItem, CanalComentario, CanalAnexo,
    CanalAutor, CanalTipo, CanalStatus, CanalPrioridade, LADO_POR_AUTOR,
)
from app.repositories.canal_repository import CanalRepository
from app.schemas.canal_schema import (
    ItemCreate, ItemUpdate, MudarStatusRequest, ResolverRequest, DescartarRequest,
    PromoverRequest, ArquivarRequest, ComentarioCreate,
    ItemResponse, ItemListItem, ItemListResponse, AnexoResponse, ComentarioResponse,
    ResumoResponse,
)

_PREFIXO_KEY = "canal/"


def _lado(autor: str) -> str:
    try:
        return LADO_POR_AUTOR[CanalAutor(autor)]
    except (ValueError, KeyError):
        return "ATILA"


def _tocar_visto(item: CanalItem, autor: str) -> None:
    """Quem agiu 'viu'; o outro lado ganha marca de novidade."""
    lado = _lado(autor)
    if lado == "ATILA":
        item.visto_atila = True
        item.visto_cmport = False
    else:
        item.visto_cmport = True
        item.visto_atila = False


def _anexos_ativos(item_ou_comentario) -> List[CanalAnexo]:
    return [a for a in item_ou_comentario.anexos if not a.removido]


class CanalService:

    # ── Serialização ─────────────────────────────────────────────────────────

    @staticmethod
    def _anexo_resp(a: CanalAnexo) -> AnexoResponse:
        return AnexoResponse(
            id=a.id, item_id=a.item_id, comentario_id=a.comentario_id,
            nome_arquivo=a.nome_arquivo, content_type=a.content_type,
            tamanho=a.tamanho, enviado_por=a.enviado_por.value,
            enviado_em=a.enviado_em,
        )

    @staticmethod
    def _item_resp(item: CanalItem) -> ItemResponse:
        comentarios = [
            ComentarioResponse(
                id=c.id, item_id=c.item_id, autor=c.autor.value,
                texto=c.texto, reacao=c.reacao, criado_em=c.criado_em,
                anexos=[CanalService._anexo_resp(a) for a in _anexos_ativos(c)],
            )
            for c in item.comentarios if c.deletado_em is None
        ]
        anexos_item = [
            CanalService._anexo_resp(a)
            for a in item.anexos if not a.removido and a.comentario_id is None
        ]
        return ItemResponse(
            id=item.id, codigo=item.codigo, tipo=item.tipo.value,
            titulo=item.titulo, descricao=item.descricao, autor=item.autor.value,
            status=item.status.value, prioridade=item.prioridade.value,
            resolucao_texto=item.resolucao_texto, commit_ref=item.commit_ref,
            motivo_descarte=item.motivo_descarte,
            data_abertura=item.data_abertura, data_resolucao=item.data_resolucao,
            visto_atila=item.visto_atila, visto_cmport=item.visto_cmport,
            arquivado=item.arquivado, criado_em=item.criado_em,
            atualizado_em=item.atualizado_em,
            anexos=anexos_item, comentarios=comentarios,
        )

    @staticmethod
    def _list_item(item: CanalItem) -> ItemListItem:
        coment_ativos = [c for c in item.comentarios if c.deletado_em is None]
        ultima = item.atualizado_em or item.data_abertura
        if coment_ativos:
            ultima = max(ultima, coment_ativos[-1].criado_em)
        preview = (item.descricao or "").strip().replace("\n", " ")
        if len(preview) > 140:
            preview = preview[:137] + "..."
        return ItemListItem(
            id=item.id, codigo=item.codigo, tipo=item.tipo.value,
            titulo=item.titulo, descricao_preview=preview or None,
            autor=item.autor.value, status=item.status.value,
            prioridade=item.prioridade.value,
            data_abertura=item.data_abertura, data_resolucao=item.data_resolucao,
            atualizado_em=item.atualizado_em, ultima_atividade=ultima,
            visto_atila=item.visto_atila, visto_cmport=item.visto_cmport,
            arquivado=item.arquivado,
            qtd_anexos=len([a for a in item.anexos if not a.removido]),
            qtd_comentarios=len(coment_ativos),
        )

    # ── Itens ────────────────────────────────────────────────────────────────

    @staticmethod
    def listar(
        db: Session,
        tipo: Optional[str] = None,
        status: Optional[str] = None,
        autor: Optional[str] = None,
        busca: Optional[str] = None,
        incluir_arquivados: bool = False,
        incluir_encerrados: bool = True,
    ) -> ItemListResponse:
        itens = CanalRepository.listar(
            db, tipo=tipo, status=status, autor=autor, busca=busca,
            incluir_arquivados=incluir_arquivados,
            incluir_encerrados=incluir_encerrados,
        )
        linhas = [CanalService._list_item(i) for i in itens]
        # ordena por última atividade (comentário mais novo pode passar do atualizado_em)
        linhas.sort(key=lambda l: l.ultima_atividade, reverse=True)
        return ItemListResponse(itens=linhas, total=len(linhas))

    @staticmethod
    def obter(db: Session, item_id: int) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        return CanalService._item_resp(item)

    @staticmethod
    def criar(db: Session, req: ItemCreate) -> ItemResponse:
        tipo = CanalTipo(req.tipo)
        titulo = (req.titulo or "").strip() or None
        if tipo == CanalTipo.DEMANDA and not titulo:
            raise HTTPException(400, "Demanda precisa de um título.")

        item = CanalItem(
            codigo=CanalRepository.proximo_codigo(db, tipo),
            tipo=tipo,
            titulo=titulo,
            descricao=(req.descricao or "").strip() or None,
            autor=CanalAutor(req.autor),
            status=CanalStatus.ABERTA,
            prioridade=CanalPrioridade(req.prioridade),
        )
        _tocar_visto(item, req.autor)
        item = CanalRepository.create(db, item)
        return CanalService._item_resp(item)

    @staticmethod
    def editar(db: Session, item_id: int, req: ItemUpdate) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        dados = req.model_dump(exclude_unset=True)
        if "titulo" in dados:
            item.titulo = (dados["titulo"] or "").strip() or None
        if "descricao" in dados:
            item.descricao = (dados["descricao"] or "").strip() or None
        if dados.get("prioridade"):
            item.prioridade = CanalPrioridade(dados["prioridade"])
        if item.tipo == CanalTipo.DEMANDA and not item.titulo:
            raise HTTPException(400, "Demanda precisa de um título.")
        return CanalService._item_resp(CanalRepository.save(db, item))

    @staticmethod
    def mudar_status(db: Session, item_id: int, req: MudarStatusRequest) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        novo = CanalStatus(req.status)
        item.status = novo
        if novo == CanalStatus.RESOLVIDA and not item.data_resolucao:
            item.data_resolucao = datetime.utcnow()
        if novo not in (CanalStatus.RESOLVIDA, CanalStatus.DESCARTADA):
            item.data_resolucao = None
        _tocar_visto(item, req.autor)
        return CanalService._item_resp(CanalRepository.save(db, item))

    @staticmethod
    def resolver(db: Session, item_id: int, req: ResolverRequest) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        if not (req.resolucao_texto or "").strip():
            raise HTTPException(400, "Descreva o que foi feito.")
        item.status = CanalStatus.RESOLVIDA
        item.resolucao_texto = req.resolucao_texto.strip()
        item.commit_ref = (req.commit_ref or "").strip() or None
        item.data_resolucao = datetime.utcnow()
        _tocar_visto(item, req.autor)
        return CanalService._item_resp(CanalRepository.save(db, item))

    @staticmethod
    def descartar(db: Session, item_id: int, req: DescartarRequest) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        if not (req.motivo_descarte or "").strip():
            raise HTTPException(400, "Informe o motivo do descarte.")
        item.status = CanalStatus.DESCARTADA
        item.motivo_descarte = req.motivo_descarte.strip()
        item.data_resolucao = datetime.utcnow()
        _tocar_visto(item, req.autor)
        return CanalService._item_resp(CanalRepository.save(db, item))

    @staticmethod
    def promover(db: Session, item_id: int, req: PromoverRequest) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        if item.tipo == CanalTipo.DEMANDA:
            raise HTTPException(400, "Item já é uma demanda.")
        if not (req.titulo or "").strip():
            raise HTTPException(400, "Dê um título para a demanda.")
        item.tipo = CanalTipo.DEMANDA
        item.titulo = req.titulo.strip()
        item.prioridade = CanalPrioridade(req.prioridade)
        item.status = CanalStatus.ABERTA
        item.codigo = CanalRepository.proximo_codigo(db, CanalTipo.DEMANDA)
        _tocar_visto(item, req.autor)
        return CanalService._item_resp(CanalRepository.save(db, item))

    @staticmethod
    def arquivar(db: Session, item_id: int, req: ArquivarRequest) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        item.arquivado = bool(req.arquivado)
        return CanalService._item_resp(CanalRepository.save(db, item))

    @staticmethod
    def marcar_visto(db: Session, item_id: int, lado: str) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        if lado == "ATILA":
            item.visto_atila = True
        else:
            item.visto_cmport = True
        return CanalService._item_resp(CanalRepository.save(db, item))

    @staticmethod
    def deletar(db: Session, item_id: int) -> None:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        item.deletado_em = datetime.utcnow()
        CanalRepository.save(db, item)

    # ── Comentários ──────────────────────────────────────────────────────────

    @staticmethod
    def comentar(db: Session, item_id: int, req: ComentarioCreate) -> ItemResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        texto = (req.texto or "").strip() or None
        reacao = (req.reacao or "").strip() or None
        if not texto and not reacao:
            raise HTTPException(400, "Comentário vazio.")
        comentario = CanalComentario(
            item_id=item.id, autor=CanalAutor(req.autor),
            texto=texto, reacao=reacao,
        )
        CanalRepository.add_comentario(db, comentario)
        _tocar_visto(item, req.autor)
        CanalRepository.save(db, item)
        return CanalService.obter(db, item_id)

    # ── Anexos ───────────────────────────────────────────────────────────────

    @staticmethod
    def upload_anexo(
        db: Session,
        item_id: int,
        storage: StorageClient,
        nome_arquivo: str,
        conteudo: bytes,
        content_type: Optional[str],
        enviado_por: str,
        comentario_id: Optional[int] = None,
    ) -> AnexoResponse:
        item = CanalRepository.get_by_id(db, item_id)
        if not item:
            raise HTTPException(404, "Item não encontrado.")
        if not conteudo:
            raise HTTPException(400, "Arquivo vazio.")

        seguro = (nome_arquivo or "arquivo").replace("/", "_").replace("\\", "_")[:200]
        object_key = f"{_PREFIXO_KEY}{item_id}/{uuid.uuid4().hex}_{seguro}"
        storage.upload(
            settings.STORAGE_BUCKET, object_key, conteudo,
            content_type=content_type or "application/octet-stream",
        )
        anexo = CanalAnexo(
            item_id=item_id,
            comentario_id=comentario_id,
            nome_arquivo=seguro,
            object_key=object_key,
            content_type=content_type,
            tamanho=len(conteudo),
            enviado_por=CanalAutor(enviado_por),
        )
        CanalRepository.add_anexo(db, anexo)
        _tocar_visto(item, enviado_por)
        CanalRepository.save(db, item)
        return CanalService._anexo_resp(anexo)

    @staticmethod
    def baixar_anexo(
        db: Session, storage: StorageClient, anexo_id: int
    ) -> Tuple[bytes, str, str]:
        anexo = CanalRepository.get_anexo(db, anexo_id)
        if not anexo:
            raise HTTPException(404, "Anexo não encontrado.")
        conteudo = storage.download(settings.STORAGE_BUCKET, anexo.object_key)
        return conteudo, anexo.nome_arquivo, anexo.content_type or "application/octet-stream"

    @staticmethod
    def remover_anexo(db: Session, anexo_id: int) -> None:
        anexo = CanalRepository.get_anexo(db, anexo_id)
        if not anexo:
            raise HTTPException(404, "Anexo não encontrado.")
        anexo.removido = True
        db.commit()

    # ── Resumo ───────────────────────────────────────────────────────────────

    @staticmethod
    def resumo(db: Session) -> ResumoResponse:
        return ResumoResponse(**CanalRepository.contadores(db))
