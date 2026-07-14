# NevePrice

NevePrice é um comparador local de preços para pesquisar produtos em lojas-alvo e visualizar ofertas em lista, cards e dashboard por item.

## Estrutura

```text
NevePrice/
├── backend/          # FastAPI, SQLAlchemy e SQLite local
├── components/       # Componentes React
├── models/           # Tipos do frontend
├── public/
├── src/
├── preparar.bat
├── iniciar.bat
├── package.json      # Frontend Vite na raiz
└── README.md
```

## Lojas-alvo

A comparação considera somente estas lojas:

- Mercado Livre
- Shopee
- Leroy Merlin
- Amazon Brasil
- Magazine Luiza
- Dufrio
- Friolar
- Refrigeração Mota
- MG Parts
- Gold Service
- ComClick

Fontes gratuitas podem bloquear ou omitir dados em alguns momentos. Quando uma loja não retorna preço confiável, ela é tratada como indisponível.

## Preparar no Windows

Execute:

```bat
preparar.bat
```

O script cria `backend\.venv`, instala dependências Python, instala dependências Node na raiz e cria arquivos `.env` locais sem sobrescrever configurações existentes.

## Iniciar

Execute:

```bat
iniciar.bat
```

Endereços locais:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`

## Banco de dados

Por padrão, o backend usa SQLite local em:

```text
backend/precos.db
```

As tabelas são criadas automaticamente na inicialização do backend.
