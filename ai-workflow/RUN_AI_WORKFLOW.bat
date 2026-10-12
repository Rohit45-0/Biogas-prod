@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Creating the Python environment. This only happens on the first run...
  set "PYTHON_CMD="
  if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set PYTHON_CMD="%LocalAppData%\Programs\Python\Python312\python.exe"
  if not defined PYTHON_CMD where py >nul 2>nul && set "PYTHON_CMD=py -3.12"
  if not defined PYTHON_CMD where python >nul 2>nul && set "PYTHON_CMD=python"
  if not defined PYTHON_CMD goto :python_error

  call !PYTHON_CMD! -m venv .venv
  if errorlevel 1 goto :python_error
  call .venv\Scripts\python.exe -m pip install --upgrade pip
  call .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 goto :install_error
)

echo Running the real Aquaivolt LangGraph workflow...
call .venv\Scripts\python.exe src\aquaivolt_langgraph_backend.py --input sample_input.json --output-dir run-evidence
if errorlevel 1 goto :run_error
echo.
echo Reproducibility check...
call .venv\Scripts\python.exe tests\test_workflow.py
echo.
echo Completed. Open run-evidence\latest_run.json to inspect the proof.
pause
exit /b 0

:python_error
echo Python 3.12 could not be started.
echo Install it with: winget install --id Python.Python.3.12 --exact
echo Then close and reopen PowerShell and run this file again.
pause
exit /b 1

:install_error
echo Package installation failed. Check the internet connection and try again.
pause
exit /b 1

:run_error
echo Workflow execution failed. Review the message above.
pause
exit /b 1
