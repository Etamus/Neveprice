import json
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup
from cachetools import TTLCache, cached

BASE_URL = "https://www.buscape.com.br"
cache = TTLCache(maxsize=100, ttl=900)


def _headers():
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }


def _as_float(value):
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value).replace(".", "").replace(",", "."))
    except (TypeError, ValueError):
        return None


@cached(cache)
def scrape_buscape(product_query: str):
    url = f"{BASE_URL}/search?q={quote_plus(product_query)}"

    try:
        response = requests.get(url, headers=_headers(), timeout=15)
        if response.status_code != 200:
            print(f"Buscape retornou HTTP {response.status_code}")
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        next_data = soup.find("script", id="__NEXT_DATA__")
        if not next_data or not next_data.string:
            print("Buscape nao retornou dados estruturados.")
            return []

        data = json.loads(next_data.string)
        hits = (
            data.get("props", {})
            .get("initialReduxState", {})
            .get("hits", {})
            .get("hits", [])
        )

        products = []
        for item in hits[:10]:
            name = item.get("name") or item.get("shortName")
            price = _as_float(item.get("price"))
            relative_url = item.get("url")
            if not name or not price or not relative_url:
                continue

            best_offer = item.get("bestOffer") or {}
            merchant_name = best_offer.get("merchantName")
            store = f"Buscape - {merchant_name}" if merchant_name else "Buscape"

            products.append(
                {
                    "name": name.strip(),
                    "price": price,
                    "store": store,
                    "url": urljoin(BASE_URL, relative_url),
                    "brand": merchant_name or "Buscape",
                    "category": item.get("categoryName") or product_query,
                    "image_url": item.get("image"),
                }
            )

        return products
    except Exception as e:
        print(f"Erro ao buscar no Buscape: {e}")
        return []
