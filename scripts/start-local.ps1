# Run from any directory: powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 20.19 or newer, then run this script again.'
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Install Docker Desktop, then run this script again.'
    }

    & docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        $dockerDesktopPath = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
        if (-not (Test-Path -LiteralPath $dockerDesktopPath)) {
            throw 'Open Docker Desktop and wait for its engine to start, then run this script again.'
        }
        Start-Process -FilePath $dockerDesktopPath -WindowStyle Hidden
        $dockerReady = $false
        for ($attempt = 0; $attempt -lt 12; $attempt++) {
            Start-Sleep -Seconds 5
            & docker info --format '{{.ServerVersion}}' 2>$null
            if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
        }
        if (-not $dockerReady) { throw 'Docker is still starting. Wait for the engine, then retry.' }
    }

    if (-not (Test-Path -LiteralPath 'node_modules\.bin\vite.cmd')) {
        # Tests download their own MongoDB binary on demand; the app uses Docker MongoDB.
        $previousMongoPostinstall = $env:MONGOMS_DISABLE_POSTINSTALL
        $env:MONGOMS_DISABLE_POSTINSTALL = '1'
        & npm.cmd ci --registry=https://registry.npmjs.org --cache .data/npm-cache --prefer-offline --no-audit --no-fund
        $env:MONGOMS_DISABLE_POSTINSTALL = $previousMongoPostinstall
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    & npm.cmd run setup
    if ($LASTEXITCODE -ne 0) { throw 'Local environment setup failed.' }
    $localApiPort = 4000
    $portSetting = Select-String -LiteralPath 'backend/.env' -Pattern '^PORT=(\d+)\s*$'
    if ($portSetting) { $localApiPort = [int]$portSetting.Matches[0].Groups[1].Value }
    $env:API_PROXY_TARGET = "http://localhost:$localApiPort"
    & docker compose up -d mongo
    if ($LASTEXITCODE -ne 0) { throw 'MongoDB container startup failed.' }

    $mongoReady = $false
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        & docker compose exec -T mongo mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>$null
        if ($LASTEXITCODE -eq 0) { $mongoReady = $true; break }
        Start-Sleep -Seconds 5
    }
    if (-not $mongoReady) { throw 'MongoDB is not ready. Check docker compose logs mongo.' }
    Get-Content -Raw -LiteralPath 'scripts/init-mongo.js' | & docker compose exec -T mongo mongosh --quiet
    if ($LASTEXITCODE -ne 0) { throw 'MongoDB replica set initialization failed.' }
    # The ordinary seed is additive; do not use --fresh (it deletes existing demo data).
    & npm.cmd run seed
    if ($LASTEXITCODE -ne 0) { throw 'Demo data seeding failed.' }
    Write-Host 'Safe Zone: http://localhost:5173 — stop the dev servers with Ctrl+C.'
    & npm.cmd run dev
    if ($LASTEXITCODE -ne 0) { throw 'The development servers stopped with an error.' }
}
finally { Pop-Location }
