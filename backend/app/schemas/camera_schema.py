from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime


class CameraBase(BaseModel):
    nome: str = Field(..., min_length=2, max_length=150)
    tipo_conexao: str = Field(..., description="RTSP_NVR | RTMP_ISOLADA")

    # RTSP_NVR
    canal: Optional[int] = Field(None, ge=1)
    nvr_ip: Optional[str] = Field(None, max_length=45)
    nvr_porta: Optional[int] = Field(554, ge=1, le=65535)
    nvr_usuario: Optional[str] = Field(None, max_length=100)
    nvr_senha: Optional[str] = Field(None, max_length=255)

    @model_validator(mode="after")
    def valida_campos_por_tipo(self):
        if self.tipo_conexao == "RTSP_NVR":
            faltando = [
                campo for campo, valor in (
                    ("canal", self.canal), ("nvr_ip", self.nvr_ip),
                    ("nvr_usuario", self.nvr_usuario), ("nvr_senha", self.nvr_senha),
                ) if not valor
            ]
            if faltando:
                raise ValueError(f"Câmera RTSP_NVR precisa de: {', '.join(faltando)}")
        return self


class CameraCreate(CameraBase):
    poste_id: int


class CameraUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=2, max_length=150)
    canal: Optional[int] = Field(None, ge=1)
    nvr_ip: Optional[str] = Field(None, max_length=45)
    nvr_porta: Optional[int] = Field(None, ge=1, le=65535)
    nvr_usuario: Optional[str] = Field(None, max_length=100)
    nvr_senha: Optional[str] = Field(None, max_length=255)
    ativo: Optional[bool] = None


class CameraResponse(BaseModel):
    id: int
    poste_id: int
    nome: str
    tipo_conexao: str
    canal: Optional[int] = None
    nvr_ip: Optional[str] = None
    nvr_porta: Optional[int] = None
    nvr_usuario: Optional[str] = None
    # nvr_senha nunca volta na resposta — só é usada internamente pra montar a URL RTSP
    rtmp_stream_key: Optional[str] = None
    rtmp_url: Optional[str] = None
    ativo: bool
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True
