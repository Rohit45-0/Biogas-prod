[CmdletBinding()]
param(
    [switch]$DashboardOnly,
    [switch]$AiOnly,
    [switch]$VerifyOnly,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$AiRoot = Join-Path $ProjectRoot "ai-workflow"

function Write-Step {
    param([string]$Number, [string]$Message)
    Write-Host ""
    Write-Host "[$Number] $Message" -ForegroundColor Cyan
}

function Get-EnvMap {
    param([string]$Path)
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
            continue
        }
        $parts = $trimmed.Split("=", 2)
        $values[$parts[0].Trim()] = $parts[1].Trim()
    }
    return $values
}

function Ensure-LocalEnvironment {
    $examplePath = Join-Path $ProjectRoot ".env.example"
    $localPath = Join-Path $ProjectRoot ".env.local"

    if (-not (Test-Path -LiteralPath $localPath)) {
        Copy-Item -LiteralPath $examplePath -Destination $localPath
        Write-Host "A local settings file was created: .env.local" -ForegroundColor Yellow
        Write-Host "Notepad will open now. Add OPENAI_API_KEY if semantic Copilot is required, save, and close Notepad."
        Start-Process -FilePath "notepad.exe" -ArgumentList ('"{0}"' -f $localPath) -Wait
    }

    $envMap = Get-EnvMap -Path $localPath
    $required = @("AQUA_SESSION_SECRET", "AQUA_ADMIN_PASSWORD", "AQUA_USER_PASSWORD")
    $missing = @($required | Where-Object { -not $envMap.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($envMap[$_]) })
    if ($missing.Count -gt 0) {
        throw ".env.local is missing required values: $($missing -join ', '). Copy them from .env.example and try again."
    }

    if (-not $envMap.ContainsKey("OPENAI_API_KEY") -or [string]::IsNullOrWhiteSpace($envMap["OPENAI_API_KEY"])) {
        Write-Host "OPENAI_API_KEY is empty. The dashboard will work; Copilot will use the built-in evidence fallback." -ForegroundColor Yellow
    }
    else {
        Write-Host "OpenAI key detected. Semantic Copilot is enabled." -ForegroundColor Green
    }
}

function Get-NodeCommand {
    $node = Get-Command "node" -ErrorAction SilentlyContinue
    $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) {
        throw "Node.js 22.13 or newer is required. Install the LTS release from https://nodejs.org/en/download and run this file again."
    }

    $version = (& $node.Source -p "process.versions.node").Trim()
    $parts = $version.Split(".")
    $major = [int]$parts[0]
    $minor = if ($parts.Count -gt 1) { [int]$parts[1] } else { 0 }
    if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 13)) {
        throw "Node.js $version was found, but this project requires 22.13 or newer. Update it from https://nodejs.org/en/download."
    }

    Write-Host "Node.js $version detected." -ForegroundColor Green
    return $npm.Source
}

function Get-PythonLauncher {
    $py = Get-Command "py.exe" -ErrorAction SilentlyContinue
    if ($py) {
        & $py.Source -3.12 -c "import sys; assert sys.version_info[:2] == (3, 12)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Python 3.12 detected." -ForegroundColor Green
            return @{ File = $py.Source; Prefix = @("-3.12") }
        }
    }

    $python = Get-Command "python.exe" -ErrorAction SilentlyContinue
    if ($python) {
        & $python.Source -c "import sys; assert sys.version_info[:2] == (3, 12)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Python 3.12 detected." -ForegroundColor Green
            return @{ File = $python.Source; Prefix = @() }
        }
    }

    throw "Python 3.12 is required for the saved-model workflow. Install it from https://www.python.org/downloads/ and enable 'Add Python to PATH'."
}

function Ensure-NodeDependencies {
    param([string]$NpmCommand)
    $lockPath = Join-Path $ProjectRoot "package-lock.json"
    $modulesPath = Join-Path $ProjectRoot "node_modules"
    $markerPath = Join-Path $modulesPath ".aquaivolt-package-lock.sha256"
    $lockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $lockPath).Hash
    $installedHash = if (Test-Path -LiteralPath $markerPath) { (Get-Content -LiteralPath $markerPath -Raw).Trim() } else { "" }

    if (-not (Test-Path -LiteralPath $modulesPath) -or $installedHash -ne $lockHash) {
        Write-Host "Installing dashboard packages. This can take a few minutes on the first run..." -ForegroundColor Yellow
        Push-Location $ProjectRoot
        try {
            & $NpmCommand ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
            Set-Content -LiteralPath $markerPath -Value $lockHash -NoNewline
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Host "Dashboard packages are ready." -ForegroundColor Green
    }
}

function Ensure-PythonDependencies {
    param([hashtable]$Launcher)
    $venvPath = Join-Path $AiRoot ".venv"
    $venvPython = Join-Path $venvPath "Scripts\python.exe"
    $requirementsPath = Join-Path $AiRoot "requirements.txt"
    $markerPath = Join-Path $venvPath ".aquaivolt-requirements.sha256"
    $requirementsHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $requirementsPath).Hash
    $installedHash = if (Test-Path -LiteralPath $markerPath) { (Get-Content -LiteralPath $markerPath -Raw).Trim() } else { "" }

    if (-not (Test-Path -LiteralPath $venvPython)) {
        Write-Host "Creating the isolated Python environment..." -ForegroundColor Yellow
        $arguments = @($Launcher.Prefix) + @("-m", "venv", $venvPath)
        & $Launcher.File @arguments 2>&1 | ForEach-Object { Write-Host $_ }
        $createExitCode = $LASTEXITCODE
        if ($createExitCode -ne 0) { throw "Python environment creation failed." }
    }

    if ($installedHash -ne $requirementsHash) {
        Write-Host "Installing AI workflow packages. This can take a few minutes on the first run..." -ForegroundColor Yellow
        & $venvPython -m pip install --disable-pip-version-check --upgrade pip 2>&1 | ForEach-Object { Write-Host $_ }
        $pipUpgradeExitCode = $LASTEXITCODE
        if ($pipUpgradeExitCode -ne 0) { throw "pip upgrade failed." }
        & $venvPython -m pip install --disable-pip-version-check -r $requirementsPath 2>&1 | ForEach-Object { Write-Host $_ }
        $pipInstallExitCode = $LASTEXITCODE
        if ($pipInstallExitCode -ne 0) { throw "AI package installation failed." }
        Set-Content -LiteralPath $markerPath -Value $requirementsHash -NoNewline
    }
    else {
        Write-Host "AI workflow packages are ready." -ForegroundColor Green
    }

    return $venvPython
}

function Invoke-AiWorkflow {
    param([string]$PythonCommand)
    Write-Step -Number "3/4" -Message "Running the saved ML models through the LangGraph workflow"
    Push-Location $AiRoot
    try {
        & $PythonCommand "src\aquaivolt_langgraph_backend.py" --input "sample_input.json" --output-dir "run-evidence"
        if ($LASTEXITCODE -ne 0) { throw "The AI workflow failed with exit code $LASTEXITCODE." }
        Write-Host "Running the deterministic reproducibility test..."
        & $PythonCommand "tests\test_workflow.py"
        if ($LASTEXITCODE -ne 0) { throw "The AI reproducibility test failed with exit code $LASTEXITCODE." }
    }
    finally {
        Pop-Location
    }
    Write-Host "AI evidence is ready at ai-workflow\run-evidence\latest_run.json" -ForegroundColor Green
}

function Start-Dashboard {
    param([string]$NpmCommand)
    Write-Step -Number "4/4" -Message "Starting the Aquaivolt dashboard"
    Write-Host "Local address: http://localhost:3000" -ForegroundColor Green
    Write-Host "Administrator login: admin / use the password in .env.local"
    Write-Host "Keep this window open. Press Ctrl+C to stop the dashboard."

    $browserJob = $null
    if (-not $NoBrowser) {
        $browserJob = Start-Job -ScriptBlock {
            $url = "http://localhost:3000"
            for ($attempt = 0; $attempt -lt 90; $attempt++) {
                try {
                    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
                    Start-Process $url
                    return
                }
                catch {
                    Start-Sleep -Seconds 1
                }
            }
        }
    }

    Push-Location $ProjectRoot
    try {
        & $NpmCommand run dev
        if ($LASTEXITCODE -ne 0) { throw "The dashboard stopped with exit code $LASTEXITCODE." }
    }
    finally {
        Pop-Location
        if ($browserJob) {
            Stop-Job -Job $browserJob -ErrorAction SilentlyContinue
            Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
    if ($DashboardOnly -and $AiOnly) {
        throw "DashboardOnly and AiOnly cannot be used together."
    }

    if (-not $AiOnly) {
        Write-Step -Number "1/4" -Message "Checking local settings and dashboard requirements"
        Ensure-LocalEnvironment
        $npmCommand = Get-NodeCommand
        Ensure-NodeDependencies -NpmCommand $npmCommand
    }

    if (-not $DashboardOnly) {
        Write-Step -Number "2/4" -Message "Checking the reproducible AI environment"
        $pythonLauncher = Get-PythonLauncher
        $venvPython = Ensure-PythonDependencies -Launcher $pythonLauncher
        Invoke-AiWorkflow -PythonCommand $venvPython
    }

    if ($AiOnly) {
        Write-Host ""
        Write-Host "AI workflow demonstration completed successfully." -ForegroundColor Green
        exit 0
    }

    if ($VerifyOnly) {
        Write-Step -Number "4/4" -Message "Building the dashboard for verification"
        Push-Location $ProjectRoot
        try {
            & $npmCommand run build
            if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed with exit code $LASTEXITCODE." }
        }
        finally {
            Pop-Location
        }
        Write-Host "Client setup verification passed." -ForegroundColor Green
        exit 0
    }

    Start-Dashboard -NpmCommand $npmCommand
}
catch {
    Write-Host ""
    Write-Host "SETUP ERROR" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
