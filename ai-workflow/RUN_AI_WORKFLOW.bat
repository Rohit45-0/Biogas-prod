@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Creating the Python environment. This only happens on the first run...
  py -3.12 -m venv .venv 2>nul
  if errorlevel 1 python -m venv .venv
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
echo Python 3.12 is required. Download it from https://www.python.org/downloads/
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
