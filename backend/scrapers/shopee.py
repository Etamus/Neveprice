from urllib.parse import quote_plus

import requests
from cachetools import TTLCache, cached

BASE_URL = "https://shopee.com.br"
SEARCH_URL = f"{BASE_URL}/api/v4/search/search_items"
IMAGE_URL = "https://down-br.img.susercontent.com/file/{image_id}"

cache = TTLCache(maxsize=100, ttl=900)


def _headers(product_query):
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Referer": f"{BASE_URL}/search?keyword={quote_plus(product_query)}",
        "x-api-source": "pc",
        "x-requested-with": "XMLHttpRequest",
    }


def _price(value):
    try:
        if value is None:
            return None
        price = float(value)
        if price > 100000:
            price = price / 100000
        return price if price > 0 else None
    except (TypeError, ValueError):
        return None


def _image_url(image_id):
    if not image_id:
        return None
    return IMAGE_URL.format(image_id=image_id)


@cached(cache)
def scrape_shopee(product_query: str):
    session = requests.Session()
    params = {
        "by": "relevancy",
        "keyword": product_query,
        "limit": 50,
        "newest": 0,
        "order": "desc",
        "page_type": "search",
        "scenario": "PAGE_GLOBAL_SEARCH",
        "version": 2,
    }

    try:
        session.get(
            f"{BASE_URL}/search",
            params={"keyword": product_query},
            headers=_headers(product_query),
            timeout=15,
        )
        response = session.get(
            SEARCH_URL,
            params=params,
            headers=_headers(product_query),
            timeout=15,
        )
        if response.status_code != 200:
            print(f"Shopee retornou HTTP {response.status_code}")
            return []

        data = response.json()
        if data.get("error"):
            print(f"Shopee retornou erro {data.get('error')}")
            return []

        products = []
        for item in data.get("items", []):
            basic = item.get("item_basic") or item
            name = basic.get("name")
            price = _price(basic.get("price") or basic.get("price_min"))
            shop_id = basic.get("shopid")
            item_id = basic.get("itemid")
            if not name or not price or not shop_id or not item_id:
                continue

            products.append(
                {
                    "name": name.strip(),
                    "price": price,
                    "store": "Shopee",
                    "url": f"{BASE_URL}/product/{shop_id}/{item_id}",
                    "brand": "Shopee",
                    "category": product_query,
                    "image_url": _image_url(basic.get("image")),
                }
            )

        return products
    except Exception as e:
        print(f"Erro ao buscar na Shopee: {e}")
        return []
