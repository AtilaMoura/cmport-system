import os
from dotenv import load_dotenv
from sqlalchemy import create_all, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

# Pega as variáveis do .env
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("senha_forte_aqui")
DB_HOST = os.getenv("DB_HOST")
DB_NAME = os.getenv("DB_NAME")

# Monta a URL de conexão para o MySQL
SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Função para obter o banco de dados nas rotas do FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()