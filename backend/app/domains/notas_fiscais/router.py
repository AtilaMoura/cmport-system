from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import SessionLocal
from .service import NotaFiscalService
from .schema import NotaFiscalCreate, NotaFiscalResponse, ImportacaoResponse


router = APIRouter()


# Dependência para obter a sessão do banco
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=NotaFiscalResponse, status_code=201)
def create_nota(nota: NotaFiscalCreate, db: Session = Depends(get_db)):
    """
    Cria uma nova Nota Fiscal manualmente no sistema
    """
    try:
        return NotaFiscalService.create_nota(db, nota)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao criar nota: {str(e)}")


@router.get("/", response_model=List[NotaFiscalResponse])
def list_notas(db: Session = Depends(get_db)):
    """
    Lista todas as notas fiscais cadastradas no sistema
    """
    return NotaFiscalService.get_all_notas(db)


@router.get("/{id}", response_model=NotaFiscalResponse)
def get_nota_by_id(id: int, db: Session = Depends(get_db)):
    """
    Busca uma nota específica pelo ID
    """
    nota = NotaFiscalService.get_nota_by_id(db, id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota Fiscal não encontrada")
    return nota


@router.get("/numero/{numero}", response_model=NotaFiscalResponse)
def get_nota_by_numero(numero: str, db: Session = Depends(get_db)):
    """
    Busca uma nota específica pelo número
    """
    nota = NotaFiscalService.get_nota_by_numero(db, numero)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota Fiscal não encontrada")
    return nota


@router.post("/importar-xml", response_model=ImportacaoResponse)
async def importar_xmls(
    arquivos: List[UploadFile] = File(..., description="Arquivos XML ou ZIP contendo XMLs de NFe"),
    tipo: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Importa Notas Fiscais Eletrônicas (NFe) a partir de arquivos XML
    
    **Aceita:**
    - Múltiplos arquivos `.xml` individuais
    - Arquivo `.zip` contendo vários XMLs (inclusive em subpastas)
    - Combinação de ambos
    
    **Funcionalidades:**
    - Extrai dados principais da NFe (número, série, emitente, destinatário, valor)
    - Vincula automaticamente ao condomínio pelo CNPJ (se encontrado)
    - Detecta tipo de serviço (Manutenção/Assistência) pelas informações complementares
    - Identifica número de parcelas
    - Evita duplicidade pela chave de acesso
    - Armazena XML completo para auditoria
    
    **Retorna:**
    - Quantidade de notas processadas com sucesso
    - Lista de erros (se houver)
    """
    try:
        resultado = await NotaFiscalService.importar_xmls(db, arquivos, tipo)
        return ImportacaoResponse(
            processados=resultado["processados"],
            erros=resultado["erros"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Erro ao importar XMLs: {str(e)}"
        )


@router.delete("/{id}", status_code=204)
def delete_nota(id: int, db: Session = Depends(get_db)):
    """
    Deleta uma nota fiscal pelo ID
    """
    nota = NotaFiscalService.get_nota_by_id(db, id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota Fiscal não encontrada")
    
    # Aqui você implementaria o método de deleção no service
    # NotaFiscalService.delete_nota(db, id)
    
    return None