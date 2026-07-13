@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend\"
set "FRONTEND_DIR=%ROOT%frontend\"
set "VENV_DIR=%BACKEND_DIR%.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "BACKEND_ENV=%BACKEND_DIR%.env"
set "FRONTEND_ENV=%FRONTEND_DIR%.env.local"

echo.
echo === NevePrice: preparacao local ===
echo Pasta do projeto: "%ROOT%"
echo.

if not exist "%BACKEND_DIR%main.py" (
  echo ERRO: A pasta backend nao foi encontrada em "%BACKEND_DIR%".
  exit /b 1
)

if not exist "%FRONTEND_DIR%package.json" (
  echo ERRO: A pasta frontend nao foi encontrada em "%FRONTEND_DIR%".
  exit /b 1
)

call :find_python
if not defined PY_CMD (
  echo ERRO: Python nao foi encontrado.
  echo Instale o Python e deixe o comando python ou py disponivel no PATH.
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale o Node.js e deixe o comando node disponivel no PATH.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERRO: npm nao foi encontrado.
  echo Instale o Node.js com npm e tente novamente.
  exit /b 1
)

echo Python: %PY_CMD%
node --version
call npm --version
echo.

if not exist "%VENV_PY%" (
  if exist "%VENV_DIR%" (
    echo Ambiente virtual incompleto encontrado. Recriando "%VENV_DIR%"...
    call :remove_directory "%VENV_DIR%" "%BACKEND_DIR%"
    if errorlevel 1 (
      echo ERRO: Nao foi possivel remover o ambiente virtual incompleto.
      exit /b 1
    )
  )
  echo Criando ambiente virtual em "%VENV_DIR%"...
  %PY_CMD% -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo ERRO: Nao foi possivel criar o ambiente virtual do backend.
    exit /b 1
  )
)

"%VENV_PY%" --version >nul 2>nul
if errorlevel 1 (
  echo Ambiente virtual existente nao esta executando corretamente. Recriando "%VENV_DIR%"...
  call :remove_directory "%VENV_DIR%" "%BACKEND_DIR%"
  if errorlevel 1 (
    echo ERRO: Nao foi possivel remover o ambiente virtual antigo.
    exit /b 1
  )

  %PY_CMD% -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo ERRO: Nao foi possivel recriar o ambiente virtual do backend.
    exit /b 1
  )

  "%VENV_PY%" --version >nul 2>nul
  if errorlevel 1 (
    echo ERRO: O Python do ambiente virtual ainda nao executa corretamente.
    exit /b 1
  )
)

echo Atualizando pip no ambiente virtual...
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 (
  echo ERRO: Falha ao atualizar o pip.
  exit /b 1
)

echo Instalando dependencias do backend...
"%VENV_PY%" -m pip install -r "%BACKEND_DIR%requirements.txt"
if errorlevel 1 (
  echo ERRO: Falha ao instalar as dependencias do backend.
  exit /b 1
)

set "DB_PATH_URL=%BACKEND_DIR%precos.db"
set "DB_PATH_URL=%DB_PATH_URL:\=/%"
call :ensure_env_key "%BACKEND_ENV%" "DATABASE_URL" "DATABASE_URL=sqlite:///%DB_PATH_URL%"
if errorlevel 1 (
  echo ERRO: Falha ao preparar o arquivo "%BACKEND_ENV%".
  exit /b 1
)

call :ensure_env_key "%FRONTEND_ENV%" "VITE_API_URL" "VITE_API_URL=http://127.0.0.1:8000"
if errorlevel 1 (
  echo ERRO: Falha ao preparar o arquivo "%FRONTEND_ENV%".
  exit /b 1
)

call :ensure_env_key "%FRONTEND_ENV%" "VITE_BASE_PATH" "VITE_BASE_PATH=/"
if errorlevel 1 (
  echo ERRO: Falha ao preparar o arquivo "%FRONTEND_ENV%".
  exit /b 1
)

echo Instalando dependencias do frontend...
pushd "%FRONTEND_DIR%"
call npm install
if errorlevel 1 (
  popd
  echo ERRO: Falha ao executar npm install no frontend.
  exit /b 1
)
popd

echo.
echo SUCESSO: Projeto preparado para execucao local no Windows.
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://127.0.0.1:5173
exit /b 0

:find_python
set "PY_CMD="
where python >nul 2>nul
if not errorlevel 1 (
  python --version >nul 2>nul
  if not errorlevel 1 set "PY_CMD=python"
)

if not defined PY_CMD (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 --version >nul 2>nul
    if not errorlevel 1 set "PY_CMD=py -3"
  )
)
exit /b 0

:remove_directory
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target=(Resolve-Path -LiteralPath '%~1' -ErrorAction Stop).Path; $parent=(Resolve-Path -LiteralPath '%~2' -ErrorAction Stop).Path; if ($target -eq $parent) { exit 3 }; if (-not $target.StartsWith($parent, [System.StringComparison]::OrdinalIgnoreCase)) { exit 2 }; Remove-Item -LiteralPath $target -Recurse -Force"
exit /b %errorlevel%

:ensure_env_key
set "ENV_FILE=%~1"
set "ENV_KEY=%~2"
set "ENV_LINE=%~3"

if not exist "%ENV_FILE%" (
  >"%ENV_FILE%" echo(%ENV_LINE%
  exit /b 0
)

findstr /B /I /C:"%ENV_KEY%=" "%ENV_FILE%" >nul 2>nul
if errorlevel 1 (
  >>"%ENV_FILE%" echo(
  >>"%ENV_FILE%" echo(%ENV_LINE%
)
exit /b 0
