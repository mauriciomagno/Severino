# ============================================================
# executar.ps1 — Execucao do projeto Severino para testes
# Uso:
#   .\executar.ps1              -> modo dev (hot reload, padrao)
#   .\executar.ps1 -Modo dev    -> modo dev (hot reload)
#   .\executar.ps1 -Modo preview -> preview do build de producao
# ============================================================

param(
    [ValidateSet("dev", "preview")]
    [string]$Modo = "dev"
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   SEVERINO — Execucao para Testes" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Vai para o diretório do projeto
Set-Location $ProjectDir

# Verifica se node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias pela primeira vez..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao instalar dependencias." -ForegroundColor Red
        exit 1
    }
}

if ($Modo -eq "preview") {
    # Verifica se o build existe
    if (-not (Test-Path "dist\index.html")) {
        Write-Host "AVISO: Pasta 'dist' nao encontrada ou incompleta." -ForegroundColor Yellow
        Write-Host "Execute primeiro: .\publicar.ps1" -ForegroundColor Yellow
        Write-Host ""
        $resposta = Read-Host "Deseja executar o build agora? (S/N)"
        if ($resposta -match "^[Ss]$") {
            Write-Host "Gerando build..." -ForegroundColor Yellow
            npm run build
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERRO: Falha no build." -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "Operacao cancelada." -ForegroundColor Red
            exit 0
        }
    }

    Write-Host "Modo: PREVIEW (build de producao)" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Iniciando servidor de preview..." -ForegroundColor Yellow
    Write-Host "Acesse: http://localhost:4173" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pressione Ctrl+C para encerrar." -ForegroundColor DarkGray
    Write-Host ""
    npm run preview

} else {
    Write-Host "Modo: DEV (desenvolvimento com hot reload)" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Iniciando servidor de desenvolvimento..." -ForegroundColor Yellow
    Write-Host "Acesse: http://localhost:5173" -ForegroundColor Green
    Write-Host ""
    Write-Host "Hot reload ativo — alteracoes no codigo refletem automaticamente." -ForegroundColor DarkGray
    Write-Host "Pressione Ctrl+C para encerrar." -ForegroundColor DarkGray
    Write-Host ""
    npm run dev
}
