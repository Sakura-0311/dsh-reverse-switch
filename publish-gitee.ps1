# Publish dsh-reverse-switch through a Git host (no npm account needed).
#
# DSH's plugin-market index (format 1) accepts a git source: the index pins a
# 40-char commit and DSH installs it with `git+<url>#<commit>`. So a plain
# repository is enough - no npm registration, no Cloudflare, no registry.
#
# Usage:
#   .\publish-gitee.ps1 -Repo https://gitee.com/<you>/dsh-reverse-switch
#   .\publish-gitee.ps1 -Repo <url> -Branch master
#
# What it does:
#   1. commits the working tree (code)
#   2. regenerates market/index.json with that commit pinned
#   3. commits the index
#   4. pushes both to the remote
#   5. prints the index URL to paste into DSH -> Plugins -> Discover
#
# Keep this file ASCII-only: Windows PowerShell 5 reads .ps1 as GBK and mangles
# UTF-8 Chinese comments into syntax errors.

param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Branch = 'main',
  [string]$Message = 'dsh-reverse-switch release'
)

$ErrorActionPreference = 'Stop'
$root = 'E:\wb\dsh-reverse-mode'
Set-Location $root

if (-not (Test-Path (Join-Path $root '.git'))) { throw 'not a git repository' }
$Repo = $Repo.TrimEnd('/')
if ($Repo -notmatch '^https?://') { throw "Repo must be an http(s) URL, got: $Repo" }

$pkg = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("package: {0} {1}" -f $pkg.name, $pkg.version) -ForegroundColor Cyan

# 1. remote
$existing = & git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($existing)) {
  & git remote add origin $Repo
} else {
  & git remote set-url origin $Repo
}
Write-Output ("origin -> " + $Repo)

# 2. commit code
& git add -A
$dirty = & git status --porcelain
if (-not [string]::IsNullOrWhiteSpace(($dirty -join ''))) {
  & git -c core.quotepath=false commit -q -m $Message
  Write-Output 'committed working tree'
}

$codeSha = (& git rev-parse HEAD).Trim()
Write-Output ("code commit: " + $codeSha)

# 3. index pinned to that commit, then commit the index itself
node scripts\build-index.mjs --source git --repo $Repo --commit $codeSha
node scripts\validate-index.mjs --base ("$Repo/raw/$Branch/market/index.json")
if ($LASTEXITCODE -ne 0) { throw 'index validation failed' }

& git add market/index.json
$dirty2 = & git status --porcelain
if (-not [string]::IsNullOrWhiteSpace(($dirty2 -join ''))) {
  & git -c core.quotepath=false commit -q -m "index: pin $codeSha"
  Write-Output 'committed index'
}

# 4. push
& git push -u origin $Branch
if ($LASTEXITCODE -ne 0) { throw 'git push failed' }

# 5. hand back the URL
$indexUrl = "$Repo/raw/$Branch/market/index.json"
Write-Host ''
Write-Host 'published.' -ForegroundColor Green
Write-Host ("index URL : " + $indexUrl) -ForegroundColor Green
Write-Host ("commit     : " + $codeSha)
Write-Host 'DSH: Plugins -> Discover (发现) -> add that index URL.'
Write-Host 'Note: Gitee raw needs branch "master" on older repos; pass -Branch master if so.'
