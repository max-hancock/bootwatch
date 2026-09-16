<#
Clones the PRODUCTION schema into a DEV Supabase project, plus the subset of rows
that make dev worth testing against.

Copies:
  complexes                    verbatim. Campus reference data - names, real
                               coordinates, visitor limits, risk levels. No
                               personal data and no foreign key into auth.
  banned_display_name_patterns verbatim. Moderation config, needed to test
                               display-name validation.
  sightings                    with user_id and photo_url nulled. Real
                               coordinates, timestamps, report types and
                               per-complex distribution, so anything built on
                               aggregates has true patterns to render instead of
                               invented ones that always look plausible.

Never copies: profiles, push_tokens, active_timers, or anything in auth. Those
are 200 students' accounts.

push_tokens is the one to never relax. Dev's notify-sighting reads that table,
so a copy of it means every test report fires a real notification at a real
student's phone - the exact failure a separate dev database exists to prevent.

All four also have foreign keys into auth.users, so restoring them would mean
copying real email addresses and password hashes into a second project too.

Connection strings are read from environment variables so they never land in
git or in a chat transcript. Get each from the project's "Connect" button in the
dashboard top bar -> Session pooler.

Use the SESSION pooler on port 5432, not the transaction pooler on 6543:
pg_dump needs session-level features the transaction pooler does not support.
The direct db.<ref>.supabase.co host is IPv6-only on newer projects and will
fail on most home networks.

  $env:PROD_DB_URL = 'postgresql://postgres.jrorzmwsqxynwbmuqsoq:<pw>@aws-1-us-west-1.pooler.supabase.com:5432/postgres'
  $env:DEV_DB_URL  = 'postgresql://postgres.orvlxrdzerorpiiudwhh:<pw>@aws-0-us-west-1.pooler.supabase.com:5432/postgres'

Note the differing pooler hosts (aws-1 for prod, aws-0 for dev). Supabase assigns
these per project; the wrong one fails with "(ENOTFOUND) tenant/user ... not found".
Easier to just use scripts\setup-dev-db.ps1, which knows both.

By default dev's public schema is emptied first so the dump applies to a clean
slate and a re-run is a true mirror of production. That discards anything seeded
into dev. Use -KeepDevData to skip it, at the cost of the clone no longer picking
up changes to objects dev already has.

Usage:
  .\scripts\clone-schema-to-dev.ps1              # dump prod, reset dev, apply, copy data, verify
  .\scripts\clone-schema-to-dev.ps1 -DumpOnly    # write the baseline file, touch nothing
  .\scripts\clone-schema-to-dev.ps1 -VerifyOnly  # compare prod vs dev structure
  .\scripts\clone-schema-to-dev.ps1 -KeepDevData # keep dev's rows; see caveat above
  .\scripts\clone-schema-to-dev.ps1 -DataOnly    # refresh the copied rows, leave schema alone
  .\scripts\clone-schema-to-dev.ps1 -SkipData    # schema only, copy no rows

ASCII only on purpose: PowerShell 5.1 reads .ps1 as ANSI, so non-ASCII
punctuation here breaks parsing.
#>
[CmdletBinding()]
param(
  [string]$ProdDbUrl = $env:PROD_DB_URL,
  [string]$DevDbUrl = $env:DEV_DB_URL,
  [switch]$DumpOnly,
  [switch]$VerifyOnly,
  [switch]$KeepDevData,
  [switch]$DataOnly,
  [switch]$SkipData
)

$ErrorActionPreference = 'Stop'

# Repo SQL comments contain non-ASCII (box drawing); without this psql may reject
# them as invalid byte sequences depending on the console locale.
$env:PGCLIENTENCODING = 'UTF8'

# Writing to this ref is what we are protecting against, not something we do.
$ProdRef = 'jrorzmwsqxynwbmuqsoq'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MigrationsDir = Join-Path $RepoRoot 'supabase\migrations'

# psql always reports these when replaying a production dump into another
# Supabase project, and neither affects the app's schema:
#   - "public" exists from the moment any project is created;
#   - only supabase_admin may alter its own default privileges, and those govern
#     objects that role creates in future, of which this app has none. The
#     equivalent statements FOR ROLE postgres do apply, as do all real grants.
$BenignErrorPatterns = @(
  'schema "public" already exists',
  'permission denied to change default privileges'
)

# Without the reset below, every object dev already has fails to apply. Those
# errors are expected in that mode, but see the warning printed at the time:
# tolerating them is exactly what lets dev drift from production.
if ($KeepDevData) {
  $BenignErrorPatterns += @(
    'already exists',
    'multiple primary keys for table'
  )
}

# Literal here-string (@'...'@), not an expandable one: PowerShell would eat the
# $$ that delimits the plpgsql body.
#
# This SQL deliberately lives in the script rather than in supabase/ so there is
# no standalone "wipe the database" file sitting in the repo for someone to open
# in the wrong SQL editor at 1am. The only caller is below, after $DevDbUrl has
# been checked against the production ref.
$ResetPublicSchemaSql = @'
-- Empties the public schema so a pg_dump baseline can be replayed onto it.
-- Structure only lives here, and the dev project holds no real user data.
do $$
declare r record;
begin
  -- Tables first; cascade takes their indexes, constraints, triggers, policies
  -- and owned sequences with them.
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;

  for r in select viewname from pg_views where schemaname = 'public' loop
    execute format('drop view if exists public.%I cascade', r.viewname);
  end loop;

  for r in select matviewname from pg_matviews where schemaname = 'public' loop
    execute format('drop materialized view if exists public.%I cascade', r.matviewname);
  end loop;

  -- regprocedure renders the full argument list, which is what makes this work
  -- for overloaded routines.
  for r in
    select p.oid::regprocedure as sig, p.prokind
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    if r.prokind = 'p' then
      execute format('drop procedure if exists %s cascade', r.sig);
    else
      execute format('drop function if exists %s cascade', r.sig);
    end if;
  end loop;

  -- Enums and domains. The app has none today; dropping them anyway keeps the
  -- reset honest if one is added later.
  for r in
    select t.typname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype in ('e', 'd')
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;

  -- Standalone sequences, i.e. any not already owned by a dropped table.
  for r in select sequencename from pg_sequences where schemaname = 'public' loop
    execute format('drop sequence if exists public.%I cascade', r.sequencename);
  end loop;
end $$;
'@

# Every row must be a bare integer - Get-Structure only parses digits.
#
# The storage rows exist because the earlier version of this query counted only
# pg_policies in the 'public' schema. Storage policies live in the 'storage'
# schema, so a clone could ship the wrong Storage authorization rules and the
# comparison would still report policies as matching.
#
# 'storage buckets' is scoped to the two buckets the app actually uses, so
# production's unused 'sighting-photo' (singular) bucket no longer reads as a
# difference.
#
# 'storage policies unscoped' is the one to watch: non-SELECT policies on our
# buckets that do not check storage.foldername, i.e. that let any signed-in user
# write over another user's files. Expect 0. Anything higher on either side means
# supabase/storage_setup.sql has not been applied there.
$StructureQuery = @"
select 'tables' as kind, count(*)::text as n from pg_tables where schemaname = 'public'
union all select 'views', count(*)::text from pg_views where schemaname = 'public'
union all select 'policies', count(*)::text from pg_policies where schemaname = 'public'
union all select 'functions', count(*)::text from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all select 'triggers', count(*)::text from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
union all select 'signup trigger', count(*)::text from pg_trigger
  where tgname = 'on_auth_user_created' and not tgisinternal
union all select 'storage buckets', count(*)::text from storage.buckets
  where id in ('sighting-photos', 'avatars')
union all select 'avatars size cap', coalesce(max(file_size_limit), 0)::text
  from storage.buckets where id = 'avatars'
union all select 'avatars mime types', coalesce(max(array_length(allowed_mime_types, 1)), 0)::text
  from storage.buckets where id = 'avatars'
union all select 'storage policies', count(*)::text from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%sighting-photos%'
      or coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%avatars%')
union all select 'storage policies unscoped', count(*)::text from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and cmd <> 'SELECT'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%sighting-photos%'
      or coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%avatars%')
    and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%foldername%'
union all select 'realtime tables', count(*)::text from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
order by kind;
"@

# The only tables copied out of production, and exactly what is taken from each.
#
# Every Select here is read against production, so treat this list as the answer
# to "what personal data has left the production project". Adding a table means
# widening that answer - profiles, push_tokens and active_timers are absent on
# purpose, see the note at the top of this file.
#
# Order matters. complexes is first because the truncate below cascades from it
# to sightings and active_timers.
$DataCopySteps = @(
  @{
    Label   = 'complexes'
    Table   = 'public.complexes'
    Columns = 'id, name, address, latitude, longitude, visitor_time_limit_minutes, booting_company, signage_quality, risk_level, notes, created_at'
    Select  = 'select id, name, address, latitude, longitude, visitor_time_limit_minutes, booting_company, signage_quality, risk_level, notes, created_at from public.complexes'
    Reset   = $null
  },
  @{
    Label   = 'banned_display_name_patterns'
    Table   = 'public.banned_display_name_patterns'
    Columns = 'id, pattern, kind, reason, created_at'
    Select  = 'select id, pattern, kind, reason, created_at from public.banned_display_name_patterns'
    # id is a plain serial and the ids are copied verbatim, so the sequence is
    # left at 1 and the next insert in dev would collide with an existing row.
    Reset   = "select setval(pg_get_serial_sequence('public.banned_display_name_patterns', 'id'), coalesce((select max(id) from public.banned_display_name_patterns), 1));"
  },
  @{
    Label   = 'sightings (anonymized)'
    Table   = 'public.sightings'
    Columns = 'id, user_id, complex_id, latitude, longitude, photo_url, created_at, report_type, is_anonymous'
    # user_id nulled: the column is nullable (ON DELETE SET NULL) and dev's
    # auth.users does not contain these people, so a verbatim copy would be
    # rejected by the foreign key even if it were wanted.
    #
    # photo_url nulled: the URLs point at production's storage bucket. Keeping
    # them would have the dev app rendering real users' photos and attempting
    # deletes against paths that do not exist in dev's bucket.
    Select  = 'select id, null::uuid, complex_id, latitude, longitude, null::text, created_at, report_type, is_anonymous from public.sightings'
    Reset   = $null
  }
)

# Moves rows prod -> dev via CSV on disk. The transformation lives in each
# Select, so nothing that is not wanted in dev is ever read out of production in
# the first place.
#
# psql's \copy is a client-side meta-command, which is what lets one invocation
# read from prod and the next write to dev without the server needing file
# access. It is passed via -f rather than -c because the commands embed quoted
# Windows paths that are painful to get through PowerShell's native-argument
# handling intact.
function Copy-ProdData([string]$ProdUrl, [string]$DevUrl) {
  if ($DevUrl -match $ProdRef) {
    throw "Copy-ProdData target points at PRODUCTION ($ProdRef). Aborting before any write."
  }

  $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ('bootwatch-clone-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

  try {
    # One statement so the cascade is resolved once. This also clears
    # active_timers and notify_sighting_dispatch, which reference these tables
    # and hold only dev test rows.
    $targets = ($DataCopySteps | ForEach-Object { $_.Table }) -join ', '
    $wipe = Invoke-Psql $DevUrl @('--no-psqlrc', '-v', 'ON_ERROR_STOP=1') "truncate table $targets cascade;"
    if ($wipe.ExitCode -ne 0) {
      throw "could not clear dev tables before copy: $($wipe.Output -join ' ')"
    }

    foreach ($step in $DataCopySteps) {
      $csv = (Join-Path $tmpDir ("{0}.csv" -f ($step.Label -replace '[^A-Za-z0-9_]', '_'))) -replace '\\', '/'
      $sqlFile = Join-Path $tmpDir 'step.sql'

      Set-Content -LiteralPath $sqlFile -Encoding ASCII `
        -Value "\copy ($($step.Select)) to '$csv' with (format csv)"
      $r = Invoke-Psql $ProdUrl @('--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-f', $sqlFile)
      if ($r.ExitCode -ne 0) {
        throw "export of $($step.Label) from production failed: $($r.Output -join ' ')"
      }

      Set-Content -LiteralPath $sqlFile -Encoding ASCII `
        -Value "\copy $($step.Table) ($($step.Columns)) from '$csv' with (format csv)"
      $r = Invoke-Psql $DevUrl @('--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-f', $sqlFile)
      if ($r.ExitCode -ne 0) {
        throw "import of $($step.Label) into dev failed: $($r.Output -join ' ')"
      }

      if ($step.Reset) {
        $r = Invoke-Psql $DevUrl @('--no-psqlrc', '-v', 'ON_ERROR_STOP=1') $step.Reset
        if ($r.ExitCode -ne 0) {
          throw "sequence reset for $($step.Label) failed: $($r.Output -join ' ')"
        }
      }

      $c = Invoke-Psql $DevUrl @('--no-psqlrc', '-t', '-A') "select count(*) from $($step.Table);"
      $n = ($c.Output | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1)
      Write-Host ("  {0,-30} {1} row(s)" -f $step.Label, $n) -ForegroundColor Green
    }
  }
  finally {
    # The CSVs hold production rows; do not leave them in %TEMP%.
    Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
  }
}

function Assert-Tool([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name not found on PATH. Installed via 'scoop install postgresql'; open a new shell, or prepend %USERPROFILE%\scoop\apps\postgresql\current\bin to PATH."
  }
}

# Under $ErrorActionPreference='Stop', anything a native command writes to stderr
# becomes a terminating error. psql writes NOTICE output there, so every psql call
# has to relax the preference and be judged on its exit code instead.
function Invoke-Psql([string]$Url, [string[]]$PsqlArgs, [string]$StdIn) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($StdIn) { $out = $StdIn | psql $Url @PsqlArgs 2>&1 }
    else { $out = psql $Url @PsqlArgs 2>&1 }
    return @{ Output = @($out | ForEach-Object { "$_" }); ExitCode = $LASTEXITCODE }
  }
  finally { $ErrorActionPreference = $prev }
}

function Get-Structure([string]$Url) {
  $r = Invoke-Psql $Url @('--no-psqlrc', '-t', '-A', '-F', '=') $StructureQuery
  $out = $r.Output
  if ($r.ExitCode -ne 0) { throw "structure query failed: $($out -join ' ')" }
  $map = @{}
  foreach ($line in $out) {
    if ($line -match '^(.+)=(\d+)$') { $map[$Matches[1]] = $Matches[2] }
  }
  if ($map.Count -eq 0) { throw "structure query returned nothing: $out" }
  return $map
}

# Supabase stores database-webhook auth headers inside the trigger definition, so
# pg_dump reproduces the service_role JWT and webhook secret in plaintext. Two
# problems: this repo is public, and restoring such a trigger into dev would make
# dev sightings call PRODUCTION's edge function and alert real users.
function Remove-EmbeddedSecrets([string]$Path) {
  $lines = Get-Content -LiteralPath $Path
  $out = New-Object System.Collections.Generic.List[string]
  $stripped = 0

  foreach ($line in $lines) {
    if ($line -match 'supabase_functions\.http_request') {
      $stripped++
      $out.Add('-- [redacted by clone-schema-to-dev.ps1] A database-webhook trigger was')
      $out.Add('-- removed here. pg_dump embeds its Authorization header (a service_role')
      $out.Add('-- JWT) and secret headers in plaintext, and it targets production.')
      $out.Add('-- Recreate webhooks per project from the dashboard:')
      $out.Add('--   Database -> Webhooks. See supabase/setup_sighting_webhook.md.')
      continue
    }
    $out.Add($line)
  }

  # UTF-8 without BOM: psql mishandles a leading byte-order mark.
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($Path, $out, $utf8NoBom)

  # Belt and braces: if any JWT survived, refuse to continue rather than risk
  # committing it or shipping production credentials into another project.
  $leftover = Select-String -Path $Path -Pattern 'eyJ[A-Za-z0-9_-]{20,}'
  if ($leftover) {
    throw "Credentials still present in $Path at line(s) $(($leftover | ForEach-Object { $_.LineNumber }) -join ', '). Remove them before continuing."
  }

  return $stripped
}

function Show-Comparison($Prod, $Dev) {
  Write-Host ("  {0,-26} {1,-10} {2}" -f 'object', 'prod', 'dev') -ForegroundColor Cyan
  foreach ($k in ($Prod.Keys | Sort-Object)) {
    $flag = if ($Prod[$k] -eq $Dev[$k]) { '' } else { '   <-- differs' }
    Write-Host ("  {0,-26} {1,-10} {2}{3}" -f $k, $Prod[$k], $Dev[$k], $flag)
  }
}

Assert-Tool 'pg_dump'
Assert-Tool 'psql'

if (-not $ProdDbUrl) { throw 'PROD_DB_URL is not set.' }
if ($ProdDbUrl -notmatch $ProdRef) {
  throw "PROD_DB_URL does not point at the known production ref ($ProdRef). Refusing to guess which database is production."
}

if (-not $DumpOnly) {
  if (-not $DevDbUrl) { throw 'DEV_DB_URL is not set.' }
  # The whole point of this script is that this can never be production.
  if ($DevDbUrl -match $ProdRef) {
    throw "DEV_DB_URL points at the PRODUCTION project ($ProdRef). Aborting before any write."
  }
}

if ($DataOnly -and $SkipData) {
  throw '-DataOnly and -SkipData contradict each other.'
}

if ($VerifyOnly) {
  Show-Comparison (Get-Structure $ProdDbUrl) (Get-Structure $DevDbUrl)
  return
}

# Refreshing rows without touching the schema. Safe to run often - it is how dev
# picks up complexes added in production since the last full clone.
if ($DataOnly) {
  Write-Host 'Copying reference data and anonymized sightings from production...' -ForegroundColor Cyan
  Copy-ProdData $ProdDbUrl $DevDbUrl
  Write-Host 'Done. Schema was not touched.' -ForegroundColor Green
  return
}

New-Item -ItemType Directory -Force -Path $MigrationsDir | Out-Null

# Fixed name, not a timestamp: this file is a snapshot of production's current
# schema, so a re-run should replace it rather than pile up near-identical copies.
# The all-zero prefix keeps it sortable first if the Supabase CLI migration
# workflow is adopted later.
#
# Gitignored: this repo is public and the dump reproduces every function body and
# RLS expression in production. Treat it as a local working file and regenerate it
# with -DumpOnly when needed.
$baseline = Join-Path $MigrationsDir '00000000000000_baseline_public.sql'

Write-Host 'Dumping production public schema (read-only, structure only)...' -ForegroundColor Cyan
pg_dump $ProdDbUrl `
  --schema=public `
  --schema-only `
  --no-owner `
  --no-publications `
  --no-subscriptions `
  --file=$baseline
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }

$lines = (Get-Content $baseline | Measure-Object -Line).Lines
Write-Host "  wrote $baseline ($lines lines)" -ForegroundColor Green

$stripped = Remove-EmbeddedSecrets $baseline
if ($stripped -gt 0) {
  Write-Host "  redacted $stripped webhook trigger(s) carrying production credentials" -ForegroundColor Yellow
}
else {
  Write-Host '  no embedded credentials found' -ForegroundColor Green
}

if ($DumpOnly) {
  Write-Host 'DumpOnly set - nothing was written to any database.' -ForegroundColor Yellow
  return
}

# pg_dump emits plain CREATE statements, so replaying the baseline onto a dev
# database that already has the schema fails every object with "already exists"
# and dev quietly keeps its OLD definitions. A column added in production would
# then never reach dev while the structure counts still matched - drift that
# looks like agreement. Dropping first is what makes a re-run a real mirror.
if (-not $KeepDevData) {
  Write-Host 'Emptying dev public schema so the dump applies to a clean slate...' -ForegroundColor Cyan
  $reset = Invoke-Psql $DevDbUrl @('--no-psqlrc', '-v', 'ON_ERROR_STOP=1') $ResetPublicSchemaSql
  if ($reset.ExitCode -ne 0) {
    throw "could not empty dev public schema: $($reset.Output -join ' ')"
  }
  Write-Host '  done (dev seed data, if any, is gone and needs reseeding)' -ForegroundColor Green
}
else {
  Write-Host 'KeepDevData set - dev keeps its rows, and objects it already has will NOT be' -ForegroundColor Yellow
  Write-Host 'updated from production. The "already exists" errors below are that happening.' -ForegroundColor Yellow
}

# Dependency order: public schema first, then objects outside it (the auth.users
# trigger needs public.handle_new_user to exist), then storage.
$steps = @(
  @{ Name = 'public schema baseline'; File = $baseline },
  @{ Name = 'non-public objects'; File = Join-Path $RepoRoot 'supabase\bootstrap_non_public_objects.sql' },
  @{ Name = 'storage buckets + policies'; File = Join-Path $RepoRoot 'supabase\storage_setup.sql' }
)

$errorCount = 0
foreach ($step in $steps) {
  if (-not (Test-Path $step.File)) { throw "missing $($step.File)" }
  Write-Host "Applying $($step.Name) to dev..." -ForegroundColor Cyan
  $r = Invoke-Psql $DevDbUrl @('--no-psqlrc', '-v', 'ON_ERROR_STOP=0', '-f', $step.File)
  $out = $r.Output
  # ON_ERROR_STOP=0 means SQL errors still exit 0; a non-zero code is a
  # connection-level failure, so there is no point attempting later steps.
  if ($r.ExitCode -ne 0) {
    throw "could not connect to dev while applying $($step.Name): $($out -join ' ')"
  }
  $errors = @($out | Where-Object { $_ -match 'ERROR' })
  $unexpected = @($errors | Where-Object {
      $line = $_
      -not ($BenignErrorPatterns | Where-Object { $line -match $_ })
    })
  $benign = $errors.Count - $unexpected.Count

  if ($unexpected.Count -gt 0) {
    $errorCount += $unexpected.Count
    Write-Host "  $($unexpected.Count) unexpected error(s):" -ForegroundColor Red
    $unexpected | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  }
  if ($benign -gt 0) {
    Write-Host "  $benign expected error(s) ignored (schema/default-privilege noise)" -ForegroundColor DarkGray
  }
  if ($unexpected.Count -eq 0 -and $benign -eq 0) {
    Write-Host '  clean' -ForegroundColor Green
  }
  elseif ($unexpected.Count -eq 0) {
    Write-Host '  clean (no unexpected errors)' -ForegroundColor Green
  }
}

if ($SkipData) {
  Write-Host 'SkipData set - dev has the schema but no rows.' -ForegroundColor Yellow
}
else {
  Write-Host ''
  Write-Host 'Copying reference data and anonymized sightings from production...' -ForegroundColor Cyan
  Copy-ProdData $ProdDbUrl $DevDbUrl
}

Write-Host ''
Write-Host 'Structure comparison:' -ForegroundColor Cyan
Show-Comparison (Get-Structure $ProdDbUrl) (Get-Structure $DevDbUrl)

Write-Host ''
if ($errorCount -eq 0) {
  Write-Host 'Done with no SQL errors.' -ForegroundColor Green
}
else {
  Write-Host "Done with $errorCount SQL error(s) above - review before trusting the clone." -ForegroundColor Yellow
}
Write-Host 'Still manual: deploy edge functions to dev, set their secrets, create dev''s webhook.' -ForegroundColor Cyan
Write-Host 'No accounts were copied - sign up in the dev app to get a user to test as.' -ForegroundColor Cyan
