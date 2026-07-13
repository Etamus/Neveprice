@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend\"
set "FRONTEND_DIR=%ROOT%frontend\"
set "PREPARE_SCRIPT=%ROOT%preparar.bat"
set "VENV_PY=%BACKEND_DIR%.venv\Scripts\python.exe"
set "BACKEND_URL=http://127.0.0.1:8000"
set "FRONTEND_URL=http://127.0.0.1:5173"
set "LOCK_DIR=%ROOT%.iniciar.lock"
set "EXIT_CODE=0"

echo.
echo === NevePrice: iniciar local ===
echo Backend:  %BACKEND_URL%
echo Frontend: %FRONTEND_URL%
echo.

mkdir "%LOCK_DIR%" >nul 2>nul
if errorlevel 1 (
  echo Ja existe uma inicializacao em andamento.
  echo Se nenhuma janela estiver abrindo, apague a pasta "%LOCK_DIR%" e tente novamente.
  exit /b 1
)

if not exist "%PREPARE_SCRIPT%" (
  echo ERRO: preparar.bat nao foi encontrado em "%PREPARE_SCRIPT%".
  set "EXIT_CODE=1"
  goto :cleanup
)

set "NEED_PREPARE=0"
if not exist "%VENV_PY%" set "NEED_PREPARE=1"
if not exist "%FRONTEND_DIR%node_modules\" set "NEED_PREPARE=1"

if "%NEED_PREPARE%"=="1" (
  echo Dependencias ainda nao preparadas. Executando preparar.bat...
  call "%PREPARE_SCRIPT%"
  if errorlevel 1 (
    echo ERRO: preparar.bat falhou. Corrija a mensagem acima e tente novamente.
    set "EXIT_CODE=1"
    goto :cleanup
  )
)

if not exist "%VENV_PY%" (
  echo ERRO: Ambiente virtual do backend nao encontrado em "%BACKEND_DIR%.venv".
  set "EXIT_CODE=1"
  goto :cleanup
)

if not exist "%FRONTEND_DIR%node_modules\" (
  echo ERRO: node_modules do frontend nao encontrado em "%FRONTEND_DIR%node_modules".
  set "EXIT_CODE=1"
  goto :cleanup
)

call :url_ok "%BACKEND_URL%/"
if errorlevel 1 (
  echo Iniciando backend em nova janela...
  start "NevePrice Backend" /D "%BACKEND_DIR%" cmd /k ""%VENV_PY%" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"
) else (
  echo Backend ja esta disponivel. Nao vou iniciar outra instancia.
)

echo Aguardando backend ficar disponivel...
call :wait_url "%BACKEND_URL%/" 60
if errorlevel 1 (
  echo ERRO: Backend nao respondeu em ate 60 segundos.
  echo Verifique a janela do backend para ler a mensagem de erro.
  set "EXIT_CODE=1"
  goto :cleanup
)

call :url_ok "%FRONTEND_URL%/"
if errorlevel 1 (
  echo Iniciando frontend em nova janela...
  start "NevePrice Frontend" /D "%FRONTEND_DIR%" cmd /k "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
) else (
  echo Frontend ja esta disponivel. Nao vou iniciar outra instancia.
)

echo Aguardando frontend ficar disponivel...
call :wait_url "%FRONTEND_URL%/" 30
if errorlevel 1 (
  echo AVISO: Frontend ainda nao respondeu. A janela do frontend permanecera aberta para diagnostico.
) else (
  start "" "%FRONTEND_URL%/"
)

echo.
echo Enderecos locais:
echo Backend:  %BACKEND_URL%
echo Frontend: %FRONTEND_URL%

:cleanup
if exist "%LOCK_DIR%" rmdir "%LOCK_DIR%" >nul 2>nul
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%

:url_ok
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%~1' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch { }; exit 1" >nul 2>nul
exit /b %errorlevel%

:wait_url
set "WAIT_URL=%~1"
set "WAIT_LIMIT=%~2"
set "WAIT_COUNT=0"

:wait_loop
call :url_ok "%WAIT_URL%"
if not errorlevel 1 exit /b 0
set /a WAIT_COUNT+=1
if !WAIT_COUNT! GEQ %WAIT_LIMIT% exit /b 1
timeout /t 1 /nobreak >nul
goto :wait_loop
