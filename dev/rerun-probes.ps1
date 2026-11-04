# Bounded raw-log rerun: regression, save contract, AI, Pace
#
# The reviewer's gap: the repair report carried outcomes but not the raw stdout,
# stderr, command and exit code behind them. A summary is a claim; a log is
# evidence. This runs each probe once, in series, and writes for each:
#
#   <name>.log      stdout+stderr, unedited
#   <name>.exit     the numeric exit code
#   <name>.cmd      the exact argv and the resolved settings
#
# No probe here touches a hosted service: the save contract aborts any request to
# supabase.co that its own routes do not claim, and asserts the count is zero.
# This script does not run anything that writes to the candidate tree.
$ErrorActionPreference = 'Continue'
$env:NODE_ENV = $null

$root = 'E:/yatraflow-wt/832-server'
$out  = 'E:/yatraflow-wt/scratch-832/profile-integrated-gate-20261104/logs'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Set-Location $root

$env:PROFILE_FIXTURE_BASE = 'http://127.0.0.1:5199'
$env:ACCENT_OUT = 'E:/yatraflow-wt/scratch-832/profile-integrated-gate-20261104/accents'
$env:AI_OUT = 'E:/yatraflow-wt/scratch-832/profile-integrated-gate-20261104/ai-shots'

$probes = @(
  @{ name = 'regression'; script = 'dev/profile-repair-regression.mjs' },
  @{ name = 'save-contract'; script = 'dev/profile-save-contract.mjs' },
  @{ name = 'ai-card'; script = 'dev/profile-ai-card.mjs' },
  @{ name = 'pace'; script = 'dev/trip-settings-pace.mjs' }
)

foreach ($p in $probes) {
  $cmd = "node $($p.script)"
  @(
    "cwd: $root",
    "cmd: $cmd",
    "PROFILE_FIXTURE_BASE=$env:PROFILE_FIXTURE_BASE",
    "NODE_ENV=<cleared>",
    "node: $(node --version)",
    "started: $(Get-Date -Format o)"
  ) | Set-Content -Path "$out/$($p.name).cmd" -Encoding utf8

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  & node $p.script *>&1 | Tee-Object -FilePath "$out/$($p.name).log"
  $code = $LASTEXITCODE
  $sw.Stop()

  Set-Content -Path "$out/$($p.name).exit" -Value $code -Encoding utf8
  Add-Content -Path "$out/$($p.name).cmd" -Value "exit: $code`nduration_ms: $($sw.ElapsedMilliseconds)`nfinished: $(Get-Date -Format o)"
  Write-Output "=== $($p.name) exit=$code ($($sw.ElapsedMilliseconds)ms) ==="
}
