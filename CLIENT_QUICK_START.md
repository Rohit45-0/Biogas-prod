# AQUAIVOLT: local installation and user guide

Updated 12 October 2026. These steps cover the current dashboard, Overview scenario engine, trained Gradient Boosting and Ridge models, and Admin Audit Trail.

## 1. Download the current code

- Repository: <https://github.com/Rohit45-0/Biogas-prod>
- Download: <https://github.com/Rohit45-0/Biogas-prod/archive/refs/heads/main.zip>
- Audit reference: [docs/AUDIT_TRAIL.md](docs/AUDIT_TRAIL.md)

On GitHub, choose **Code > Download ZIP**, then right-click the downloaded file and choose **Extract All**. Open the extracted folder that contains `package.json`, `CLIENT_QUICK_START.md`, `app` and `ai-workflow`. Do not run the application from inside the ZIP.

The current version includes `app/components/MLPredictions.tsx` and `ai-workflow/models/onnx/manifest.json`. If either is missing, you have an older download.

Alternatively, install [Git for Windows](https://git-scm.com/download/win), open PowerShell in your chosen working directory and run:

```powershell
git clone https://github.com/Rohit45-0/Biogas-prod.git
cd Biogas-prod
```

## 2. Install the prerequisites

The instructions below target a Windows 10/11 x64 computer.

1. Install **Node.js 24 LTS** from <https://nodejs.org/en/download>. Use the Windows installer and keep the npm and PATH options enabled. The project requires Node.js 22.13 or newer.
2. Close and reopen PowerShell after installation.
3. Open PowerShell inside the application folder. In File Explorer, open that folder, type `powershell` in its address bar and press Enter.
4. Check Node and install the package manager:

```powershell
node --version
npm.cmd --version
npm.cmd install --global pnpm@11.25.0
pnpm.cmd --version
```

The last command should report `11.25.0`. The `.cmd` suffix avoids PowerShell blocking npm or pnpm PowerShell wrappers. No execution-policy change is needed.

You do not need Python, a GPU, Vercel, Supabase, Excel, VS Code or an OpenAI API key for the local dashboard and trained ML predictions. Python is only needed for the optional separate workflow in step 11. Internet access is needed to download the source and install packages.

## 3. Create private local settings

Only on a fresh installation, create the settings file:

```powershell
Copy-Item .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
notepad.exe .env.local
```

The Node command prints a new random secret. In Notepad:

1. Replace `replace-with-a-long-random-secret` with that entire generated value.
2. Replace the Admin and User password placeholders with passwords of your choice. Prefer separate strong passwords.
3. Keep the usernames `admin` and `user` unless you deliberately want different local usernames.
4. Keep `AQUA_AUDIT_DIR=test-results/local-store`.
5. Keep `OPENAI_API_KEY=` empty for the initial setup.

The required settings have this structure. Every `replace-with-...` value must be replaced:

```dotenv
AQUA_SESSION_SECRET=replace-with-a-long-random-secret
AQUA_ADMIN_USERNAME=admin
AQUA_ADMIN_PASSWORD=replace-with-a-strong-admin-password
AQUA_USER_USERNAME=user
AQUA_USER_PASSWORD=replace-with-a-strong-user-password
AQUA_AUDIT_DIR=test-results/local-store
OPENAI_API_KEY=
```

Save and close Notepad. Ensure the filename is `.env.local`, not `.env.local.txt`. Do not overwrite an existing configured `.env.local` during an update.

**Local login is separate from online login.** Production passwords are not included in GitHub and are not downloaded automatically. Sign in with the passwords you entered in this local file.

Do not add production `VERCEL`, `VERCEL_TOKEN`, `BLOB_READ_WRITE_TOKEN`, database keys or cloud session secrets to this local installation. With no Vercel/Blob configuration, the application stores audit records on this computer.

Keep `.env.local` private. It is excluded from Git. Preserve its session secret alongside a secure backup of your local audit directory: changing the secret invalidates existing local sessions and prevents verification of records authenticated with the previous secret.

## 4. Install the locked application dependencies

In the same application folder, run:

```powershell
pnpm.cmd install --frozen-lockfile
```

Wait for completion. The first installation can take several minutes. Keep `pnpm-lock.yaml`, `.npmrc` and `pnpm-workspace.yaml` unchanged. The configuration includes the CPU runtime needed by the trained ML models. Use pnpm for this checkout; do not mix npm dependency installation into the same folder or delete the lockfile to bypass an error.

## 5. Start the dashboard

```powershell
pnpm.cmd dev --webpack --hostname 127.0.0.1 --port 3000
```

Wait for the terminal to report that the server is ready, then open:

<http://localhost:3000>

Keep the server terminal open while using the dashboard. The first page or API request may take longer while development code compiles. The `127.0.0.1` binding keeps this demonstration on the local computer.

After completing steps 1-4, you can instead double-click `START_DASHBOARD.bat`. `START_AQUAIVOLT.bat` is a compatibility shortcut to the same launcher. The launcher checks configuration, installs locked packages and starts the server. Open the URL above when it says Ready.

## 6. Sign in and run Overview optimization

1. Sign in with username `admin` and your local Admin password.
2. Confirm the baseline production values appear before running optimization.
3. Select **Run AI optimization**.
4. Wait for the eight-stage workflow to finish, then select **View results**.
5. Inspect the baseline/selected-candidate comparison and proposed setpoints.
6. Select **Export 2,000 scenarios** to download the evaluated candidate CSV.
7. Open Biogas, Methane and Electricity to inspect their production views.

The 2,000 rows describe evaluated optimization candidates, not training data. The Overview uses the reference-based scenario engine. The separate trained model route is in Audit Trail.

Signing in as `user` provides the production views but does not give access to Admin audit operations.

## 7. Test the trained ML and Audit Trail

While signed in as Admin:

1. Open **Audit Trail > ML predictions**.
2. Wait for **LOADED** and an available storage status. Local storage should identify itself as local development files, not Vercel Blob.
3. Select an operating profile or enter all nine requested values. HRT inputs are in days.
4. Select **Run ML prediction**. Inspect the separate Gradient Boosting and Ridge results, execution trace and run ID. The run should report **RECORDED**.
5. Select **Verify ML run**. This executes 11 verification checks against the stored ML run.
6. Select **Test null rejection**. PASS means the server rejected a null pH with HTTP 422, not that it predicted from null values.
7. Open **1. Scenario execution**. Select a profile and retain the reproducibility seed, then select **Run test 1**.
8. Continue to **2. Scenario verification**, then select **Run test 2**. This executes nine scenario checks.
9. Open **Scenario comparison** to compare two operating profiles with the same seed.
10. Open **Audit records** and retrieve a saved run by its ID. Download the available JSON/CSV evidence. Sign out and sign in again, then retrieve the same ID to check persistence.

These checks establish software execution, reproducibility and record integrity. They do not establish plant prediction accuracy or real production improvement.

## 8. Understand local storage and optional services

- Audit records are written under `test-results/local-store/audit-v2/records` relative to the application folder. Keep this directory when updating the source.
- Local records are separate from production records. A production run ID will not appear locally unless its storage is deliberately integrated. Do not connect production storage just to follow this guide.
- The visible records list may not be a complete chronological index. Retain the run IDs shown after each calculation and use direct ID retrieval when needed.
- JSON evidence uses hashes and a server-held HMAC. It is a server-authenticated export, not a public-key signature that an external auditor can independently verify.
- Without an OpenAI key, Copilot uses its built-in keyword explanation fallback. Overview optimization and trained ML predictions do not require that service.
- Analyzer/IoT readings and equipment control are not connected by this setup. The application remains an advisory prototype using supplied reference data or explicitly submitted values.

## 9. Stop, restart and update

To stop: press **Ctrl+C** in the server terminal. If Windows asks to terminate the batch job, answer `Y`.

To restart: open the application folder and double-click `START_DASHBOARD.bat`, or repeat the startup command from step 5.

For a Git installation, stop the server, then run:

```powershell
git pull --ff-only
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev --webpack --hostname 127.0.0.1 --port 3000
```

If Git reports local modifications, review them before updating. Do not discard them with a hard reset. Preserve `.env.local` and the local audit directory. A ZIP download has no Git history: download a new ZIP into a separate folder and deliberately transfer your private local configuration and audit backup.

For a compiled local build, stop the development server and use:

```powershell
pnpm.cmd build
pnpm.cmd start --hostname 127.0.0.1 --port 3000
```

## 10. Troubleshooting and software tests

| Symptom | Action |
| --- | --- |
| `node` or `npm.cmd` not found | Install Node.js 24 LTS with the default PATH/npm options, then open a new terminal. |
| `pnpm.cmd` not found | Run `npm.cmd install --global pnpm@11.25.0`, then reopen the terminal. |
| Cannot find `package.json` | Open the extracted application root, not its parent folder or the `ai-workflow` folder. |
| Login is not configured / placeholders remain | Check `.env.local`, replace the session-secret and password placeholders, and restart the server. |
| Incorrect username or password | Use the local values from `.env.local`, not automatically the online password. Restart after changing them. |
| Port 3000 is occupied | Use `pnpm.cmd dev --webpack --hostname 127.0.0.1 --port 3001`, then open `http://localhost:3001`. Do not stop unrelated software. |
| Audit storage unavailable | Confirm `AQUA_AUDIT_DIR=test-results/local-store`, folder write access, and that `VERCEL` and `BLOB_READ_WRITE_TOKEN` are unset in the file and shell. |
| ML artifact missing | Confirm both `.onnx` files and `manifest.json` exist under `ai-workflow/models/onnx`. Obtain a complete current download if absent. |
| Native ONNX/DLL loading error | Confirm x64 Node matches your Windows architecture, reinstall the locked dependencies and check the terminal error. On Windows, a missing Microsoft Visual C++ runtime may need installation from Microsoft's official site. |
| Installation fails | Check connectivity and use the pinned pnpm version. Do not bypass integrity or dependency errors by deleting the lockfile. Send the error text to the developer without sharing `.env.local`. |
| Browser cannot connect | Keep the terminal running, wait for Ready and use the exact port it reports. |

Optional complete software check, with the local server stopped:

```powershell
pnpm.cmd test
```

This builds the dashboard and runs its automated software tests. The tests create isolated temporary local credentials and audit directories; they do not need production credentials. Trained-model tests compare the exported models with saved Python parity fixtures.

## 11. Optional Python workflow

This is separate from the dashboard and is not required for its ML predictions.

Install Python 3.12 from <https://www.python.org/downloads/>, then double-click `ai-workflow/RUN_AI_WORKFLOW.bat`. Alternatively, from the application root:

```powershell
cd ai-workflow
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe src\aquaivolt_langgraph_backend.py --input sample_input.json --output-dir run-evidence
.\.venv\Scripts\python.exe tests\test_workflow.py
```

The workflow writes `ai-workflow/run-evidence/latest_run.json`. It is a separate technical demonstration; it does not replace the Overview endpoint or start the web dashboard.

## Official installation references

- Node.js: <https://nodejs.org/en/download>
- pnpm: <https://pnpm.io/installation>
- ONNX Runtime Node.js: <https://onnxruntime.ai/docs/get-started/with-javascript/node.html>
