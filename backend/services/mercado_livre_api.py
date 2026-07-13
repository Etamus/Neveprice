import requests
from cachetools import TTLCache, cached

BASE_URL = "https://api.mercadolibre.com/sites/MLB/search"
cache = TTLCache(maxsize=100, ttl=900)


def extract_brand(item):
    attributes = item.get("attributes", [])

    for attr in attributes:
        if attr.get("id") == "BRAND":
            return attr.get("value_name")

    return None


@cached(cache)
def search_mercado_livre(product_query: str):
    try:
        params = {
            "q": product_query,
            "limit": 30,
            "sort": "price_asc",
        }
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "Accept-Language": "pt-BR,pt;q=0.9",
        }

        response = requests.get(BASE_URL, params=params, headers=headers, timeout=10)
        print("Status ML:", response.status_code)

        if response.status_code != 200:
            print(f"API do Mercado Livre indisponivel ou bloqueada: HTTP {response.status_code}")
            return []

        data = response.json()
        results = []

        for item in data.get("results", []):
            results.append(
                {
                    "name": item.get("title"),
                    "price": float(item.get("price", 0)),
                    "store": "Mercado Livre",
                    "url": item.get("permalink"),
                    "brand": extract_brand(item) or "Mercado Livre",
                    "category": product_query,
                    "image_url": item.get("thumbnail"),
                }
            )

        return results

    except Exception as e:
        print(f"Erro ao buscar na API do Mercado Livre: {e}")
        return []
