import base64
import hashlib
import smtplib
import ssl
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.configuracao_model import ConfiguracaoEmail, ConfiguracaoEmpresa
from app.repositories.configuracao_repository import (
    ConfiguracaoEmailRepository, ConfiguracaoEmpresaRepository
)
from app.schemas.configuracao_schema import (
    ConfiguracaoEmailCreate, ConfiguracaoEmailUpdate,
    ConfiguracaoEmailResponse, ConfiguracaoEmpresaSchema, TestarEmailResponse,
)


# ── Criptografia ──────────────────────────────────────────────────────────────

def _fernet():
    from cryptography.fernet import Fernet
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def criptografar(senha: str) -> str:
    return _fernet().encrypt(senha.encode()).decode()


def descriptografar(senha_enc: str) -> str:
    return _fernet().decrypt(senha_enc.encode()).decode()


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_credenciais_ativas(db: Session) -> Tuple[Optional[str], Optional[str], str]:
    """
    Retorna (email, senha, from_name) da conta ativa no banco.
    Se não houver conta cadastrada, usa fallback do .env.
    """
    config = ConfiguracaoEmailRepository.get_ativo(db)
    if config:
        try:
            senha = descriptografar(config.senha_enc)
        except Exception:
            senha = None
        empresa = ConfiguracaoEmpresaRepository.get(db)
        from_name = (empresa.email_from_name if empresa else None) or settings.EMAIL_FROM_NAME
        return config.email, senha, from_name

    return settings.OUTLOOK_EMAIL, settings.OUTLOOK_PASSWORD, settings.EMAIL_FROM_NAME


# ── Service ───────────────────────────────────────────────────────────────────

class ConfiguracaoService:

    @staticmethod
    def listar_emails(db: Session) -> List[ConfiguracaoEmailResponse]:
        return [ConfiguracaoEmailResponse.model_validate(e)
                for e in ConfiguracaoEmailRepository.get_all(db)]

    @staticmethod
    def criar_email(db: Session, req: ConfiguracaoEmailCreate) -> ConfiguracaoEmailResponse:
        if req.ativo:
            ConfiguracaoEmailRepository.desativar_todos(db)
        obj = ConfiguracaoEmailRepository.create(db, {
            "nome": req.nome,
            "email": req.email,
            "senha_enc": criptografar(req.senha),
            "ativo": req.ativo,
        })
        return ConfiguracaoEmailResponse.model_validate(obj)

    @staticmethod
    def atualizar_email(db: Session, id: int, req: ConfiguracaoEmailUpdate) -> ConfiguracaoEmailResponse:
        obj = ConfiguracaoEmailRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Conta não encontrada.")
        data = {}
        if req.nome is not None:
            data["nome"] = req.nome
        if req.email is not None:
            data["email"] = req.email
        if req.senha is not None:
            data["senha_enc"] = criptografar(req.senha)
        if req.ativo is not None:
            if req.ativo:
                ConfiguracaoEmailRepository.desativar_todos(db)
            data["ativo"] = req.ativo
        obj = ConfiguracaoEmailRepository.update(db, obj, data)
        return ConfiguracaoEmailResponse.model_validate(obj)

    @staticmethod
    def ativar_email(db: Session, id: int) -> ConfiguracaoEmailResponse:
        obj = ConfiguracaoEmailRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Conta não encontrada.")
        ConfiguracaoEmailRepository.desativar_todos(db)
        obj = ConfiguracaoEmailRepository.update(db, obj, {"ativo": True})
        return ConfiguracaoEmailResponse.model_validate(obj)

    @staticmethod
    def deletar_email(db: Session, id: int) -> None:
        obj = ConfiguracaoEmailRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Conta não encontrada.")
        ConfiguracaoEmailRepository.delete(db, obj)

    @staticmethod
    def testar_email(db: Session, id: int) -> TestarEmailResponse:
        obj = ConfiguracaoEmailRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Conta não encontrada.")
        try:
            senha = descriptografar(obj.senha_enc)
        except Exception:
            return TestarEmailResponse(ok=False, mensagem="Erro ao descriptografar a senha.")
        try:
            context = ssl.create_default_context()
            with smtplib.SMTP("smtp.office365.com", 587, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls(context=context)
                smtp.ehlo()
                smtp.login(obj.email, senha)
            return TestarEmailResponse(ok=True, mensagem=f"Conexão bem-sucedida com {obj.email}.")
        except smtplib.SMTPAuthenticationError:
            return TestarEmailResponse(ok=False, mensagem="Email ou senha incorretos.")
        except Exception as e:
            return TestarEmailResponse(ok=False, mensagem=f"Falha na conexão: {e}")

    @staticmethod
    def get_empresa(db: Session) -> ConfiguracaoEmpresaSchema:
        obj = ConfiguracaoEmpresaRepository.get(db)
        if not obj:
            return ConfiguracaoEmpresaSchema(nome="CMPort", email_from_name="CMPort")
        return ConfiguracaoEmpresaSchema.model_validate(obj)

    @staticmethod
    def salvar_empresa(db: Session, req: ConfiguracaoEmpresaSchema) -> ConfiguracaoEmpresaSchema:
        obj = ConfiguracaoEmpresaRepository.upsert(db, req.model_dump())
        return ConfiguracaoEmpresaSchema.model_validate(obj)
