from pydantic import BaseModel, Field
from typing import Optional


class EnderecoBase(BaseModel):
    rua: Optional[str] = Field(None, max_length=255)
    numero: Optional[str] = Field(None, max_length=20)
    complemento: Optional[str] = Field(None, max_length=100)
    bairro: Optional[str] = Field(None, max_length=100)
    cidade: Optional[str] = Field(None, max_length=100)
    estado: Optional[str] = Field(None, max_length=2)
    cep: Optional[str] = Field(None, max_length=9)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class EnderecoCreate(EnderecoBase):
    condominio_id: int


class EnderecoUpdate(EnderecoBase):
    pass


class EnderecoResponse(EnderecoBase):
    id: int
    condominio_id: int

    class Config:
        from_attributes = True
