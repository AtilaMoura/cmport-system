from pydantic import BaseModel
from typing import Optional


class MediaMTXAuthRequest(BaseModel):
    """Payload que o MediaMTX manda no webhook de autenticação (authHTTPAddress).
    Formato fixo definido pelo MediaMTX — não inventar/remover campo."""
    user: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None
    ip: Optional[str] = None
    action: str
    path: str
    protocol: Optional[str] = None
    id: Optional[str] = None
    query: Optional[str] = None
    userAgent: Optional[str] = None
