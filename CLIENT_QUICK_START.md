# AQUAIVOLT — run the dashboard on a Windows laptop

This is the easiest way to run the complete dashboard on your own laptop. It starts the same local Next.js application that is deployed online. The local prediction engine is included in the project.

## What you need to install once

Install only these official tools:

1. **Node.js 22 LTS** — [official download](https://nodejs.org/en/download). Use the default installation options.
2. **Git for Windows** — [official download](https://git-scm.com/download/win), only if you want to clone the repository with a command. You can skip Git by downloading the ZIP instead.

You do **not** need Python, Vercel, VS Code, Excel, a database, or a ChatGPT/OpenAI subscription to run the dashboard demonstration.

## Easiest method: download the ZIP

1. Open [github.com/Rohit45-0/Biogas-prod](https://github.com/Rohit45-0/Biogas-prod).
2. Select the green **Code** button, then **Download ZIP**.
3. Right-click the downloaded ZIP file and choose **Extract All**.
4. Open the extracted `Biogas-prod` folder.
5. Double-click **START_AQUAIVOLT.bat**.
6. On the first run, Notepad opens a local settings file. Keep the supplied values, save it, and close Notepad.
7. Wait for the first-time installation. Your browser opens automatically at `http://localhost:3000`.

## If Git is already installed

Open **PowerShell**, copy these two lines, and press Enter after each one:

```powershell
git clone https://github.com/Rohit45-0/Biogas-prod.git
cd Biogas-prod
```

Then double-click `START_AQUAIVOLT.bat` in that folder.

## Local sign-in details

| Account | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `admin123` |
| User | `user` | `user123` |

These are local demonstration accounts. They can be changed in `.env.local` later.

## Optional OpenAI Copilot key

The dashboard, AI model calculation, 2,000-scenario generation, reports, and local login all work without an OpenAI key. If you want optional OpenAI-enhanced Copilot answers, open `.env.local` and paste a billed API key after `OPENAI_API_KEY=`. Do not paste that key into GitHub, a message, or a public document.

## If something goes wrong

- **Node.js not found:** install Node.js 22 LTS, close all Command Prompt/PowerShell windows, open a new one, and double-click `START_AQUAIVOLT.bat` again.
- **Package installation stopped, timed out, or `next` is not recognized:** close all AQUAIVOLT command windows. Open PowerShell in the `Biogas-prod` folder and run the following repair command, then double-click `START_AQUAIVOLT.bat` again:

  ```powershell
  Remove-Item -LiteralPath .\node_modules -Recurse -Force
  npm.cmd install --no-audit --no-fund --fetch-retries=5
  ```

  `npm.cmd` avoids a restrictive Windows PowerShell script policy; no administrator permission or policy change is needed. The initial package installation requires a stable internet connection. Do not delete any other folder.
- **The browser does not open:** go to `http://localhost:3000` manually after the server window says the app is ready.
- **Port 3000 is in use:** close the other AQUAIVOLT/Node command window, then run `START_AQUAIVOLT.bat` again.
- **To stop the dashboard:** close the server command window or press `Ctrl+C` inside it.
