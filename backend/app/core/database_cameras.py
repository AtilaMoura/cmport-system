"""
database_cameras.py — engine/sessão do banco `cmport_cameras`.

Schema separado do banco financeiro (`cmport_gerenciamento`), mesmo servidor MySQL.
Isolamento lógico: nenhuma tabela do módulo de câmeras entra no `Base` principal
(app/core/database.py), então nada aqui afeta o create_all/migrations do sistema
financeiro, e vice-versa.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings


class BaseCameras(DeclarativeBase):
    pass


engine_cameras = create_engine(
    settings.CAMERAS_DATABASE_URL,
    echo=True,
)

SessionLocalCameras = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine_cameras,
)
