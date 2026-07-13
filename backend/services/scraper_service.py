import random
import re
import time
import unicodedata
from datetime import datetime

from sqlalchemy.orm import Session

from models.product import PriceHistory, Product
from scrapers.amazon import scrape_amazon
from scrapers.comparison import (
    scrape_amazon_comparison,
    scrape_magalu_comparison,
    scrape_mercado_livre_comparison,
    scrape_shopee_comparison,
)
from scrapers.leroy import scrape_leroy
from scrapers.mercadoLivre import scrape_mercadoLivre
from scrapers.search_bridge import (
    scrape_mercado_livre_bridge,
    scrape_shopee_bridge,
)
from scrapers.shopee import scrape_shopee
from services.mercado_livre_api import search_mercado_livre

TARGET_STORES = [
    {
        "key": "mercado_livre",
        "label": "Mercado Livre",
        "scrapers": [
            search_mercado_livre,
            scrape_mercadoLivre,
            scrape_mercado_livre_comparison,
            scrape_mercado_livre_bridge,
        ],
    },
    {
        "key": "shopee",
        "label": "Shopee",
        "scrapers": [
            scrape_shopee,
            scrape_shopee_comparison,
            scrape_shopee_bridge,
        ],
    },
    {
        "key": "leroy_merlin",
        "label": "Leroy Merlin",
        "scrapers": [
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
    },
    {
        "key": "magalu",
        "label": "Magazine Luiza",
        "scrapers": [
            scrape_magalu_comparison,
        ],
    },
]

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

ACCESSORY_TERMS = {
    "adaptador",
    "bolsa",
    "cabo",
    "capa",
    "carregador",
    "case",
    "estojo",
    "fonte",
    "pelicula",
    "suporte",
    "vidro",
}

PRODUCT_STOP_WORDS = {
    "a",
    "apple",
    "as",
    "celular",
    "com",
    "da",
    "das",
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

VARIANT_SCRAPERS = {
    "scrape_amazon_comparison",
    "scrape_leroy",
    "scrape_magalu_comparison",
    "scrape_mercado_livre_bridge",
    "scrape_mercado_livre_comparison",
    "scrape_search_bridge",
    "scrape_shopee_bridge",
    "scrape_shopee_comparison",
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
    for variant in (
        product_query.strip(),
        normalized,
        " ".join(token_list),
        " ".join(reversed(token_list)) if 1 < len(token_list) <= 4 else "",
    ):
        variant = variant.strip()
        if variant and variant not in variants:
            variants.append(variant)

    return variants


def _is_accessory_mismatch(item, product_query):
    query_tokens = _tokens(product_query)
    if not query_tokens.intersection(ELECTRONICS_TERMS):
        return False

    name_tokens = _tokens(item["name"])
    return any(
        term in name_tokens and term not in query_tokens for term in ACCESSORY_TERMS
    )


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
    return {
        token
        for token in re.findall(
            r"[a-z0-9]+",
            re.sub(
                r"(\d+)\s+(gb|tb|kg|pol|polegadas|litros|l|ml)",
                r"\1\2",
                _normalize_text(name),
            ),
        )
        if token not in PRODUCT_STOP_WORDS
        and token not in STORE_WORDS
        and len(token) > 1
    }


def _spec_tokens(tokens, query_tokens):
    return {
        token
        for token in tokens
        if token not in query_tokens and any(character.isdigit() for character in token)
    }


def _same_product(cluster_tokens, item_tokens, query_tokens):
    if not cluster_tokens or not item_tokens:
        return False

    cluster_specs = _spec_tokens(cluster_tokens, query_tokens)
    item_specs = _spec_tokens(item_tokens, query_tokens)
    if cluster_specs and item_specs and cluster_specs != item_specs:
        return False

    shared = cluster_tokens.intersection(item_tokens)
    score = len(shared) / max(1, max(len(cluster_tokens), len(item_tokens)))
    shared_numbers = {
        token for token in shared if any(character.isdigit() for character in token)
    }

    return score >= 0.72 or (
        score >= 0.62
        and bool(shared_numbers)
        and (not cluster_specs or not item_specs or cluster_specs == item_specs)
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
        cheapest = offers[0]
        prices = [offer["current_price"] for offer in offers]
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
                "store_count": len({offer["store"] for offer in offers}),
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

    return sorted(
        rows,
        key=lambda row: (
            row["cheapest_price"],
            -row["offer_count"],
            row["name"],
        ),
    )


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


def _run_store_scrapers(store_config, product_query):
    store_results = []
    query_variants = _query_variants(product_query)

    for scraper_func in store_config["scrapers"]:
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

            if len(normalized_results) >= 30:
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

        time.sleep(random.uniform(0.2, 0.6))

    return sorted(
        _deduplicate(store_results),
        key=lambda item: _sort_key(item, product_query),
    )


def run_all_scrapers(product_query: str, db: Session):
    print(f" LOG: Iniciando buscas gratuitas para '{product_query}'")
    store_payloads = []
    available_results = []
    response_id = 1

    for store_config in TARGET_STORES:
        store_items = _run_store_scrapers(store_config, product_query)
        store_products = []

        for store_item in store_items[:30]:
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

    processed_count = 0
    for index, item in enumerate(available_results[:150]):
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
    comparison_rows = _build_comparison_rows(available_results, product_query)
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
