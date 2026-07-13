from bs4 import BeautifulSoup

from utils import fetch_marketplace_data


def _parse_price(price_whole, price_fraction=None):
    if not price_whole:
        return None

    value = price_whole.text.strip().replace(".", "").replace(",", "")
    if price_fraction and price_fraction.text.strip():
        value = f"{value}.{price_fraction.text.strip()}"

    try:
        return float(value)
    except ValueError:
        return None


def scrape_amazon(product_name):
    html_content = fetch_marketplace_data("amazon", product_name)
    if not html_content:
        return []

    soup = BeautifulSoup(html_content, "html.parser")
    products = []

    items = soup.find_all("div", {"data-component-type": "s-search-result"})[:8]

    for item in items:
        title_tag = item.find("h2")
        price_whole = item.find("span", class_="a-price-whole")
        price_fraction = item.find("span", class_="a-price-fraction")
        link_tag = item.find("a", class_="a-link-normal s-no-outline")
        image_tag = item.find("img", class_="s-image")
        price = _parse_price(price_whole, price_fraction)

        if title_tag and price:
            products.append(
                {
                    "name": title_tag.text.strip(),
                    "price": price,
                    "store": "Amazon",
                    "url": "https://www.amazon.com.br" + link_tag["href"] if link_tag else "",
                    "brand": "Amazon",
                    "category": product_name,
                    "image_url": image_tag.get("src") if image_tag else None,
                }
            )

    return products
