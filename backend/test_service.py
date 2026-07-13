from database import SessionLocal
from services.scraper_service import run_all_scrapers

def test():
    db = SessionLocal()
    termo = "SSD 1TB"
    
    try:
        total = run_all_scrapers(termo, db)
        print(f"--- Sucesso! {total} itens processados e salvos no banco. ---")
    except Exception as e:
        print(f"--- Erro no teste: {e} ---")
    finally:
        db.close()

if __name__ == "__main__":
    test()