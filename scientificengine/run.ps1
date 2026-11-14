param([int]$Port = 8003, [switch]$NoMissionWarmup)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$pythonExe = $env:SCIENTIFIC_ENGINE_PYTHON
if (-not $pythonExe) {
    $pythonExe = Join-Path (Split-Path $PSScriptRoot -Parent) 'external/int4/.venv/Scripts/python.exe'
}
if (-not (Test-Path -LiteralPath $pythonExe)) { throw 'Set SCIENTIFIC_ENGINE_PYTHON to the scientific Python environment.' }
$env:PYTHONUTF8 = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
$env:MKL_NUM_THREADS = '1'
$arguments = @('server.py', '--port', $Port)
if ($NoMissionWarmup) { $arguments += '--no-mission-warmup' }
& $pythonExe @arguments
exit $LASTEXITCODE
