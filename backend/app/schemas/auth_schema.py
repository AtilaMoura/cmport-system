from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr
from app.models.usuario_model import RoleUsuario


class LoginRequest(BaseModel):
    email: EmailStr
    senha: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: RoleUsuario
    nome: str


class UsuarioMe(BaseModel):
    id: int
    nome: str
    email: str
    role: RoleUsuario
    ativo: bool

    model_config = {"from_attributes": True}


class UsuarioResponse(BaseModel):
    id: int
    nome: str
    email: str
    role: RoleUsuario
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    role: RoleUsuario = RoleUsuario.USUARIO


class UsuarioUpdate(BaseModel):
    role: Optional[RoleUsuario] = None
    ativo: Optional[bool] = None
