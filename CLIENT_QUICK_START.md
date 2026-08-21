# Aquaivolt client quick start (Windows)

This guide runs the complete local demonstration: the saved machine-learning models, the LangGraph workflow, its audit evidence, and the Aquaivolt dashboard.

## Install once

Install these official tools, accepting the default options:

1. [Git for Windows](https://git-scm.com/download/win)
2. [Node.js 22 LTS or newer](https://nodejs.org/en/download)
3. [Python 3.12](https://www.python.org/downloads/) — select **Add Python to PATH** during installation

Restart the computer after installation if Windows does not immediately recognize a command.

## Run with two commands

Open **PowerShell**, then run:

```powershell
git clone https://github.com/Rohit45-0/Biogas-prod.git; cd Biogas-prod
./START_AQUAIVOLT.bat
```

On the first run:

1. `.env.local` opens in Notepad.
2. Paste the OpenAI key after `OPENAI_API_KEY=` if semantic Copilot is required. Do not add quotes or spaces.
3. Save the file and close Notepad.
4. Wait while the launcher installs packages, executes both saved models, verifies repeatability, and opens the dashboard.

Later, double-click `START_AQUAIVOLT.bat`; no command is needed.

## Login

- Administrator: `admin` / `admin123`
- User: `user` / `user123`

These are local demonstration accounts from `.env.local`. Change them there if the laptop is shared.

## What the launcher proves

Before opening the dashboard, it executes the actual Python workflow:

```text
Validate nine inputs
  -> engineer features
  -> load saved Gradient Boosting and Ridge models
  -> run both model predictions
  -> select the evaluated model
  -> calculate biogas, methane and electricity
  -> search 400 operating scenarios
  -> save an auditable JSON trace
```

The proof is written to `ai-workflow/run-evidence/latest_run.json`. The browser dashboard is then available at [http://localhost:3000](http://localhost:3000).

## Useful alternatives

- `START_DASHBOARD.bat`: run only the browser dashboard.
- `ai-workflow\RUN_AI_WORKFLOW.bat`: run only the saved-model/LangGraph proof.
- Close the server window, or press `Ctrl+C`, to stop the dashboard.

## Common problems

- **Node.js not found:** install Node.js 22 or newer, close PowerShell, and reopen it.
- **Python 3.12 not found:** reinstall Python 3.12 and select **Add Python to PATH**.
- **Port 3000 is already in use:** close the other Aquaivolt/Node terminal and start again.
- **Copilot uses fallback mode:** add a valid `OPENAI_API_KEY` to `.env.local`; the prediction model itself does not require that key.
- **API key safety:** never paste a key into chat, source code, or `.env.example`. Only `.env.local` should contain it.
