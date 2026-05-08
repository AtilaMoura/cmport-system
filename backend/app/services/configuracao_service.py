import base64
import hashlib
import json
import smtplib
import ssl
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.configuracao_model import ConfiguracaoEmail, ConfiguracaoEmpresa
from app.repositories.configuracao_repository import (
    ConfiguracaoEmailRepository, ConfiguracaoEmpresaRepository, ConfiguracaoInterRepository,
)
from app.schemas.configuracao_schema import (
    ConfiguracaoEmailCreate, ConfiguracaoEmailUpdate,
    ConfiguracaoEmailResponse, ConfiguracaoEmpresaSchema, TestarEmailResponse,
    ConfiguracaoInterCreate, ConfiguracaoInterUpdate, ConfiguracaoInterResponse,
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


# ── Helpers de credenciais ────────────────────────────────────────────────────

def get_config_ativa(db: Session) -> dict:
    """
    Retorna todas as informações da conta de email ativa.
    Resultado: dict com chave 'tipo' ("SMTP" | "GRAPH_API") + credenciais.
    """
    config  = ConfiguracaoEmailRepository.get_ativo(db)
    empresa = ConfiguracaoEmpresaRepository.get(db)
    from_name = (empresa.email_from_name if empresa else None) or settings.EMAIL_FROM_NAME

    if config:
        tipo = getattr(config, "tipo", "SMTP") or "SMTP"
        if tipo == "GRAPH_API":
            secret = None
            if config.graph_secret_enc:
                try:
                    secret = descriptografar(config.graph_secret_enc)
                except Exception:
                    pass
            return {
                "tipo":              "GRAPH_API",
                "email":             config.email,
                "from_name":         from_name,
                "graph_client_id":   config.graph_client_id,
                "graph_tenant_id":   config.graph_tenant_id,
                "graph_client_secret": secret,
            }
        else:
            senha = None
            if config.senha_enc:
                try:
                    senha = descriptografar(config.senha_enc)
                except Exception:
                    pass
            return {
                "tipo":      "SMTP",
                "email":     config.email,
                "senha":     senha,
                "from_name": from_name,
            }

    # Fallback: variáveis de ambiente (SMTP)
    return {
        "tipo":      "SMTP",
        "email":     settings.OUTLOOK_EMAIL,
        "senha":     settings.OUTLOOK_PASSWORD,
        "from_name": settings.EMAIL_FROM_NAME,
    }


def get_credenciais_ativas(db: Session) -> Tuple[Optional[str], Optional[str], str]:
    """Compat: retorna (email, senha, from_name) — usado por código legado SMTP."""
    cfg = get_config_ativa(db)
    return cfg.get("email"), cfg.get("senha"), cfg.get("from_name", settings.EMAIL_FROM_NAME)


# ── Service ───────────────────────────────────────────────────────────────────

class ConfiguracaoService:

    @staticmethod
    def listar_emails(db: Session):
        return [ConfiguracaoEmailResponse.model_validate(e)
                for e in ConfiguracaoEmailRepository.get_all(db)]

    @staticmethod
    def criar_email(db: Session, req: ConfiguracaoEmailCreate) -> ConfiguracaoEmailResponse:
        tipo = req.tipo or "SMTP"
        if tipo == "GRAPH_API":
            if not req.graph_client_id or not req.graph_tenant_id or not req.graph_client_secret:
                raise Exception("Para Graph API informe client_id, tenant_id e client_secret.")
            dados = {
                "nome":             req.nome,
                "email":            req.email,
                "tipo":             "GRAPH_API",
                "senha_enc":        None,
                "graph_client_id":  req.graph_client_id,
                "graph_tenant_id":  req.graph_tenant_id,
                "graph_secret_enc": criptografar(req.graph_client_secret),
                "ativo":            req.ativo,
            }
        else:
            if not req.senha:
                raise Exception("Para SMTP informe a senha.")
            dados = {
                "nome":      req.nome,
                "email":     req.email,
                "tipo":      "SMTP",
                "senha_enc": criptografar(req.senha),
                "ativo":     req.ativo,
            }

        if req.ativo:
            ConfiguracaoEmailRepository.desativar_todos(db)

        obj = ConfiguracaoEmailRepository.create(db, dados)
        return ConfiguracaoEmailResponse.model_validate(obj)

    @staticmethod
    def atualizar_email(db: Session, id: int, req: ConfiguracaoEmailUpdate) -> ConfiguracaoEmailResponse:
        obj = ConfiguracaoEmailRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Conta não encontrada.")

        data: dict = {}
        if req.nome  is not None: data["nome"]  = req.nome
        if req.email is not None: data["email"] = req.email
        if req.tipo  is not None: data["tipo"]  = req.tipo
        if req.ativo is not None:
            if req.ativo:
                ConfiguracaoEmailRepository.desativar_todos(db)
            data["ativo"] = req.ativo

        # SMTP
        if req.senha is not None:
            data["senha_enc"] = criptografar(req.senha)

        # Graph API
        if req.graph_client_id     is not None: data["graph_client_id"]  = req.graph_client_id
        if req.graph_tenant_id     is not None: data["graph_tenant_id"]  = req.graph_tenant_id
        if req.graph_client_secret is not None:
            data["graph_secret_enc"] = criptografar(req.graph_client_secret)

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

        tipo = getattr(obj, "tipo", "SMTP") or "SMTP"

        if tipo == "GRAPH_API":
            if not obj.graph_client_id or not obj.graph_tenant_id or not obj.graph_secret_enc:
                return TestarEmailResponse(ok=False, mensagem="Credenciais Graph incompletas.")
            try:
                secret = descriptografar(obj.graph_secret_enc)
            except Exception:
                return TestarEmailResponse(ok=False, mensagem="Erro ao descriptografar o client_secret.")
            try:
                from app.services.graph_email_service import GraphEmailService
                GraphEmailService.obter_token(obj.graph_client_id, secret, obj.graph_tenant_id)
                return TestarEmailResponse(ok=True, mensagem=f"Token Graph obtido com sucesso para {obj.email}.")
            except Exception as e:
                return TestarEmailResponse(ok=False, mensagem=f"Falha ao obter token: {e}")
        else:
            # SMTP
            if not obj.senha_enc:
                return TestarEmailResponse(ok=False, mensagem="Senha SMTP não configurada.")
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
                return TestarEmailResponse(ok=True, mensagem=f"Conexão SMTP bem-sucedida com {obj.email}.")
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
        dados = req.model_dump()
        if "emails_copia" in dados:
            dados["emails_copia"] = json.dumps(dados["emails_copia"]) if dados["emails_copia"] else None
        obj = ConfiguracaoEmpresaRepository.upsert(db, dados)
        return ConfiguracaoEmpresaSchema.model_validate(obj)

    # ── Inter ─────────────────────────────────────────────────────────────────

    @staticmethod
    def listar_inter(db: Session) -> list[ConfiguracaoInterResponse]:
        return [ConfiguracaoInterResponse.model_validate(c)
                for c in ConfiguracaoInterRepository.get_all(db)]

    @staticmethod
    def criar_inter(db: Session, req: ConfiguracaoInterCreate) -> ConfiguracaoInterResponse:
        dados = req.model_dump()
        obj = ConfiguracaoInterRepository.create(db, dados)
        return ConfiguracaoInterResponse.model_validate(obj)

    @staticmethod
    def atualizar_inter(db: Session, id: int, req: ConfiguracaoInterUpdate) -> ConfiguracaoInterResponse:
        obj = ConfiguracaoInterRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Configuração Inter não encontrada.")
        dados = {k: v for k, v in req.model_dump().items() if v is not None}
        obj = ConfiguracaoInterRepository.update(db, obj, dados)
        return ConfiguracaoInterResponse.model_validate(obj)

    @staticmethod
    def desativar_inter(db: Session, id: int) -> ConfiguracaoInterResponse:
        obj = ConfiguracaoInterRepository.get_by_id(db, id)
        if not obj:
            raise Exception("Configuração Inter não encontrada.")
        obj = ConfiguracaoInterRepository.desativar(db, obj)
        return ConfiguracaoInterResponse.model_validate(obj)
