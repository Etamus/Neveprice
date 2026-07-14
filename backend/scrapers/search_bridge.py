import re
import unicodedata
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import requests
from bs4 import BeautifulSoup
from cachetools import TTLCache, cached

DIRECT_SEARCH_URL = "https://html.duckduckgo.com/html/?q="
READER_URL = "https://r.jina.ai/http://https://html.duckduckgo.com/html/?q="

STORE_CONFIG = {
    "amazon": {
        "label": "Amazon Brasil",
        "domain": "amazon.com.br",
        "site_query": "site:amazon.com.br/dp OR site:amazon.com.br/gp/product",
    },
    "magalu": {
        "label": "Magazine Luiza",
        "domain": "magazineluiza.com.br",
        "site_query": "site:magazineluiza.com.br/p OR site:magazineluiza.com.br/produto",
    },
    "mercado_livre": {
        "label": "Mercado Livre",
        "domain": "mercadolivre.com.br",
        "site_query": "site:produto.mercadolivre.com.br OR site:mercadolivre.com.br/p",
    },
    "leroy_merlin": {
        "label": "Leroy Merlin",
        "domain": "leroymerlin.com.br",
        "site_query": "site:leroymerlin.com.br",
    },
    "shopee": {
        "label": "Shopee",
        "domain": "shopee.com.br",
        "site_query": "site:shopee.com.br/product",
    },
    "dufrio": {
        "label": "Dufrio",
        "domain": "dufrio.com.br",
        "site_query": "site:dufrio.com.br",
    },
    "friolar": {
        "label": "Friolar",
        "domain": "friolarpecas.com.br",
        "domains": ("friolarpecas.com.br", "friolar.lojaintegrada.com.br"),
        "site_query": "site:friolarpecas.com.br OR site:friolar.lojaintegrada.com.br",
    },
    "refrigeracao_mota": {
        "label": "Refrigeração Mota",
        "domain": "refrigeracaomota.com.br",
        "site_query": "site:refrigeracaomota.com.br/loja",
    },
    "mg_parts": {
        "label": "MG Parts",
        "domain": "mgparts.com.br",
        "site_query": "site:mgparts.com.br/products",
    },
    "gold_service": {
        "label": "Gold Service",
        "domain": "goldservice.com.br",
        "site_query": "site:goldservice.com.br",
    },
    "comclick": {
        "label": "ComClick",
        "domain": "comclick.com.br",
        "site_query": "site:comclick.com.br",
    },
}

GENERIC_TITLE_TERMS = (
    "barata",
    "barato",
    "com preços",
    "com precos",
    "compare",
    "comprar",
    "em oferta",
    "melhor preço",
    "melhor preco",
    "melhores preços",
    "melhores precos",
    "ofertas",
    "preços excelentes",
    "precos excelentes",
    "promoção",
    "promocao",
)

GENERIC_PATH_PARTS = (
    "/busca",
    "/buscar",
    "/campanha",
    "/categoria",
    "/departamento",
    "/lista",
    "/listas",
    "/ofertas",
    "/search",
    "/tag/",
)

PRODUCT_STOP_WORDS = {
    "a",
    "as",
    "br",
    "com",
    "da",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "no",
    "o",
    "os",
    "para",
    "por",
    "pre",
    "preco",
    "precos",
    "preos",
    "excelente",
    "excelentes",
}

cache = TTLCache(maxsize=100, ttl=900)


def _headers():
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    }


def _clean_markdown(value):
    value = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", value or "")
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = value.replace("**", "")
    return re.sub(r"\s+", " ", value).strip()


def _normalize_text(value):
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_text.lower()


def _tokens(value):
    return {
        token
        for token in re.findall(r"[a-z0-9]+", _normalize_text(value))
        if len(token) > 1 and token not in PRODUCT_STOP_WORDS
    }


def _unwrap_duckduckgo_url(url):
    if not url:
        return ""

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if "uddg" in query:
        return unquote(query["uddg"][0])
    return url


def _parse_price(value):
    cleaned = (
        value.replace("R$", "")
        .replace("\xa0", " ")
        .replace(" ", "")
        .strip()
    )

    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        parts = cleaned.split(".")
        cleaned = "".join(parts) if len(parts[-1]) == 3 else cleaned

    try:
        price = float(cleaned)
    except ValueError:
        return None

    return price if price > 0 else None


def _seller_from_product_url(product_url, store_key, store_label):
    parsed = urlparse(product_url or "")
    query = parse_qs(parsed.query)

    seller_id = (query.get("seller_id") or [""])[0].strip()
    if seller_id:
        return f"{seller_id}-Magalu" if store_key == "magalu" else seller_id

    path = unquote(parsed.path)
    if store_key == "mercado_livre":
        match = re.search(r"/(MLB-\d+)", path, re.I)
        if match:
            return f"{match.group(1).upper()}-ML"
        match = re.search(r"/((?:MLB|MLBU)\d+)", path, re.I)
        if match:
            return f"{match.group(1).upper()}-ML"

    if store_key == "shopee":
        match = re.search(r"/product/(\d+)/\d+|-i\.(\d+)\.\d+", path)
        shop_id = next((group for group in match.groups() if group), None) if match else None
        if shop_id:
            return f"Shopee Loja {shop_id}"

    return store_label


def _prices_from_text(text):
    prices = []
    for match in re.finditer(r"R\$\s*[\d.]+(?:,\d{2})?", text):
        before = text[max(0, match.start() - 12) : match.start()].lower()
        after = text[match.end() : match.end() + 30].lower()
        if re.search(r"\d+\s*x\s*$", before) or "sem juros" in after:
            continue

        price = _parse_price(match.group())
        if price:
            prices.append(price)

    return prices


def _minimum_price(product_query):
    tokens = _tokens(product_query)

    if tokens.intersection(
        {
            "condicionado",
            "cooktop",
            "fogao",
            "freezer",
            "geladeira",
            "lavadora",
            "maquina",
            "microondas",
            "refrigerador",
        }
    ):
        return 500

    if tokens.intersection({"notebook", "macbook"}):
        return 700

    if tokens.intersection({"celular", "iphone", "smartphone", "tablet", "tv"}):
        return 250

    return 1


def _clean_title(title, store_label):
    cleaned = _clean_markdown(title)
    cleaned = re.sub(r"\s+[|-]\s+.*$", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -|")

    if cleaned.lower() in {store_label.lower(), "shopee brasil"}:
        return ""

    return cleaned


def _is_generic_title(title, product_query):
    normalized_title = _normalize_text(title)

    if any(term in normalized_title for term in GENERIC_TITLE_TERMS):
        return True

    query_tokens = _tokens(product_query)
    title_tokens = _tokens(title)

    if query_tokens and not query_tokens.intersection(title_tokens):
        return True

    return len(title_tokens) < 3


def _is_product_url(product_url, store_key):
    parsed = urlparse(product_url)
    host = parsed.netloc.lower()
    path = unquote(parsed.path).lower()

    if "duckduckgo.com/y.js" in product_url:
        return False

    if any(part in path for part in GENERIC_PATH_PARTS):
        return False

    if store_key == "amazon":
        return "/dp/" in path or "/gp/product/" in path

    if store_key == "magalu":
        return "/p/" in path or "/produto/" in path

    if store_key == "mercado_livre":
        return (
            "produto.mercadolivre" in host
            or "/p/" in path
            or "mlb-" in path
            or "_jm" in path
        )

    if store_key == "shopee":
        return "/product/" in path or re.search(r"-i\.\d+\.\d+", path)

    if store_key == "leroy_merlin":
        return path.count("/") >= 2

    if store_key == "dufrio":
        return path.endswith(".html")

    if store_key == "friolar":
        return (
            "/produto/" in path
            or path.endswith(".html")
            or (path.count("/") >= 1 and "/products/" not in path)
        )

    if store_key == "refrigeracao_mota":
        return "/loja/" in path

    if store_key == "mg_parts":
        return "/products/" in path

    if store_key in {"gold_service", "comclick"}:
        return path.count("/") >= 1

    return True


def _direct_search_results(query):
    try:
        response = requests.get(
            DIRECT_SEARCH_URL + quote_plus(query),
            headers=_headers(),
            timeout=3,
        )
    except Exception as e:
        print(f"Ponte direta falhou: {e}")
        return []

    if response.status_code != 200:
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    results = []
    for block in soup.select(".result"):
        link = block.select_one(".result__a")
        if not link:
            continue

        snippet = block.select_one(".result__snippet")
        title = _clean_markdown(link.get_text(" ", strip=True))
        product_url = _unwrap_duckduckgo_url(link.get("href", ""))
        text = " ".join(
            value
            for value in (
                title,
                snippet.get_text(" ", strip=True) if snippet else "",
            )
            if value
        )
        results.append((title, product_url, text))

    return results


def _result_blocks(markdown):
    parts = re.split(r"\n##\s+", markdown or "")
    return [part for part in parts if "duckduckgo.com/l/?uddg=" in part]


def _title_and_url(block):
    match = re.search(r"\[([^\]]+)\]\((https://duckduckgo\.com/l/\?uddg=[^)]+)\)", block)
    if not match:
        return "", ""

    return _clean_markdown(match.group(1)), _unwrap_duckduckgo_url(match.group(2))


def _reader_search_results(query):
    try:
        response = requests.get(
            READER_URL + quote_plus(query),
            headers=_headers(),
            timeout=5,
        )
    except Exception as e:
        print(f"Ponte alternativa falhou: {e}")
        return []

    if response.status_code != 200:
        print(f"Ponte de busca retornou HTTP {response.status_code}")
        return []

    results = []
    for block in _result_blocks(response.text):
        title, product_url = _title_and_url(block)
        results.append((title, product_url, _clean_markdown(block)))

    return results


@cached(cache)
def scrape_search_bridge(product_query: str, store_key: str):
    config = STORE_CONFIG[store_key]
    query = f'{config["site_query"]} {product_query} R$'
    minimum_price = _minimum_price(product_query)

    try:
        allowed_domains = config.get("domains") or (config["domain"],)
        search_results = _direct_search_results(query)
        if not search_results:
            search_results = _reader_search_results(query)

        products = []
        seen_urls = set()

        for raw_title, product_url, text in search_results:
            if not any(domain in product_url for domain in allowed_domains):
                continue
            if not _is_product_url(product_url, store_key):
                continue

            title = _clean_title(raw_title, config["label"])
            if not title or _is_generic_title(title, product_query):
                continue

            clean_url = product_url.split("?")[0].rstrip("/")
            if clean_url in seen_urls:
                continue
            seen_urls.add(clean_url)

            prices = [
                price
                for price in _prices_from_text(_clean_markdown(text))
                if price >= minimum_price
            ]
            if not title or not product_url or not prices:
                continue

            products.append(
                {
                    "name": title,
                    "price": min(prices),
                    "store": _seller_from_product_url(
                        product_url,
                        store_key,
                        config["label"],
                    ),
                    "source": config["label"],
                    "seller": _seller_from_product_url(
                        product_url,
                        store_key,
                        config["label"],
                    ),
                    "url": product_url,
                    "brand": config["label"],
                    "category": product_query,
                    "image_url": None,
                }
            )

            if len(products) >= 12:
                break

        return products
    except Exception as e:
        print(f"Erro na ponte de busca para {config['label']}: {e}")
        return []


def scrape_mercado_livre_bridge(product_query: str):
    return scrape_search_bridge(product_query, "mercado_livre")


def scrape_shopee_bridge(product_query: str):
    return scrape_search_bridge(product_query, "shopee")


def scrape_amazon_bridge(product_query: str):
    return scrape_search_bridge(product_query, "amazon")


def scrape_magalu_bridge(product_query: str):
    return scrape_search_bridge(product_query, "magalu")


def scrape_leroy_bridge(product_query: str):
    return scrape_search_bridge(product_query, "leroy_merlin")


def scrape_dufrio_bridge(product_query: str):
    return scrape_search_bridge(product_query, "dufrio")


def scrape_friolar_bridge(product_query: str):
    return scrape_search_bridge(product_query, "friolar")


def scrape_refrigeracao_mota_bridge(product_query: str):
    return scrape_search_bridge(product_query, "refrigeracao_mota")


def scrape_mg_parts_bridge(product_query: str):
    return scrape_search_bridge(product_query, "mg_parts")


def scrape_gold_service_bridge(product_query: str):
    return scrape_search_bridge(product_query, "gold_service")


def scrape_comclick_bridge(product_query: str):
    return scrape_search_bridge(product_query, "comclick")
