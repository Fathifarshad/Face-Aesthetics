# Builds the two signed NEVA APKs (android/README.md). Toolchain and signing key live outside the repo.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $repo
$tools = Join-Path $root 'android-tools'
$signing = Join-Path $root 'android-signing'

$env:JAVA_HOME = (Get-ChildItem (Join-Path $tools 'jdk') -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $tools 'sdk'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$gradle = (Get-ChildItem $tools -Directory -Filter 'gradle-*' | Select-Object -First 1).FullName + '\bin\gradle.bat'
$sdkmanager = Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin\sdkmanager.bat'

# Native tools write warnings to stderr; with 'Stop' PowerShell 5 would treat each line as fatal.
$ErrorActionPreference = 'Continue'
if (-not (Test-Path (Join-Path $env:ANDROID_HOME 'platforms\android-35\android.jar'))) {
  # Accept the SDK licence by file (the hash `sdkmanager --licenses` writes); piping "y" does not reach it here.
  $lic = Join-Path $env:ANDROID_HOME 'licenses'
  New-Item -ItemType Directory -Force $lic | Out-Null
  Set-Content (Join-Path $lic 'android-sdk-license') "`n24333f8a63b6825ea9c5514f83c2829b004d1fee" -NoNewline
  & $sdkmanager "--sdk_root=$env:ANDROID_HOME" 'platforms;android-35' 'build-tools;35.0.0' 2>&1 | Select-Object -Last 2
}

$env:NEVA_KEYSTORE = Join-Path $signing 'neva-release.p12'
$env:NEVA_KEYSTORE_PASSWORD = (Get-Content (Join-Path $signing 'keystore-password.txt') -Raw).Trim()
Set-Content (Join-Path $repo 'android\local.properties') ("sdk.dir=" + ($env:ANDROID_HOME -replace '\\', '/'))

Push-Location (Join-Path $repo 'android')
try {
  & $gradle --no-daemon --console=plain -q assembleRelease 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 30
  $code = $LASTEXITCODE
} finally { Pop-Location }
if ($code -ne 0) { Write-Output "gradle failed ($code)"; exit 1 }

$out = Join-Path $repo 'dist-apk'
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item (Join-Path $repo 'android\app\build\outputs\apk\doctor\release\app-doctor-release.apk') (Join-Path $out 'NEVA.apk') -Force
Copy-Item (Join-Path $repo 'android\app\build\outputs\apk\client\release\app-client-release.apk') (Join-Path $out 'NEVA-Client.apk') -Force
Get-ChildItem $out | Select-Object Name, Length
