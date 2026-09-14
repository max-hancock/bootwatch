<#
Works out why bootwatch-dev refuses the database password.

Asks for the dev password once, then tries the same credentials several ways so
we can tell a genuinely wrong password apart from a problem in how the script
passes it. Read-only: runs "select 1" and nothing else.

  .\scripts\diagnose-dev-connection.ps1

Prints a summary of the password's SHAPE (length, whether it has stray
whitespace, which character classes it uses) but never the password itself.
That is usually enough to spot a truncated or mis-pasted copy.

ASCII only on purpose: PowerShell 5.1 reads .ps1 as ANSI.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$env:PGCONNECT_TIMEOUT = '10'
$env:PGCLIENTENCODING = 'UTF8'

$DevRef = 'orvlxrdzerorpiiudwhh'
$PoolerHost = 'aws-0-us-west-1.pooler.supabase.com'

$pgBin = Join-Path $env:USERPROFILE 'scoop\apps\postgresql\current\bin'
if ((Test-Path $pgBin) -and ($env:PATH -notlike "*$pgBin*")) {
  $env:PATH = "$pgBin;$env:PATH"
}

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Test-Connection2([string]$Label, [scriptblock]$Run) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = (& $Run) 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $prev }

  $joined = $out -join ' '
  $verdict =
  if ($code -eq 0 -and $joined -match '1') { 'SUCCESS' }
  elseif ($joined -match 'password authentication failed') { 'FAILED - password rejected' }
  elseif ($joined -match 'ENOTFOUND|tenant.*not found') { 'FAILED - wrong pooler cluster' }
  elseif ($joined -match 'timeout|timed out') { 'FAILED - timed out' }
  else { "FAILED - $joined" }

  $ok = ($verdict -eq 'SUCCESS')
  $color = if ($ok) { 'Green' } else { 'Yellow' }
  Write-Host ("  {0,-46} {1}" -f $Label, $verdict) -ForegroundColor $color
  return $ok
}

$pw = Read-Secret "bootwatch-dev database password"
if (-not $pw) { throw 'No password entered.' }

Write-Host ''
Write-Host 'Password shape (never the value):' -ForegroundColor Cyan
Write-Host "  length                 : $($pw.Length)"
Write-Host "  leading/trailing space : $(($pw -ne $pw.Trim()))"
Write-Host "  all ASCII printable    : $($pw -notmatch '[^\x20-\x7E]')"
Write-Host "  has lowercase          : $($pw -match '[a-z]')"
Write-Host "  has uppercase          : $($pw -match '[A-Z]')"
Write-Host "  has digit              : $($pw -match '[0-9]')"
$symbols = ($pw.ToCharArray() | Where-Object { $_ -notmatch '[A-Za-z0-9]' })
Write-Host "  symbol count           : $(@($symbols).Count)"
Write-Host "  URI-significant symbols: $($pw -match '[@:/?#\[\]%&]')"

$user = "postgres.$DevRef"
$encoded = [uri]::EscapeDataString($pw)
$uri = "postgresql://${user}:${encoded}@${PoolerHost}:5432/postgres"
$q = 'select 1;'

Write-Host ''
Write-Host "Trying $PoolerHost as $user" -ForegroundColor Cyan

$results = @{}

# A: what the clone script does today - password embedded in a percent-encoded URI.
$results.UriSession = Test-Connection2 'session 5432, password inside URI' {
  $q | psql $uri --no-psqlrc -t -A
}

# B: same server, but password handed over via PGPASSWORD so no URI encoding is
# involved. If this works and A does not, the encoding is the bug.
$results.EnvSession = Test-Connection2 'session 5432, password via PGPASSWORD' {
  $env:PGPASSWORD = $pw
  try { $q | psql --host=$PoolerHost --port=5432 --username=$user --dbname=postgres --no-psqlrc -t -A }
  finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
}

# C: transaction mode. Unusable for pg_dump, but if only this works the
# credentials are right and the session port is the problem.
$results.EnvTxn = Test-Connection2 'transaction 6543, password via PGPASSWORD' {
  $env:PGPASSWORD = $pw
  try { $q | psql --host=$PoolerHost --port=6543 --username=$user --dbname=postgres --no-psqlrc -t -A }
  finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
}

Write-Host ''
if ($results.Values -contains $true) {
  Write-Host 'At least one method worked - the password is correct.' -ForegroundColor Green
  Write-Host 'Tell the assistant which line said SUCCESS and the script will be adjusted to use it.' -ForegroundColor Cyan
}
else {
  Write-Host 'Every method was rejected, so the password itself is not being accepted.' -ForegroundColor Yellow
  Write-Host 'Reset it again at Supabase -> bootwatch-dev -> Settings -> Database ->' -ForegroundColor Cyan
  Write-Host 'Reset database password, then wait about a minute before retrying: the' -ForegroundColor Cyan
  Write-Host 'connection pooler can keep serving the old credentials briefly.' -ForegroundColor Cyan
}
