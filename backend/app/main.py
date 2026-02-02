from fastapi import FastAPI
import requests

app = FastAPI()

# Suas chaves fixas (mantenha-as seguras)
AUVO_API_TOKEN = "AUVO_TOKEN_REDACTED"
AUVO_API_KEY = "AUVO_KEY_REDACTED"

def get_auvo_access_token():
    """Primeira etapa: Faz login para pegar o accessToken temporário"""
    url_login = f"https://api.auvo.com.br/v2/login/?apiKey={AUVO_API_KEY}&apiToken={AUVO_API_TOKEN}"
    
    response = requests.get(url_login)
    
    if response.status_code == 200:
        dados = response.json()
        return dados.get("result", {}).get("accessToken")
    else:
        print(f"Erro no login: {response.text}")
        return None

@app.get("/sync-auvo")
def sync_auvo_data():
    # 1. Pega o token temporário (JWT)
    access_token = get_auvo_access_token()
    
    if not access_token:
        return {"status": "erro", "detalhes": "Não foi possível autenticar no Auvo"}

    # 2. Usa o accessToken no Header para buscar equipamentos
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    url_equipments = "https://api.auvo.com.br/v2/equipments/?page=1&pageSize=10&order=asc"
    
    try:
        response = requests.get(url_equipments, headers=headers)
        
        if response.status_code == 200:
            dados = response.json()
            # Pega a lista de equipamentos dentro da estrutura da resposta
            lista = dados.get("result", {}).get("entityList", [])
            
            return {
                "status": "sucesso",
                "total_itens": len(lista),
                "equipamentos": lista
            }
        
        return {"status": "erro", "codigo": response.status_code, "detalhes": response.text}

    except Exception as e:
        return {"status": "erro de conexao", "detalhes": str(e)}


def get_condominios(access_token: str, client_group_id: int):
    url = "https://api.auvo.com.br/v2/customers/"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    params = {
        "clientGroupId": client_group_id,
        "page": 1,
        "pageSize": 50,
        "order": "asc"
    }

    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()

    return response.json()["result"]["entityList"]

@app.get("/condominios/{client_group_id}")
def listar_condominios(client_group_id: int):
    access_token = get_auvo_access_token()

    if not access_token:
        return {"status": "erro", "detalhes": "Falha ao autenticar no AUVO"}

    try:
        condominios = get_condominios(
            access_token=access_token,
            client_group_id=client_group_id
        )

        return {
            "status": "sucesso",
            "total": len(condominios),
            "condominios": condominios
        }

    except Exception as e:
        return {"status": "erro", "detalhes": str(e)}