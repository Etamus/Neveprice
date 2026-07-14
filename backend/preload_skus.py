import argparse
from datetime import datetime

from database import SessionLocal
from models.product import PriceHistory, Product
from services.scraper_service import KNOWN_SKUS, run_all_scrapers


def _has_cached_sku(db, sku):
    return (
        db.query(Product)
        .join(PriceHistory, Product.id == PriceHistory.product_id)
        .filter(Product.sku == sku)
        .first()
        is not None
    )


def preload_skus(force=False, limit=None):
    skus = sorted(KNOWN_SKUS)
    if limit:
        skus = skus[:limit]

    db = SessionLocal()
    try:
        total = len(skus)
        for index, sku in enumerate(skus, start=1):
            if not force and _has_cached_sku(db, sku):
                print(f"[{index}/{total}] {sku}: ja existe no banco, pulando.")
                continue

            print(f"[{index}/{total}] {sku}: buscando lojistas...")
            started_at = datetime.now()
            summary = run_all_scrapers(sku, db)
            elapsed = (datetime.now() - started_at).total_seconds()
            print(
                f"[{index}/{total}] {sku}: "
                f"{len(summary['results'])} ofertas, "
                f"{len(summary['comparison'])} linhas, "
                f"{elapsed:.1f}s."
            )
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pre-carrega as SKUs conhecidas no SQLite local."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Busca novamente mesmo quando a SKU ja existe no banco.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limita a quantidade de SKUs processadas.",
    )
    args = parser.parse_args()
    preload_skus(force=args.force, limit=args.limit)
