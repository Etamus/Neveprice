from bs4 import BeautifulSoup
from utils import fetch_marketplace_data

def scrape_mercadoLivre(product_name):
    try:
        response = fetch_marketplace_data("mercado_livre", product_name)
        if not response: return []

        soup = BeautifulSoup(response, "html.parser")
        
        # Tentamos o seletor clássico E o novo padrão 'poly'
        items = soup.find_all("li", class_="ui-search-layout__item")
        if not items:
            items = soup.find_all("div", class_="poly-card")
            
        print(f"DEBUG: Encontrei {len(items)} itens no Mercado Livre")
        products = []

        for item in items[:3]:
            # O título agora costuma estar em h2 ou a com classe poly
            title_tag = item.find("a", class_="poly-component__title") or item.find("h2")
            price_container = item.find("span", class_="andes-money-amount")

            if title_tag and price_container:
                nome_texto = title_tag.text.strip()
                link_url = title_tag.get('href', "")
                
                fraction = price_container.find("span", class_="andes-money-amount__fraction")
                cents = price_container.find("span", class_="andes-money-amount__cents")
                
                if fraction:
                    str_price = fraction.text.replace(".", "")
                    str_price += f".{cents.text}" if cents else ".00"
                    
                    products.append({
                        "name": nome_texto,
                        "price": float(str_price),
                        "store": "Mercado Livre",
                        "url": link_url
                    })
        return products
    except Exception as e:
        print(f"Erro no scraper do Mercado Livre: {e}")
        return []
    