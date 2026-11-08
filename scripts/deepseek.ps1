<#
.SYNOPSIS
    以 Claude Code CLI 調用 DeepSeek（AGENTS.md「調用方式」）。

.DESCRIPTION
    Claude Code 連到 DeepSeek 的 Anthropic 相容 API。DeepSeek 可以讀取與寫入儲存庫的檔案，
    但不能執行終端指令或連網。

    API 金鑰只從使用者環境變數 DEEPSEEK_API_KEY 讀取。不得把金鑰寫入本檔或儲存庫。
    環境變數只在本次執行中生效，結束後還原。

.PARAMETER Mode
    edit：可以讀取與寫入檔案（切分任務、寫介面與 Stub、精煉 skill）。
    read：只可以讀取檔案（判定失敗原因）。

.PARAMETER Prompt
    工作說明與檔案路徑。沒有提供時，從 stdin 讀取。

.PARAMETER OutFile
    把 DeepSeek 的回覆另存到此檔案（UTF-8）。

.EXAMPLE
    pwsh -File scripts/deepseek.ps1 -Mode edit -Prompt "依 docs/x/PLAN.md 切分任務，寫入 docs/x/TASK.md。"

.EXAMPLE
    "判定 tests/x.spec.ts 失敗的原因。log：<路徑>" | pwsh -File scripts/deepseek.ps1 -Mode read -OutFile out.md
#>
param(
    [ValidateSet("edit", "read")]
    [string]$Mode = "read",
    [string]$Prompt,
    [string]$OutFile,
    # API 接受的名稱見 DeepSeek 文件。2026-11-09 是 deepseek-flash 與 deepseek-v4-pro。
    [string]$Model = "deepseek-flash"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrEmpty($env:DEEPSEEK_API_KEY)) {
    Write-Error "找不到環境變數 DEEPSEEK_API_KEY。請在 Windows 使用者環境變數中設定。"
}
if ([string]::IsNullOrEmpty($Prompt)) {
    $Prompt = [Console]::In.ReadToEnd()
}
if ([string]::IsNullOrWhiteSpace($Prompt)) {
    Write-Error "沒有工作說明。請使用 -Prompt 或由 stdin 傳入。"
}

$repo = Split-Path -Parent $PSScriptRoot
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 呼叫端（例如 Claude Code）的 CLAUDE*／ANTHROPIC* 變數會讓子程序接到呼叫端的 session，先移除。
$saved = @{}
Get-ChildItem env: | Where-Object { $_.Name -match '^(CLAUDE|ANTHROPIC)' } | ForEach-Object {
    $saved[$_.Name] = $_.Value
    Remove-Item "env:$($_.Name)"
}

$settings = @{
    ANTHROPIC_BASE_URL             = "https://api.deepseek.com/anthropic"
    ANTHROPIC_AUTH_TOKEN           = $env:DEEPSEEK_API_KEY
    # 依 DeepSeek 的 Claude Code 說明，主模型加上 [1m]（1M 上下文）。
    ANTHROPIC_MODEL                = "$Model[1m]"
    ANTHROPIC_DEFAULT_OPUS_MODEL   = "$Model[1m]"
    ANTHROPIC_DEFAULT_SONNET_MODEL = "$Model[1m]"
    ANTHROPIC_DEFAULT_HAIKU_MODEL  = $Model
    CLAUDE_CODE_SUBAGENT_MODEL     = $Model
    # 與 Claude（Anthropic）的設定、登入與記憶分開。
    CLAUDE_CONFIG_DIR              = Join-Path $env:USERPROFILE ".claude-deepseek"
}
foreach ($name in $settings.Keys) { Set-Item "env:$name" $settings[$name] }

$readTools = "Read,Grep,Glob"
$blocked = "Bash,PowerShell,WebFetch,WebSearch,Agent,NotebookEdit"
if ($Mode -eq "edit") {
    $arguments = @("--permission-mode", "acceptEdits", "--allowedTools", "$readTools,Edit,Write")
} else {
    $arguments = @("--permission-mode", "plan", "--allowedTools", $readTools)
    $blocked = "$blocked,Edit,Write"
}

$system = @"
你是 DeepSeek，本儲存庫開發流程中的一個助理。開始工作前，必須先讀取 AGENTS.md，並遵守其中的規則，
特別是「開發流程」的「助理的規則」。你不能執行終端指令。除了測試檔與 Stub，不可修改程式碼。
完成後，用正體中文列出你讀取與修改的檔案，以及結論。
"@

try {
    Push-Location $repo
    $output = $Prompt | claude -p @arguments --disallowedTools $blocked `
        --append-system-prompt $system --output-format text
    $code = $LASTEXITCODE
    $output
    if (-not [string]::IsNullOrEmpty($OutFile)) {
        $output | Set-Content -Path $OutFile -Encoding utf8
    }
    exit $code
} finally {
    Pop-Location
    foreach ($name in $settings.Keys) { Remove-Item "env:$name" -ErrorAction SilentlyContinue }
    foreach ($name in $saved.Keys) { Set-Item "env:$name" $saved[$name] }
}
