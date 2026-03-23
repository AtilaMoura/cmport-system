"""
security.py — Utilitários de segurança: hash de senha e geração/validação de JWT.
"""
from datetime import datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# Contexto bcrypt para hash de senhas
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8


def hash_senha(senha: str) -> str:
    return _pwd_context.hash(senha)


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return _pwd_context.verify(senha, senha_hash)


def criar_token(data: dict[str, Any]) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decodificar_token(token: str) -> dict[str, Any]:
    """Lança JWTError se inválido ou expirado."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
