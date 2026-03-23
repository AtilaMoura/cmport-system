"""
dependencies.py — Dependências FastAPI para autenticação e controle de acesso.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import decodificar_token
from app.models.usuario_model import Usuario, RoleUsuario


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login-form")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    """Valida o JWT e retorna o usuário autenticado."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decodificar_token(token)
        user_id: int | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    usuario = db.query(Usuario).filter(Usuario.id == int(user_id), Usuario.ativo == True).first()
    if usuario is None:
        raise credentials_exception
    return usuario


def require_admin(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    """Exige role ADMIN ou DEV."""
    if usuario.role not in (RoleUsuario.ADMIN, RoleUsuario.DEV):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores.")
    return usuario


def require_dev(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    """Exige role DEV."""
    if usuario.role != RoleUsuario.DEV:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito ao perfil DEV.")
    return usuario
