import requests
from typing import Optional, Dict, List
from app.core.config import settings


class AuvoClient:
    """Cliente para integração com a API do Auvo"""
    
    BASE_URL = "https://api.auvo.com.br/v2"
    
    def __init__(self):
        self.api_key = settings.AUVO_API_KEY
        self.api_token = settings.AUVO_API_TOKEN
        self._access_token: Optional[str] = None
    
    def _get_access_token(self) -> Optional[str]:
        """Faz login e obtém o accessToken temporário"""
        url = f"{self.BASE_URL}/login/"
        params = {
            "apiKey": self.api_key,
            "apiToken": self.api_token
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            access_token = data.get("result", {}).get("accessToken")
            
            if access_token:
                self._access_token = access_token
                return access_token
            else:
                print(f"Erro: accessToken não encontrado na resposta: {data}")
                return None
                
        except requests.exceptions.RequestException as e:
            print(f"Erro ao fazer login no Auvo: {e}")
            return None
    
    def _get_headers(self) -> Dict[str, str]:
        """Retorna headers com autenticação"""
        if not self._access_token:
            self._get_access_token()
        
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json"
        }
    
    def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
        """Faz requisição autenticada para a API do Auvo"""
        url = f"{self.BASE_URL}/{endpoint}"
        
        try:
            response = requests.get(
                url,
                headers=self._get_headers(),
                params=params,
                timeout=15
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Erro na requisição para {endpoint}: {e}")
            return None
    
    # ======================
    # MÉTODOS PÚBLICOS
    # ======================
    
    def get_customers(
        self,
        client_group_id: Optional[int] = None,
        page: int = 1,
        page_size: int = 100
    ) -> List[Dict]:
        """
        Busca clientes/condominios do Auvo
        
        Args:
            client_group_id: ID do grupo de clientes (opcional)
            page: Página atual
            page_size: Quantidade de itens por página
        
        Returns:
            Lista de clientes/condominios
        """
        params = {
            "page": page,
            "pageSize": page_size,
            "order": "asc"
        }
        
        if client_group_id:
            params["clientGroupId"] = client_group_id
        
        data = self._make_request("customers/", params=params)
        
        if data and "result" in data:
            return data["result"].get("entityList", [])
        
        return []
    
    def get_equipments(
        self,
        page: int = 1,
        page_size: int = 50
    ) -> List[Dict]:
        """
        Busca equipamentos do Auvo
        
        Args:
            page: Página atual
            page_size: Quantidade de itens por página
        
        Returns:
            Lista de equipamentos
        """
        params = {
            "page": page,
            "pageSize": page_size,
            "order": "asc"
        }
        
        data = self._make_request("equipments/", params=params)
        
        if data and "result" in data:
            return data["result"].get("entityList", [])
        
        return []
    
    def get_service_orders(
        self,
        page: int = 1,
        page_size: int = 50
    ) -> List[Dict]:
        """
        Busca ordens de serviço do Auvo
        
        Args:
            page: Página atual
            page_size: Quantidade de itens por página
        
        Returns:
            Lista de ordens de serviço
        """
        params = {
            "page": page,
            "pageSize": page_size,
            "order": "asc"
        }
        
        data = self._make_request("tasks/", params=params)
        
        if data and "result" in data:
            return data["result"].get("entityList", [])
        
        return []


# Instância singleton do cliente
auvo_client = AuvoClient()