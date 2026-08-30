# ============================================================
# publicar.ps1 — Build de produção do projeto Severino
# Uso: .\publicar.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   SEVERINO — Build de Producao" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Vai para o diretório do projeto
Set-Location $ProjectDir

# Verifica se node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "[1/3] Instalando dependencias..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao instalar dependencias." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[1/3] Dependencias ja instaladas. Pulando npm install." -ForegroundColor Green
}

# Typecheck
Write-Host ""
Write-Host "[2/3] Verificando tipos TypeScript..." -ForegroundColor Yellow
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Erros de TypeScript encontrados. Corrija antes de publicar." -ForegroundColor Red
    exit 1
}
Write-Host "TypeScript OK." -ForegroundColor Green

# Build de produção
Write-Host ""
Write-Host "[3/3] Gerando build de producao..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Falha no build." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "   BUILD CONCLUIDO COM SUCESSO!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Arquivos gerados em: $ProjectDir\dist" -ForegroundColor White
Write-Host ""

# Lista o conteúdo da pasta dist
Write-Host "Conteudo da pasta dist:" -ForegroundColor Cyan
Get-ChildItem -Path "$ProjectDir\dist" -Recurse | Format-Table Name, Length, LastWriteTime

Write-Host ""
Write-Host "Para visualizar o build de producao, execute: .\executar.ps1 -Modo preview" -ForegroundColor DarkCyan
Write-Host ""
