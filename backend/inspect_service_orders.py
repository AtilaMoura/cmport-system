import requests
import json
from app.services.auvo_client import auvo_client

def inspect():
    headers = auvo_client._get_headers()
    url = f"{auvo_client.BASE_URL}/serviceOrders/"
    resp = requests.get(url, headers=headers, params={"pageSize": 1}, timeout=10)
    print(json.dumps(resp.json(), indent=2, ensure_ascii=False))

if __name__ == "__main__":
    inspect()
