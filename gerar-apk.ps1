# =============================================================================
#  gerar-apk.ps1  —  Morte e Vida Severina (Android)
#  Uso:  .\gerar-apk.ps1              -> APK debug (padrão)
#        .\gerar-apk.ps1 -Modo release -> APK release (não assinado)
#        .\gerar-apk.ps1 -PularBuild   -> pula npm build + cap sync
# =============================================================================
param(
	[ValidateSet("debug","release")]
	[string]$Modo = "debug",

	[switch]$PularBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------- Cores de saída -------------------------------------------------
function Cabecalho  { param($m) Write-Host "`n===  $m  ===" -ForegroundColor Cyan }
function Ok         { param($m) Write-Host "  [OK] $m"    -ForegroundColor Green }
function Aviso      { param($m) Write-Host "  [!!] $m"    -ForegroundColor Yellow }
function Erro       { param($m) Write-Host "  [XX] $m"    -ForegroundColor Red }

# ---------- Caminhos -------------------------------------------------------
$Raiz    = $PSScriptRoot
$Android = Join-Path $Raiz "android"
$Gradlew = Join-Path $Android "gradlew.bat"

# ---------- Validações iniciais --------------------------------------------
Cabecalho "Verificando pré-requisitos"

if (-not (Test-Path $Gradlew)) {
	Erro "gradlew.bat não encontrado em: $Android"
	Erro "Execute primeiro:  npx cap add android"
	exit 1
}

# Verifica Node / npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
	Erro "npm não encontrado. Instale o Node.js e tente novamente."
	exit 1
}
Ok "npm encontrado"

# Verifica JAVA_HOME (necessário para o Gradle)
$javaExe = $null
if ($env:JAVA_HOME) {
	$javaExe = Join-Path $env:JAVA_HOME "bin\java.exe"
	if (-not (Test-Path $javaExe)) { $javaExe = $null }
}
if (-not $javaExe) {
	$javaExe = (Get-Command java -ErrorAction SilentlyContinue)?.Source
}
if (-not $javaExe) {
	Erro "Java não encontrado. Instale o JDK 17+ (Android Studio inclui um)."
	Erro "Dica: defina JAVA_HOME apontando para o JDK, ex:"
	Erro "  `$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'"
	exit 1
}
Ok "Java encontrado: $javaExe"

# ---------- 1. Build web ---------------------------------------------------
if (-not $PularBuild) {
	Cabecalho "1/3  Build web (npm run build)"
	Set-Location $Raiz
	npm run build
	if ($LASTEXITCODE -ne 0) { Erro "npm run build falhou."; exit 1 }
	Ok "Build web concluído"

	Cabecalho "2/3  Sincronizar com Android (npx cap sync)"
	npx cap sync android
	if ($LASTEXITCODE -ne 0) { Erro "cap sync falhou."; exit 1 }
	Ok "Sync concluído"
} else {
	Aviso "Etapas de build web e sync puladas (-PularBuild)."
}

# ---------- 2. Gradle APK --------------------------------------------------
$Tarefa = if ($Modo -eq "release") { "assembleRelease" } else { "assembleDebug" }
Cabecalho "3/3  Gerando APK $Modo  (Gradle: $Tarefa)"

Set-Location $Android

# Garante que o gradlew tenha permissão de execução (necessário em alguns
# ambientes Windows onde o script Unix foi copiado sem bit de execução)
& cmd /c "gradlew.bat $Tarefa --no-daemon --console=plain"
if ($LASTEXITCODE -ne 0) { Erro "Gradle falhou com código $LASTEXITCODE."; exit 1 }

# ---------- 3. Localizar APK -----------------------------------------------
$PastaApk  = Join-Path $Android "app\build\outputs\apk\$Modo"
$ArquivoApk = Get-ChildItem -Path $PastaApk -Filter "*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $ArquivoApk) {
	Aviso "APK não encontrado em: $PastaApk"
	Aviso "Verifique o log do Gradle acima."
	exit 1
}

# Copia APK para a raiz do projeto com nome legível
$Destino = Join-Path $Raiz "SeverinoMobile-$Modo.apk"
Copy-Item $ArquivoApk.FullName $Destino -Force

# ---------- Resultado final ------------------------------------------------
Cabecalho "APK gerado com sucesso"
Ok "Origem : $($ArquivoApk.FullName)"
Ok "Cópia  : $Destino"
Write-Host ""

if ($Modo -eq "release") {
	Aviso "APK release NÃO está assinado."
	Aviso "Para instalar em dispositivos fora da Play Store, assine com:"
	Aviso "  keytool + jarsigner  ou  Android Studio > Build > Generate Signed APK"
} else {
	Write-Host "  Para instalar via USB (modo desenvolvedor ativado):" -ForegroundColor Cyan
	Write-Host "  adb install `"$Destino`"" -ForegroundColor White
}

Set-Location $Raiz
