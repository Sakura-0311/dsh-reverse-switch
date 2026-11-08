# Publish dsh-reverse-switch to npm, and with it the plugin-market index.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5 reads .ps1 as GBK and
# mangles UTF-8 Chinese comments into syntax errors.
#
# Usage:
#   .\publish.ps1              # check login, then publish
#   .\publish.ps1 -DryRun      # validate + preview the tarball, publish nothing
#   .\publish.ps1 -Otp 123456  # when npm 2FA is enabled
#
# One npm publish ships both things:
#   1) the package (lib/ plugin + market/ index + icons)
#   2) the market index -> https://cdn.jsdelivr.net/npm/dsh-reverse-switch/market/index.json
# jsDelivr serves files straight from npm, so the index needs no extra static host.

param(
  [switch]$DryRun,
  [string]$Otp = ""
)

$ErrorActionPreference = 'Stop'
$root = 'E:\wb\dsh-reverse-mode'
Set-Location $root

$pkg = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("package: {0}  version: {1}" -f $pkg.name, $pkg.version) -ForegroundColor Cyan

# 1. Build the index with a fresh timestamp, then validate it with DSH's own parser.
node scripts\build-index.mjs
node scripts\validate-index.mjs
if ($LASTEXITCODE -ne 0) { throw 'index validation failed' }

# 2. Preview what would be published (works without being logged in).
npm pack --dry-run --registry=https://registry.npmjs.org

if ($DryRun) {
  Write-Host 'DryRun: nothing published.' -ForegroundColor Yellow
  return
}

# 3. Login check against the real registry (npmmirror is a read-only mirror).
$registry = 'https://registry.npmjs.org'
$who = & npm whoami --registry=$registry 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($who)) {
  Write-Host 'npm is not logged in to the public registry. Run this once:' -ForegroundColor Yellow
  Write-Host ("  npm login --registry={0}" -f $registry) -ForegroundColor Yellow
  throw 'not logged in'
}
Write-Host ("logged in as: {0}" -f $who) -ForegroundColor Green

# 4. Publish.
$npmArgs = @('publish', "--registry=$registry", '--access', 'public')
if ($Otp -ne '') { $npmArgs += @("--otp=$Otp") }
& npm @npmArgs
if ($LASTEXITCODE -ne 0) { throw 'npm publish failed' }

Write-Host ''
Write-Host 'published.' -ForegroundColor Green
Write-Host ("package page: https://www.npmjs.com/package/{0}" -f $pkg.name) -ForegroundColor Green
Write-Host ("market index: https://cdn.jsdelivr.net/npm/{0}/market/index.json" -f $pkg.name) -ForegroundColor Green
Write-Host 'jsDelivr may take a few minutes on first fetch. Then in DSH: Plugins -> Discover -> add that index URL.'
