<#
Copies the production database structure into the bootwatch-dev project, along
with the campus reference tables and an anonymized copy of sightings, so you
have a safe place to test against realistic data.

No accounts are copied. See the header of clone-schema-to-dev.ps1 for exactly
which tables are taken and which are deliberately never taken.

Run it and type the two database passwords when prompted. Nothing is stored:
the passwords live in memory for this one run only.

  .\scripts\setup-dev-db.ps1 -DumpOnly    # safe rehearsal, writes no database
  .\scripts\setup-dev-db.ps1              # do it for real
  .\scripts\setup-dev-db.ps1 -VerifyOnly  # just compare prod vs dev
  .\scripts\setup-dev-db.ps1 -DataOnly    # refresh the copied rows, leave schema alone
  .\scripts\setup-dev-db.ps1 -SkipData    # structure only, copy no rows

Database passwords are NOT your Supabase login. Supabase will not show you an
existing one - if you don't have it, reset it under
Project -> Settings -> Database -> Reset database password.
Resetting is safe for the live app: it talks to Supabase over HTTPS with the
anon key and never uses this password.

ASCII only on purpose: PowerShell 5.1 reads .ps1 as ANSI.
#>
[CmdletBinding()]
param(
  [switch]$DumpOnly,
  [switch]$VerifyOnly,
  [switch]$DataOnly,
  [switch]$SkipData
)

$ErrorActionPreference = 'Stop'

$ProdRef = 'jrorzmwsqxynwbmuqsoq'
$DevRef = 'orvlxrdzerorpiiudwhh'

# Both projects are in us-west-1, but Supabase runs several pooler clusters per
# region and assigns per project. Using the wrong one fails with
# "(ENOTFOUND) tenant/user <ref> not found". Confirmed by probing each cluster.
$ProdPoolerHost = 'aws-1-us-west-1.pooler.supabase.com'
$DevPoolerHost = 'aws-0-us-west-1.pooler.supabase.com'

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

# Passwords routinely contain @ : / # ? which would otherwise be parsed as URI
# syntax and produce a confusing "could not translate host name" error.
function New-PoolerUrl([string]$Ref, [string]$Password, [string]$PoolerHost) {
  $encoded = [uri]::EscapeDataString($Password)
  return "postgresql://postgres.${Ref}:${encoded}@${PoolerHost}:5432/postgres"
}

# scoop puts pg_dump on the PATH of *new* shells only, so add it for this one.
$pgBin = Join-Path $env:USERPROFILE 'scoop\apps\postgresql\current\bin'
if ((Test-Path $pgBin) -and ($env:PATH -notlike "*$pgBin*")) {
  $env:PATH = "$pgBin;$env:PATH"
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump not found. Install with: scoop install postgresql"
}

Write-Host ''
Write-Host 'Copying production into bootwatch-dev. No accounts or push tokens are copied.' -ForegroundColor Cyan
Write-Host "  production : $ProdRef  (read from, never written to)" -ForegroundColor Gray
Write-Host "  dev        : $DevRef  (receives the schema and the copied rows)" -ForegroundColor Gray
Write-Host ''
Write-Host 'Find each password under Project -> Settings -> Database.' -ForegroundColor Gray
Write-Host 'Typing is hidden.' -ForegroundColor Gray
Write-Host ''

$prodPw = Read-Secret 'Production (bootwatch) database password'
if (-not $prodPw) { throw 'No production password entered.' }

$devPw = $null
if (-not $DumpOnly) {
  $devPw = Read-Secret 'Dev (bootwatch-dev) database password'
  if (-not $devPw) { throw 'No dev password entered.' }
}

$env:PROD_DB_URL = New-PoolerUrl $ProdRef $prodPw $ProdPoolerHost
if ($devPw) { $env:DEV_DB_URL = New-PoolerUrl $DevRef $devPw $DevPoolerHost }

try {
  $clone = Join-Path $PSScriptRoot 'clone-schema-to-dev.ps1'
  & $clone -DumpOnly:$DumpOnly -VerifyOnly:$VerifyOnly -DataOnly:$DataOnly -SkipData:$SkipData
}
finally {
  # Do not leave credentials in the shell for later commands to inherit.
  Remove-Item Env:\PROD_DB_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\DEV_DB_URL -ErrorAction SilentlyContinue
}
