import unicodedata

from sqlalchemy.orm import Session
from sqlalchemy import func, select

from app.models.nota_fiscal_model import NotaFiscal
from app.schemas.nota_fiscal_schema import NotaFiscalCreate, NotaFiscalImportada
from app.models.condominio_model import Condominio


def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


class NotaFiscalRepository:

    @staticmethod
    def create(db: Session, nota: NotaFiscalCreate):
        db_nota = NotaFiscal(**nota.model_dump())
        db.add(db_nota)
        db.commit()
        db.refresh(db_nota)
        return db_nota

    # Campos presentes no schema mas que não são colunas do modelo NotaFiscal
    _CAMPOS_NAO_MODELO = {'data_emissao', 'data_servico', 'numero_os'}

    @staticmethod
    def create_importada(db: Session, nota: NotaFiscalImportada):
        dados = {k: v for k, v in nota.model_dump().items()
                 if k not in NotaFiscalRepository._CAMPOS_NAO_MODELO}
        db_nota = NotaFiscal(**dados)
        db.add(db_nota)
        db.commit()
        db.refresh(db_nota)
        return db_nota

    @staticmethod
    def get_all(db: Session):
        return db.query(NotaFiscal).all()

    @staticmethod
    def get_by_id(db: Session, id: int):
        return db.query(NotaFiscal).filter(NotaFiscal.id == id).first()

    @staticmethod
    def get_by_numero(db: Session, numero: str):
        return db.query(NotaFiscal).filter(NotaFiscal.numero_nota == numero).first()

    @staticmethod
    def get_condominio_by_cnpj(db: Session, cnpj_limpo: str):
        return db.scalars(
            select(Condominio).where(
                func.replace(
                    func.replace(
                        func.replace(Condominio.cnpj, ".", ""),
                        "/", ""
                    ),
                    "-", ""
                ) == cnpj_limpo
            ).limit(1)
        ).first()

    @staticmethod
    def get_condominio_by_nome(db: Session, nome: str):
        if not nome:
            return None
        nome_upper = nome.strip().upper()

        # 1) Comparação exata via SQL
        result = db.scalars(
            select(Condominio).where(func.upper(Condominio.razao_social) == nome_upper).limit(1)
        ).first()
        if not result:
            result = db.scalars(
                select(Condominio).where(func.upper(Condominio.nome) == nome_upper).limit(1)
            ).first()
        if result:
            return result

        # Carrega todos para comparação em memória (db.query para garantir compatibilidade)
        todos = db.query(Condominio).all()
        print(f"[NOME] Busca em memoria para '{nome}' - {len(todos)} condominios no BD")

        # 2) Normaliza acentos e compara exato
        nome_norm = _strip_accents(nome_upper)
        for cond in todos:
            if cond.razao_social and _strip_accents(cond.razao_social.upper()) == nome_norm:
                return cond
            if cond.nome and _strip_accents(cond.nome.upper()) == nome_norm:
                return cond

        # 3) Remove prefixos genéricos e compara a parte significativa
        _PREFIXOS = {"CONDOMINIO", "CONDOMÍNIO", "EDIFICIO", "EDIFÍCIO", "RESIDENCIAL", "COND"}

        def _chave(s: str) -> str:
            palavras = _strip_accents(s.upper()).split()
            palavras_sig = [p for p in palavras if p not in _PREFIXOS]
            return " ".join(palavras_sig)

        chave_xml = _chave(nome)
        if chave_xml:
            for cond in todos:
                if cond.razao_social and _chave(cond.razao_social) == chave_xml:
                    return cond
                if cond.nome and _chave(cond.nome) == chave_xml:
                    return cond

        # 4) Containment: nome do banco contido no nome do XML ou vice-versa
        for cond in todos:
            for campo in [cond.razao_social, cond.nome]:
                if not campo:
                    continue
                campo_norm = _strip_accents(campo.upper())
                if campo_norm in nome_norm or nome_norm in campo_norm:
                    return cond

        print(f"[NOME] Nenhum match para '{nome}'")
        return None
