from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str

    # Database — módulo Câmeras (schema separado, mesmo servidor MySQL)
    DB_CAMERAS_NAME: str = "cmport_cameras"

    # Módulo Câmeras — endereço base do MediaMTX que recebe o push RTMP das câmeras
    # (hoje aponta pro container de teste na mesma VPS; troca quando o MediaMTX definitivo subir)
    MEDIAMTX_RTMP_BASE_URL: str = "rtmp://168.231.96.184:1935"

    # Endereço do WebRTC (WHEP) do MediaMTX visto PELO BACKEND — nunca exposto ao navegador.
    # Dev: backend roda no host → 127.0.0.1 (NÃO "localhost": no Windows tenta IPv6 antes,
    # a porta só escuta em IPv4 e cada chamada perde ~2s). Produção: rede Docker →
    # http://mediamtx:8889 (definido no docker-compose.prod.yml).
    MEDIAMTX_WEBRTC_INTERNAL_URL: str = "http://127.0.0.1:8889"
    # API de controle do MediaMTX (status online, derrubar publicação) — também só interna
    MEDIAMTX_API_INTERNAL_URL: str = "http://127.0.0.1:9997"

    # Segredo que o backend usa pra assistir streams no MediaMTX (Basic auth no WHEP).
    # O webhook de auth só libera "read"/"playback" com ele — sem isso ninguém assiste.
    # Vem do .env / .env.production, nunca fixado no código.
    MEDIAMTX_READ_SECRET: Optional[str] = None

    # Auvo API
    AUVO_API_KEY: str
    AUVO_API_TOKEN: str

    # Banco Inter API
    INTER_CLIENT_ID: Optional[str] = None
    INTER_CLIENT_SECRET: Optional[str] = None
    INTER_CONTA_CORRENTE: Optional[str] = None
    INTER_CERT_PATH: str = "app/auth/"
    INTER_ENV: str = "sandbox"  # "sandbox" ou "production"

    # Application
    ENV: str = "development"

    # JWT
    SECRET_KEY: str = "cmport-secret-dev-key-troque-em-producao"

    # Email (Outlook SMTP)
    OUTLOOK_EMAIL: Optional[str] = None
    OUTLOOK_PASSWORD: Optional[str] = None
    EMAIL_FROM_NAME: str = "CMPort"

    # Storage
    STORAGE_ENDPOINT: str = "http://localhost:9000"
    STORAGE_ACCESS_KEY: str = "minioadmin"
    STORAGE_SECRET_KEY: str = "minioadmin"
    STORAGE_BUCKET: str = "cmport-nfe"
    STORAGE_REGION: str = "us-east-1"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True
    )

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:"
            f"{self.DB_PASSWORD}@"
            f"{self.DB_HOST}:"
            f"{self.DB_PORT}/"
            f"{self.DB_NAME}"
            f"?charset=utf8mb4"
        )

    @property
    def CAMERAS_DATABASE_URL(self) -> str:
        """Mesmo servidor/credenciais do banco principal, schema separado (cmport_cameras)."""
        return (
            f"mysql+pymysql://{self.DB_USER}:"
            f"{self.DB_PASSWORD}@"
            f"{self.DB_HOST}:"
            f"{self.DB_PORT}/"
            f"{self.DB_CAMERAS_NAME}"
            f"?charset=utf8mb4"
        )


settings = Settings()
