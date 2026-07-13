from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.product import PriceHistory, Product
from schemas.product import ProductCreate
from services.scraper_service import TARGET_STORES, run_all_scrapers

product_router = APIRouter()
TARGET_STORE_NAMES = [store["label"] for store in TARGET_STORES]


def _latest_products_query(db: Session):
    subquery = (
        db.query(
            PriceHistory.product_id,
            func.max(PriceHistory.timestamp).label("latest_timestamp"),
        )
        .group_by(PriceHistory.product_id)
        .subquery()
    )

    return (
        db.query(Product, PriceHistory)
        .join(PriceHistory, Product.id == PriceHistory.product_id)
        .join(
            subquery,
            (PriceHistory.product_id == subquery.c.product_id)
            & (PriceHistory.timestamp == subquery.c.latest_timestamp),
        )
    )


def _query_terms(search_text: str):
    return [term.strip() for term in search_text.split() if len(term.strip()) >= 2]


def _apply_search_filter(query, search_text: str, match_all: bool):
    terms = _query_terms(search_text)
    if not terms:
        return query

    clauses = [Product.name.ilike(f"%{term}%") for term in terms]
    return query.filter(and_(*clauses) if match_all else or_(*clauses))


def _serialize_results(results):
    return [
        {
            "id": product.id,
            "name": product.name,
            "brand": product.brand,
            "category": product.category,
            "image_url": product.image_url,
            "current_price": price.price,
            "store": price.store,
            "url": price.url,
            "last_update": price.timestamp,
        }
        for product, price in results
    ]


def _find_products(db: Session, search_text: Optional[str] = None):
    query = _latest_products_query(db).filter(PriceHistory.store.in_(TARGET_STORE_NAMES))

    if search_text:
        strict_results = (
            _apply_search_filter(query, search_text, match_all=True)
            .order_by(PriceHistory.price.asc())
            .limit(30)
            .all()
        )
        if strict_results:
            return strict_results

        return (
            _apply_search_filter(query, search_text, match_all=False)
            .order_by(PriceHistory.price.asc())
            .limit(30)
            .all()
        )

    return query.order_by(PriceHistory.timestamp.desc()).limit(50).all()


@product_router.post("/", status_code=201)
def create_product(product_data: ProductCreate, db: Session = Depends(get_db)):
    new_product = Product(
        name=product_data.name,
        brand=product_data.brand,
        description=product_data.description,
        category=product_data.category,
        image_url=product_data.image_url,
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    new_price = PriceHistory(
        product_id=new_product.id,
        price=product_data.initial_price.price,
        store=product_data.initial_price.store,
        url=product_data.initial_price.url,
    )

    db.add(new_price)
    db.commit()

    return {"message": "Produto e preco inicial cadastrados!", "id": new_product.id}


@product_router.get("/")
def search_products(
    q: Optional[str] = Query(None, min_length=2), db: Session = Depends(get_db)
):
    return _serialize_results(_find_products(db, q))


@product_router.post("/refresh")
def refresh_prices(q: str, db: Session = Depends(get_db)):
    summary = run_all_scrapers(q, db)
    return {
        "message": (
            "Busca finalizada. "
            f"{summary['processed_count']} precos novos ou atualizados"
        ),
        "stores": summary["stores"],
    }


@product_router.get("/search")
def search_and_update(q: str = Query(..., min_length=2), db: Session = Depends(get_db)):
    search_text = q.strip()
    summary = run_all_scrapers(search_text, db)
    results = summary["results"]
    unavailable_count = len([store for store in summary["stores"] if not store["available"]])

    if results:
        message = (
            f"Busca concluida em {len(summary['stores'])} lojas. "
            f"{len(results)} lojas com oferta e {unavailable_count} "
            "sem disponibilidade agora."
        )
    else:
        message = (
            "Nenhuma das lojas alvo retornou oferta nas fontes gratuitas agora. "
            "Cada loja foi marcada como Não disponível."
        )

    return {
        "message": message,
        "results": results,
        "stores": summary["stores"],
    }
