"""
auth_router.py — Endpoints de autenticação (login e perfil atual).
Este router NÃO usa get_current_user no login — é o ponto de entrada público.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user
from app.core.security import verificar_senha, criar_token
from app.models.usuario_model import Usuario
from app.schemas.auth_schema import LoginRequest, TokenResponse, UsuarioMe

router = APIRouter()


def _autenticar(db: Session, email: str, senha: str) -> Usuario:
    usuario = db.query(Usuario).filter(
        Usuario.email == email.lower(),
        Usuario.ativo == True,
    ).first()
    if not usuario or not verificar_senha(senha, usuario.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos.",
        )
    return usuario


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Login com email e senha — retorna JWT."""
    usuario = _autenticar(db, body.email, body.senha)
    token = criar_token({"sub": str(usuario.id), "role": usuario.role.value, "nome": usuario.nome})
    return TokenResponse(access_token=token, role=usuario.role, nome=usuario.nome)


@router.post("/login-form", response_model=TokenResponse, include_in_schema=False)
def login_form(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Login via form (compatível com OAuth2 — usado pelo Swagger UI)."""
    usuario = _autenticar(db, form.username, form.password)
    token = criar_token({"sub": str(usuario.id), "role": usuario.role.value, "nome": usuario.nome})
    return TokenResponse(access_token=token, role=usuario.role, nome=usuario.nome)


@router.get("/me", response_model=UsuarioMe)
def me(usuario: Usuario = Depends(get_current_user)):
    """Retorna dados do usuário autenticado."""
    return usuario
