# Verify PR #867 Phase B against the live database.
# Run from PowerShell:  .\dev\pr867\verify-phase-b.ps1
#
# Reads the anon key from .env.local, so no secret appears on the command line.
# Every check reports the HTTP status first: a request that never connected is
# reported as such, never as a pass.

$ErrorActionPreference = 'Continue'
$root = 'C:\Users\hasna\Yatraflow-T3'

$vars = @{}
Get-Content (Join-Path $root '.env.local') |
  Where-Object { $_ -match '^\s*[A-Z_]+\s*=' } |
  ForEach-Object {
    $k, $v = $_ -split '=', 2
    $vars[$k.Trim()] = $v.Trim().Trim('"').Trim("'")
  }

$url  = $vars['VITE_SUPABASE_URL']
$anon = $vars['VITE_SUPABASE_ANON_KEY']
if (-not $url -or -not $anon) { throw 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env.local' }

$tmp  = Join-Path $env:TEMP 'pr867'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$auth = @{ apikey = $anon; Authorization = "Bearer $anon" }

function Show-Status([string]$code) {
  if ($code -eq '000') { Write-Host '    NO CONNECTION (status 000) - this proves nothing, fix the network first' -ForegroundColor Magenta }
}

Write-Host "Project: $(([uri]$url).Host)" -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------- check 1
Write-Host '[1] get_public_profile_cards as anon  -> expect 200 with rows' -ForegroundColor Yellow
$b1 = Join-Path $tmp 'rpc.json'
$c1 = & curl.exe -s -o $b1 -w '%{http_code}' --max-time 20 `
  -X POST "$url/rest/v1/rpc/get_public_profile_cards" `
  -H "apikey: $anon" -H "Authorization: Bearer $anon" `
  -H 'Content-Type: application/json' --data-raw '{}'

if ($c1 -eq '200') {
  $raw = Get-Content $b1 -Raw
  try { $rows = @($raw | ConvertFrom-Json) } catch { $rows = @() }
  Write-Host "    status 200, $($rows.Count) profile card(s)" -ForegroundColor Green
  if ($rows.Count -eq 0) {
    Write-Host '    FAIL: 200 but empty - Explore will render no creators' -ForegroundColor Red
  } else {
    $s = $rows[0]
    Write-Host "    sample: name=$($s.name) creator_available=$($s.creator_available)"
    $leaked = @($rows[0].PSObject.Properties.Name) | Where-Object { $_ -match '^(email|home_city|is_disabled|travel_styles|created_at)$' }
    if ($leaked) { Write-Host "    LEAK: private field(s) in payload: $($leaked -join ', ')" -ForegroundColor Red }
    else { Write-Host '    payload carries only the reviewed public fields' -ForegroundColor Green }
  }
} else {
  Write-Host "    status $c1" -ForegroundColor Red
  Show-Status $c1
  if ($c1 -eq '404') { Write-Host "    PostgREST cache: run  notify pgrst, 'reload schema';  then retry" -ForegroundColor Yellow }
}
Write-Host ''

# ---------------------------------------------------------------- check 2
Write-Host '[2] direct profiles read as anon  -> expect [] / 401 / 403' -ForegroundColor Yellow
$b2 = Join-Path $tmp 'profiles.json'
$c2 = & curl.exe -s -o $b2 -w '%{http_code}' --max-time 20 `
  "$url/rest/v1/profiles?select=email&limit=1" `
  -H "apikey: $anon" -H "Authorization: Bearer $anon"
$out2 = if (Test-Path $b2) { Get-Content $b2 -Raw } else { '' }

Write-Host "    status $c2  body: $($out2.Trim())"
if ($c2 -eq '000') {
  Show-Status $c2
} elseif ($out2 -match '"email"') {
  Write-Host '    FAIL: anon can still read private columns' -ForegroundColor Red
} elseif ($c2 -in @('200', '401', '403')) {
  Write-Host '    closed - no private row reachable by anon' -ForegroundColor Green
} else {
  Write-Host "    unexpected status $c2 - inspect before trusting this" -ForegroundColor Yellow
}
Write-Host ''

# ---------------------------------------------------------------- check 3
Write-Host '[3] profile_cards visible to anon  -> expect a non-zero count' -ForegroundColor Yellow
$h3 = Join-Path $tmp 'hdr.txt'
$c3 = & curl.exe -s -o NUL -D $h3 -w '%{http_code}' --max-time 20 `
  "$url/rest/v1/profile_cards?select=id" `
  -H "apikey: $anon" -H "Authorization: Bearer $anon" `
  -H 'Prefer: count=exact' -H 'Range: 0-0'

Write-Host "    status $c3"
if ($c3 -eq '000') {
  Show-Status $c3
} elseif ($c3 -eq '206' -or $c3 -eq '200') {
  $cr = (Select-String -Path $h3 -Pattern 'content-range' | Select-Object -First 1).Line
  if ($cr) { Write-Host "    $($cr.Trim())" -ForegroundColor Green }
  else { Write-Host '    no content-range header returned' -ForegroundColor Yellow }
} else {
  Write-Host "    status $c3" -ForegroundColor Red
}
Write-Host ''
Write-Host 'SQL checks: Supabase Dashboard -> SQL Editor -> paste and Run.' -ForegroundColor Cyan
