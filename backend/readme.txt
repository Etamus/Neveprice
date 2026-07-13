.venv\Scripts\Activate.ps1
.venv\Scripts\activate

python -m uvicorn backend.main:app --reload

http://127.0.0.1:8000/redoc

ngrok http 5173

Funcionamento do projeto:

Esse projeto utiliza as seguintes tecnologias:

- postgresql com sqlalchemy
    - postgresql é um SGBD ( Sistema Gerenciador de Banco de dados ) relacional.
        - relacional: organiza os dados em tabelas de linhas e colunas com chave primária e estrangeira
    - sqlalchemy permite a fácil comunicação com o banco de dados apenas configurando o arquivo database.py