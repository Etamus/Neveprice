import random
import re
import time
import unicodedata
from datetime import datetime

from sqlalchemy.orm import Session

from models.product import PriceHistory, Product
from scrapers.amazon import scrape_amazon
from scrapers.comparison import (
    scrape_comparison_catalog,
    scrape_target_catalog,
    scrape_amazon_comparison,
    scrape_magalu_comparison,
    scrape_mercado_livre_comparison,
    scrape_shopee_comparison,
)
from scrapers.leroy import scrape_leroy
from scrapers.search_bridge import scrape_mercado_livre_bridge

TARGET_STORES = [
    {
        "key": "mercado_livre",
        "label": "Mercado Livre",
        "scrapers": [
            scrape_mercado_livre_comparison,
            scrape_mercado_livre_bridge,
        ],
        "focused_scrapers": [
            scrape_mercado_livre_bridge,
        ],
    },
    {
        "key": "shopee",
        "label": "Shopee",
        "scrapers": [
            scrape_shopee_comparison,
        ],
        "focused_scrapers": [
            scrape_shopee_comparison,
        ],
    },
    {
        "key": "leroy_merlin",
        "label": "Leroy Merlin",
        "scrapers": [
            scrape_leroy,
        ],
        "focused_scrapers": [
            scrape_leroy,
        ],
    },
    {
        "key": "amazon",
        "label": "Amazon",
        "scrapers": [
            scrape_amazon,
            scrape_amazon_comparison,
        ],
        "focused_scrapers": [
            scrape_amazon,
        ],
    },
    {
        "key": "magalu",
        "label": "Magazine Luiza",
        "scrapers": [
            scrape_magalu_comparison,
        ],
        "focused_scrapers": [
            scrape_magalu_comparison,
        ],
    },
]

STORE_ITEM_LIMIT = 50
TARGETED_CANDIDATE_LIMIT = 3
CATALOG_ROW_LIMIT = 30

ELECTRONICS_TERMS = {
    "iphone",
    "celular",
    "smartphone",
    "notebook",
    "macbook",
    "ipad",
    "tablet",
    "playstation",
    "ps5",
    "xbox",
    "nintendo",
    "tv",
    "televisao",
    "monitor",
    "camera",
}

APPLIANCE_TERMS = {
    "ar",
    "condicionado",
    "cooktop",
    "coifa",
    "fogao",
    "freezer",
    "geladeira",
    "lava",
    "lavadora",
    "maquina",
    "microondas",
    "refrigerador",
}

ACCESSORY_TERMS = {
    "adaptador",
    "adesivo",
    "borracha",
    "bolsa",
    "cabo",
    "capa",
    "carregador",
    "case",
    "controle",
    "estojo",
    "filtro",
    "fonte",
    "gaveta",
    "grade",
    "kit",
    "pelicula",
    "peca",
    "pecas",
    "prateleira",
    "refil",
    "suporte",
    "vidro",
}

PRODUCT_STOP_WORDS = {
    "a",
    "apple",
    "as",
    "barata",
    "barato",
    "br",
    "celular",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "frete",
    "em",
    "gratis",
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
    "promocao",
}

STORE_WORDS = {
    "amazon",
    "livre",
    "loja",
    "magalu",
    "magazine",
    "mercado",
    "merlin",
    "leroy",
    "shopee",
}

KNOWN_BRANDS = {
    "apple",
    "brastemp",
    "consul",
    "continental",
    "electrolux",
    "elgin",
    "fast",
    "fischer",
    "hisense",
    "hq",
    "lg",
    "midea",
    "panasonic",
    "philco",
    "samsung",
    "shop",
}

VARIANT_SCRAPERS = {
    "scrape_amazon_comparison",
    "scrape_leroy",
    "scrape_leroy_bridge",
    "scrape_magalu_comparison",
    "scrape_magalu_bridge",
    "scrape_mercado_livre_bridge",
    "scrape_mercado_livre_comparison",
    "scrape_search_bridge",
    "scrape_shopee_bridge",
    "scrape_shopee_comparison",
    "scrape_amazon_bridge",
}


def _normalize_text(value):
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_text.lower()


def _tokens(value):
    return set(re.findall(r"[a-z0-9]+", _normalize_text(value)))


def _query_variants(product_query):
    normalized = _normalize_text(product_query)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    token_list = re.findall(r"[a-z0-9]+", normalized)

    variants = []
    seen_variants = set()
    for variant in (
        product_query.strip(),
        normalized,
        " ".join(token_list),
        " ".join(reversed(token_list)) if 1 < len(token_list) <= 4 else "",
    ):
        variant = variant.strip()
        variant_key = _normalize_text(variant)
        if variant and variant_key not in seen_variants:
            variants.append(variant)
            seen_variants.add(variant_key)

    return variants


def _is_accessory_mismatch(item, product_query):
    query_tokens = _tokens(product_query)
    if not query_tokens.intersection(ELECTRONICS_TERMS | APPLIANCE_TERMS):
        return False

    name_tokens = _tokens(item["name"])
    return any(
        term in name_tokens and term not in query_tokens for term in ACCESSORY_TERMS
    )


def _minimum_expected_price(product_query):
    query_tokens = _tokens(product_query)

    if query_tokens.intersection(
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

    if query_tokens.intersection({"notebook", "macbook"}):
        return 700

    if query_tokens.intersection({"celular", "iphone", "smartphone", "tablet", "tv"}):
        return 250

    return 1


def _is_generic_listing_name(name):
    normalized = _normalize_text(name)
    generic_phrases = (
        "barata",
        "barato",
        "com precos",
        "compare",
        "comprar",
        "em oferta",
        "melhor preco",
        "melhores precos",
        "ofertas",
        "precos excelentes",
        "promocao",
    )
    return any(phrase in normalized for phrase in generic_phrases)


def _sort_key(item, product_query):
    query_tokens = _tokens(product_query)
    name_tokens = _tokens(item["name"])
    missing_terms = len(query_tokens - name_tokens)
    phrase_miss = int(_normalize_text(product_query) not in _normalize_text(item["name"]))
    return (missing_terms, phrase_miss, item["price"])


def _normalize_result(item, product_query, store_label=None):
    name = (item.get("name") or "").strip()
    url = (item.get("url") or "").strip()
    store = store_label or (item.get("store") or "").strip() or "Loja"

    try:
        price = float(item.get("price"))
    except (TypeError, ValueError):
        return None

    if not name or not url or price <= 0:
        return None

    if price < _minimum_expected_price(product_query):
        return None

    if _is_generic_listing_name(name):
        return None

    return {
        "name": name[:255],
        "price": price,
        "store": store[:100],
        "url": url[:1000],
        "brand": (item.get("brand") or store or "Oferta")[:100],
        "category": (item.get("category") or product_query)[:100],
        "image_url": item.get("image_url"),
    }


def _deduplicate(items):
    unique = []
    seen_urls = set()
    seen_listings = set()

    for item in items:
        url_key = item["url"].split("?")[0].rstrip("/")
        listing_key = (
            _normalize_text(item["store"]),
            " ".join(sorted(_product_tokens(item["name"]))),
            round(item["price"], 2),
        )

        if url_key in seen_urls or listing_key in seen_listings:
            continue
        seen_urls.add(url_key)
        seen_listings.add(listing_key)
        unique.append(item)

    return unique


def _product_response(item, fallback_id):
    return {
        "id": item.get("id") or fallback_id,
        "name": item["name"],
        "brand": item["brand"],
        "category": item["category"],
        "image_url": item.get("image_url"),
        "current_price": item["price"],
        "store": item["store"],
        "url": item["url"],
        "last_update": datetime.utcnow().isoformat(),
    }


def _product_tokens(name):
    normalized = _normalize_text(name)
    normalized = normalized.replace("frostfree", "frost free")
    normalized = re.sub(r"(\d+)\s*(btus?|btu)\b", r"\1btu", normalized)
    normalized = re.sub(r"(\d+)\s*(litros?|lts?|lt|l)\b", r"\1l", normalized)
    normalized = re.sub(r"(\d+)\s*(volts?|volt|v)\b", r"\1v", normalized)
    normalized = re.sub(r"(\d+)\s*(polegadas?|pol)\b", r"\1pol", normalized)
    normalized = re.sub(r"(\d+)\s*(quilos?|kg)\b", r"\1kg", normalized)
    normalized = re.sub(r"(\d+)\s*(gb|tb|ml|w)\b", r"\1\2", normalized)

    tokens = {
        token
        for token in re.findall(r"[a-z0-9]+", normalized)
        if token not in PRODUCT_STOP_WORDS
        and token not in STORE_WORDS
        and len(token) > 1
    }
    if "geladeira" in tokens:
        tokens.add("refrigerador")
    if "refrigerador" in tokens:
        tokens.add("geladeira")
    if "geladeiras" in tokens:
        tokens.update({"geladeira", "refrigerador"})
    if "refrigeradores" in tokens:
        tokens.update({"geladeira", "refrigerador"})
    return tokens


def _spec_tokens(tokens, query_tokens):
    return {
        token
        for token in tokens
        if token not in query_tokens and any(character.isdigit() for character in token)
    }


def _brand_tokens(tokens):
    return tokens.intersection(KNOWN_BRANDS)


def _model_tokens(tokens):
    return {
        token
        for token in tokens
        if re.search(r"[a-z]+\d|\d+[a-z]+", token)
    }


def _numeric_tokens(tokens):
    return {token for token in tokens if any(character.isdigit() for character in token)}


def _has_accessory_token(tokens):
    return bool(tokens.intersection(ACCESSORY_TERMS))


def _same_product(cluster_tokens, item_tokens, query_tokens):
    if not cluster_tokens or not item_tokens:
        return False

    if _has_accessory_token(cluster_tokens) != _has_accessory_token(item_tokens):
        return False

    cluster_brands = _brand_tokens(cluster_tokens)
    item_brands = _brand_tokens(item_tokens)
    if cluster_brands and item_brands and not cluster_brands.intersection(item_brands):
        return False

    cluster_models = _model_tokens(cluster_tokens)
    item_models = _model_tokens(item_tokens)
    if cluster_models and item_models and not cluster_models.intersection(item_models):
        return False

    cluster_numbers = _numeric_tokens(cluster_tokens)
    item_numbers = _numeric_tokens(item_tokens)
    if cluster_numbers and item_numbers and not cluster_numbers.intersection(item_numbers):
        return False

    shared = cluster_tokens.intersection(item_tokens)
    union_score = len(shared) / max(1, max(len(cluster_tokens), len(item_tokens)))
    containment_score = len(shared) / max(1, min(len(cluster_tokens), len(item_tokens)))
    shared_numbers = {
        token for token in shared if any(character.isdigit() for character in token)
    }

    return len(shared) >= 3 and (
        union_score >= 0.52
        or containment_score >= 0.66
        or (bool(shared_numbers) and containment_score >= 0.55)
    )


def _build_comparison_rows(products, product_query):
    clusters = []
    query_tokens = _product_tokens(product_query)

    for product in products:
        item_tokens = _product_tokens(product["name"])
        target_cluster = None

        for cluster in clusters:
            if _same_product(cluster["tokens"], item_tokens, query_tokens):
                target_cluster = cluster
                break

        if not target_cluster:
            target_cluster = {"tokens": set(item_tokens), "offers": []}
            clusters.append(target_cluster)

        target_cluster["tokens"].update(item_tokens)
        target_cluster["offers"].append(product)

    rows = []
    for index, cluster in enumerate(clusters, start=1):
        offers = sorted(cluster["offers"], key=lambda item: item["current_price"])
        best_by_store = {}
        for offer in offers:
            current = best_by_store.get(offer["store"])
            if not current or offer["current_price"] < current["current_price"]:
                best_by_store[offer["store"]] = offer

        store_offers = sorted(
            best_by_store.values(),
            key=lambda item: item["current_price"],
        )
        cheapest = store_offers[0]
        prices = [offer["current_price"] for offer in store_offers]
        pma = sum(prices) / len(prices)
        difference_value = cheapest["current_price"] - pma
        difference_percent = (
            abs(difference_value) / pma * 100
            if pma > 0
            else 0
        )

        rows.append(
            {
                "id": index,
                "name": cheapest["name"],
                "store_count": len(store_offers),
                "offer_count": len(offers),
                "pma": round(pma, 2),
                "cheapest_price": cheapest["current_price"],
                "cheapest_store": cheapest["store"],
                "cheapest_url": cheapest["url"],
                "difference_value": round(difference_value, 2),
                "difference_percent": round(difference_percent, 2),
                "offers": offers,
            }
        )

    sorted_rows = sorted(
        rows,
        key=lambda row: (
            -row["store_count"],
            -row["offer_count"],
            row["cheapest_price"],
            row["name"],
        ),
    )
    return sorted_rows


def _catalog_product_response(item, fallback_id):
    return {
        "id": fallback_id,
        "name": item["name"],
        "brand": item.get("brand") or "Comparador",
        "category": item.get("category") or "Produto",
        "image_url": item.get("image_url"),
        "current_price": item["price"],
        "store": item.get("best_store") or "Comparador",
        "url": item["url"],
        "last_update": datetime.utcnow().isoformat(),
    }


def _build_catalog_rows(product_query):
    rows = []

    for index, item in enumerate(scrape_target_catalog(product_query, limit=CATALOG_ROW_LIMIT), start=1):
        offers = [
            _product_response(offer, (900000 + index) * 10 + offer_index)
            for offer_index, offer in enumerate(item.get("target_offers") or [], start=1)
        ]
        if not offers:
            continue

        store_offers = {}
        for offer in sorted(offers, key=lambda candidate: candidate["current_price"]):
            store_offers.setdefault(offer["store"], offer)

        best_offers = sorted(
            store_offers.values(),
            key=lambda offer: offer["current_price"],
        )
        cheapest = best_offers[0]
        prices = [offer["current_price"] for offer in best_offers]
        pma = sum(prices) / len(prices)
        difference_value = cheapest["current_price"] - pma
        rows.append(
            {
                "id": 900000 + index,
                "name": item["name"],
                "store_count": len(best_offers),
                "offer_count": len(offers),
                "pma": round(pma, 2),
                "cheapest_price": cheapest["current_price"],
                "cheapest_store": cheapest["store"],
                "cheapest_url": cheapest["url"],
                "difference_value": round(difference_value, 2),
                "difference_percent": round(abs(difference_value) / pma * 100, 2)
                if pma > 0
                else 0,
                "offers": best_offers,
            }
        )

    return rows


def _same_row_product(left, right, product_query):
    left_tokens = _product_tokens(left["name"])
    right_tokens = _product_tokens(right["name"])
    query_tokens = _product_tokens(product_query)

    return _same_product(left_tokens, right_tokens, query_tokens)


def _comparison_row_from_offers(row_id, name, offers):
    valid_offers = sorted(
        [
            offer
            for offer in offers
            if offer.get("current_price") and not isinstance(offer.get("current_price"), str)
        ],
        key=lambda offer: offer["current_price"],
    )
    best_by_store = {}

    for offer in valid_offers:
        current = best_by_store.get(offer["store"])
        if not current or offer["current_price"] < current["current_price"]:
            best_by_store[offer["store"]] = offer

    store_offers = sorted(
        best_by_store.values(),
        key=lambda offer: offer["current_price"],
    )
    cheapest = store_offers[0]
    prices = [offer["current_price"] for offer in store_offers]
    pma = sum(prices) / len(prices)
    difference_value = cheapest["current_price"] - pma

    return {
        "id": row_id,
        "name": name,
        "store_count": len(store_offers),
        "offer_count": len(valid_offers),
        "pma": round(pma, 2),
        "cheapest_price": cheapest["current_price"],
        "cheapest_store": cheapest["store"],
        "cheapest_url": cheapest["url"],
        "difference_value": round(difference_value, 2),
        "difference_percent": round(abs(difference_value) / pma * 100, 2)
        if pma > 0
        else 0,
        "offers": store_offers,
    }


def _merge_catalog_rows(actual_rows, catalog_rows, product_query):
    merged_rows = []
    used_catalog_indexes = set()

    for actual_row in actual_rows:
        matching_index = None
        matching_catalog = None

        for index, catalog_row in enumerate(catalog_rows):
            if index in used_catalog_indexes:
                continue
            if _same_row_product(actual_row, catalog_row, product_query):
                matching_index = index
                matching_catalog = catalog_row
                break

        if matching_catalog:
            used_catalog_indexes.add(matching_index)
            merged_rows.append(
                _comparison_row_from_offers(
                    actual_row["id"],
                    matching_catalog["name"],
                    [*actual_row["offers"], *matching_catalog["offers"]],
                )
            )
        else:
            merged_rows.append(actual_row)

    merged_rows.extend(
        catalog_row
        for index, catalog_row in enumerate(catalog_rows)
        if index not in used_catalog_indexes
    )

    return sorted(
        merged_rows,
        key=lambda row: (
            -row["store_count"],
            -row["offer_count"],
            row["cheapest_price"],
            row["name"],
        ),
    )


def _candidate_query_from_name(name):
    normalized = _normalize_text(name)
    normalized = normalized.replace("frostfree", "frost free")
    normalized = re.sub(r"(\d+)\s*(btus?|btu)\b", r"\1btu", normalized)
    normalized = re.sub(r"(\d+)\s*(litros?|lts?|lt|l)\b", r"\1l", normalized)
    normalized = re.sub(r"(\d+)\s*(volts?|volt|v)\b", r"\1v", normalized)
    normalized = re.sub(r"(\d+)\s*(polegadas?|pol)\b", r"\1pol", normalized)
    normalized = re.sub(r"(\d+)\s*(quilos?|kg)\b", r"\1kg", normalized)
    normalized = re.sub(r"(\d+)\s*(gb|tb|ml|w)\b", r"\1\2", normalized)

    tokens = []
    seen = set()
    for token in re.findall(r"[a-z0-9]+", normalized):
        if (
            token in PRODUCT_STOP_WORDS
            or token in STORE_WORDS
            or len(token) <= 1
            or token in seen
        ):
            continue
        seen.add(token)
        tokens.append(token)

    return " ".join(tokens[:9])


def _is_specific_candidate(candidate):
    tokens = _product_tokens(candidate)
    has_spec = any(any(character.isdigit() for character in token) for token in tokens)
    has_brand = bool(tokens.intersection(KNOWN_BRANDS))
    has_model = any(re.search(r"[a-z]+\d|\d+[a-z]+", token) for token in tokens)

    return len(tokens) >= 4 and (has_spec or has_brand or has_model)


def _matches_candidate_product(item, candidate_query):
    candidate_tokens = _product_tokens(candidate_query)
    item_tokens = _product_tokens(item["name"])

    if not candidate_tokens or not item_tokens:
        return False

    return _same_product(candidate_tokens, item_tokens, candidate_tokens)


def _catalog_candidate_queries(product_query):
    candidates = []

    for item in scrape_comparison_catalog(product_query, limit=10):
        item_name = item.get("name") or ""
        normalized = _normalize_result(
            {
                "name": item_name,
                "price": item.get("price"),
                "store": "Comparador",
                "url": item.get("url"),
                "brand": item.get("brand"),
                "category": item.get("category"),
                "image_url": item.get("image_url"),
            },
            product_query,
            "Comparador",
        )
        if not normalized or _is_accessory_mismatch(normalized, product_query):
            continue

        candidate = _candidate_query_from_name(item_name)
        if not _is_specific_candidate(candidate):
            continue
        if candidate not in candidates:
            candidates.append(candidate)

        if len(candidates) >= TARGETED_CANDIDATE_LIMIT:
            break

    return candidates


def _candidate_queries(products, product_query):
    rows = _build_comparison_rows(products, product_query)
    normalized_original = _normalize_text(product_query)
    query_tokens = _tokens(product_query)
    query_is_main_product = bool(
        query_tokens.intersection(ELECTRONICS_TERMS | APPLIANCE_TERMS)
        and not query_tokens.intersection(ACCESSORY_TERMS)
    )
    prioritized_rows = sorted(
        rows,
        key=lambda row: (
            row["store_count"] <= 1,
            -row["store_count"],
            -row["offer_count"],
            row["cheapest_price"],
            row["name"],
        ),
    )
    candidates = []

    for row in prioritized_rows:
        if query_is_main_product and _has_accessory_token(_product_tokens(row["name"])):
            continue

        candidate = _candidate_query_from_name(row["name"])
        if len(candidate.split()) < 3:
            continue
        if not _is_specific_candidate(candidate):
            continue
        if _normalize_text(candidate) == normalized_original:
            continue
        if candidate in candidates:
            continue

        candidates.append(candidate)
        if len(candidates) >= TARGETED_CANDIDATE_LIMIT:
            break

    return candidates


def _build_payloads(raw_by_store, product_query):
    store_payloads = []
    available_results = []
    response_id = 1

    for store_config in TARGET_STORES:
        store_items = sorted(
            _deduplicate(raw_by_store.get(store_config["key"], [])),
            key=lambda item: _sort_key(item, product_query),
        )
        store_products = []

        for store_item in store_items[:STORE_ITEM_LIMIT]:
            store_products.append(_product_response(store_item, response_id))
            response_id += 1

        available_results.extend(store_products)
        best_product = store_products[0] if store_products else None

        if best_product:
            store_payloads.append(
                {
                    "key": store_config["key"],
                    "label": store_config["label"],
                    "available": True,
                    "message": None,
                    "product": best_product,
                    "products": store_products,
                }
            )
        else:
            store_payloads.append(
                {
                    "key": store_config["key"],
                    "label": store_config["label"],
                    "available": False,
                    "message": "Não disponível",
                    "product": None,
                    "products": [],
                }
            )

    return available_results, store_payloads


def _save_result(item, db: Session):
    existing_price = (
        db.query(PriceHistory)
        .filter(PriceHistory.url == item["url"])
        .order_by(PriceHistory.timestamp.desc())
        .first()
    )

    if not existing_price:
        new_product = Product(
            name=item["name"],
            brand=item["brand"],
            category=item["category"],
            image_url=item["image_url"],
        )
        db.add(new_product)
        db.commit()
        db.refresh(new_product)

        new_price = PriceHistory(
            product_id=new_product.id,
            price=item["price"],
            store=item["store"],
            url=item["url"],
        )
        db.add(new_price)
        return 1

    product = db.query(Product).filter(Product.id == existing_price.product_id).first()
    if product:
        product.name = item["name"]
        product.brand = item["brand"]
        product.category = item["category"]
        product.image_url = item["image_url"] or product.image_url

    if existing_price.price != item["price"] or existing_price.store != item["store"]:
        new_price = PriceHistory(
            product_id=existing_price.product_id,
            price=item["price"],
            store=item["store"],
            url=item["url"],
        )
        db.add(new_price)
        return 1

    return 0


def _run_store_scrapers(store_config, product_query, focused=False):
    store_results = []
    query_variants = _query_variants(product_query)
    scraper_functions = (
        store_config.get("focused_scrapers")
        if focused and store_config.get("focused_scrapers")
        else store_config["scrapers"]
    )

    for scraper_func in scraper_functions:
        normalized_results = []
        variants = (
            query_variants
            if scraper_func.__name__ in VARIANT_SCRAPERS
            else query_variants[:1]
        )

        for variant in variants:
            try:
                results = scraper_func(variant)
            except Exception as e:
                print(f" WARNING: Scraper {scraper_func.__name__} falhou: {e}")
                results = []

            normalized_results.extend(
                normalized
                for item in results
                if (
                    normalized := _normalize_result(
                        item,
                        product_query,
                        store_config["label"],
                    )
                )
                and not _is_accessory_mismatch(normalized, product_query)
            )

            if len(normalized_results) >= STORE_ITEM_LIMIT:
                break

        if normalized_results:
            print(
                " LOG: "
                f"{store_config['label']} via {scraper_func.__name__} "
                f"retornou {len(normalized_results)} itens."
            )
            store_results.extend(normalized_results)
        else:
            print(
                " WARNING: "
                f"{store_config['label']} via {scraper_func.__name__} "
                "retornou lista vazia."
            )

        time.sleep(random.uniform(0.05, 0.15))

    return sorted(
        _deduplicate(store_results),
        key=lambda item: _sort_key(item, product_query),
    )


def run_all_scrapers(product_query: str, db: Session):
    print(f" LOG: Iniciando buscas gratuitas para '{product_query}'")
    raw_by_store = {}

    for store_config in TARGET_STORES:
        raw_by_store[store_config["key"]] = _run_store_scrapers(
            store_config,
            product_query,
        )

    available_results, store_payloads = _build_payloads(raw_by_store, product_query)
    targeted_queries = _catalog_candidate_queries(product_query)

    for candidate_query in _candidate_queries(available_results, product_query):
        if len(targeted_queries) >= TARGETED_CANDIDATE_LIMIT:
            break
        if candidate_query not in targeted_queries:
            targeted_queries.append(candidate_query)

    for candidate_query in targeted_queries:
        print(f" LOG: Busca focada por produto similar: '{candidate_query}'")
        for store_config in TARGET_STORES:
            extra_items = [
                item
                for item in _run_store_scrapers(
                    store_config,
                    candidate_query,
                    focused=True,
                )
                if _matches_candidate_product(item, candidate_query)
            ]
            if extra_items:
                raw_by_store.setdefault(store_config["key"], []).extend(extra_items)

    if targeted_queries:
        available_results, store_payloads = _build_payloads(
            raw_by_store,
            product_query,
        )

    processed_count = 0
    storage_limit = STORE_ITEM_LIMIT * len(TARGET_STORES)
    for index, item in enumerate(available_results[:storage_limit]):
        storage_item = {
            "name": item["name"],
            "price": item["current_price"],
            "store": item["store"],
            "url": item["url"],
            "brand": item["brand"],
            "category": item["category"],
            "image_url": item.get("image_url"),
        }
        try:
            processed_count += _save_result(storage_item, db)
        except Exception as e:
            print(f" ERROR: Falha ao processar item {index + 1}: {e}")
            db.rollback()

    db.commit()
    actual_comparison_rows = _build_comparison_rows(available_results, product_query)
    catalog_comparison_rows = _build_catalog_rows(product_query)
    comparison_rows = _merge_catalog_rows(
        actual_comparison_rows,
        catalog_comparison_rows,
        product_query,
    )
    print(
        " LOG: Finalizado. "
        f"{len(available_results)} ofertas encontradas, "
        f"{len(comparison_rows)} linhas comparativas, "
        f"{processed_count} precos novos/atualizados."
    )
    return {
        "processed_count": processed_count,
        "results": available_results,
        "stores": store_payloads,
        "comparison": comparison_rows,
    }
