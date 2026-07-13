from urllib.parse import urlencode, urljoin

import requests
from cachetools import TTLCache, cached

ALGOLIA_APP_ID = "1CF3ZT43ZU"
ALGOLIA_API_KEY = "28e054533dcdd3d71379fc3f38e78f1e"
ALGOLIA_INDEX = "production_products"
ALGOLIA_URL = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries"
BASE_URL = "https://www.leroymerlin.com.br"

REGION_KEYS = (
    "grande_sao_paulo",
    "rio_de_janeiro",
    "campinas",
    "brasilia",
    "curitiba",
)

cache = TTLCache(maxsize=100, ttl=900)


def _headers():
    return {
        "x-algolia-api-key": ALGOLIA_API_KEY,
        "x-algolia-application-id": ALGOLIA_APP_ID,
        "content-type": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.0.0 Safari/537.36"
        ),
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


def _picture_url(hit):
    pictures = hit.get("pictures")
    if isinstance(pictures, dict):
        return pictures.get("normal") or pictures.get("big") or pictures.get("micro")
    return None


def _category(hit, fallback):
    categories = hit.get("hierarchicalCategories")
    if isinstance(categories, dict):
        values = [value for value in categories.values() if value]
        if values:
            return str(values[-1])
    return fallback


def _region_price(hit):
    regional_attributes = hit.get("regionalAttributes") or {}
    candidate_regions = [
        regional_attributes.get(region_key)
        for region_key in REGION_KEYS
        if regional_attributes.get(region_key)
    ]

    candidate_regions.extend(
        region
        for region in regional_attributes.values()
        if isinstance(region, dict) and region not in candidate_regions
    )

    for region in candidate_regions:
        stock = region.get("stock") or {}
        if region.get("available") is False or stock.get("hasStock") is False:
            continue

        price = _as_float(
            region.get("promotionalPrice")
            or region.get("originalPrice")
            or region.get("suggestedPrice")
        )
        if price and price > 0:
            return price

    return None


@cached(cache)
def scrape_leroy(product_query: str):
    params = urlencode(
        {
            "query": product_query,
            "hitsPerPage": 30,
            "page": 0,
            "analytics": "false",
        }
    )
    payload = {"requests": [{"indexName": ALGOLIA_INDEX, "params": params}]}

    try:
        response = requests.post(
            ALGOLIA_URL,
            headers=_headers(),
            json=payload,
            timeout=15,
        )
        if response.status_code != 200:
            print(f"Leroy Merlin retornou HTTP {response.status_code}")
            return []

        hits = response.json().get("results", [{}])[0].get("hits", [])
        products = []

        for hit in hits:
            name = hit.get("name") or hit.get("shortName")
            price = _region_price(hit)
            product_url = hit.get("url")
            if not name or not price or not product_url:
                continue

            products.append(
                {
                    "name": name.strip(),
                    "price": price,
                    "store": "Leroy Merlin",
                    "url": urljoin(BASE_URL, product_url),
                    "brand": "Leroy Merlin",
                    "category": _category(hit, product_query),
                    "image_url": _picture_url(hit),
                }
            )

        return products
    except Exception as e:
        print(f"Erro ao buscar na Leroy Merlin: {e}")
        return []
