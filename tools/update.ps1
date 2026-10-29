# =====================================
# IZM-NewTab を GitHub の最新版に更新する（update.bat から起動）
# 今のフォルダーにそのまま上書きするので、時間割・背景などの設定はそのまま残る
# =====================================
param([switch]$Yes) # 確認なしで進める（テスト用）

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'its-moto/izm-newtab'
$ZipUrl = "https://github.com/$Repo/archive/refs/heads/main.zip"
$LatestJsonUrl = "https://raw.githubusercontent.com/$Repo/main/version.json"
$Root = Split-Path -Parent $PSScriptRoot # newtab フォルダー（tools の1つ上）

function Finish($code) {
    if (-not $Yes) { Read-Host 'Enter キーで閉じます' | Out-Null }
    exit $code
}

try {
    Write-Host '=== IZM-NewTab アップデート ===' -ForegroundColor Cyan

    # 正しいフォルダーか確認
    $manifestPath = Join-Path $Root 'manifest.json'
    if (-not (Test-Path $manifestPath)) {
        Write-Host "manifest.json が見つかりません: $Root" -ForegroundColor Red
        Finish 1
    }
    $manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.name -ne 'IZM-NewTab') {
        Write-Host "IZM-NewTab のフォルダーではないようです: $Root" -ForegroundColor Red
        Finish 1
    }
    # 開発用のフォルダー（git で管理している）は上書きしない
    if (Test-Path (Join-Path $Root '.git')) {
        Write-Host 'このフォルダーは git で管理されているため更新しません（git pull を使ってください）' -ForegroundColor Yellow
        Finish 1
    }

    # バージョンを比べる
    $latest = Invoke-RestMethod -Uri $LatestJsonUrl -Headers @{ 'Cache-Control' = 'no-cache' }
    Write-Host "今のバージョン : $($manifest.version)"
    Write-Host "最新バージョン : $($latest.version)"
    if ($latest.message) {
        Write-Host ''
        Write-Host '更新内容:'
        $latest.message -split "`n" | Where-Object { $_ } | ForEach-Object { Write-Host "  - $_" }
    }
    Write-Host ''

    if ([version]$latest.version -le [version]$manifest.version) {
        Write-Host 'すでに最新版です。' -ForegroundColor Green
        if ($Yes) { Finish 0 }
        $answer = Read-Host 'それでも最新版で上書きしますか？ (y/N)'
        if ($answer -notmatch '^[yY]') { Finish 0 }
    } elseif (-not $Yes) {
        $answer = Read-Host '更新しますか？ (Y/n)'
        if ($answer -match '^[nN]') { Finish 0 }
    }

    # ダウンロードして展開
    $work = Join-Path $env:TEMP "izm-newtab-update-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        $zip = Join-Path $work 'latest.zip'
        Write-Host 'ダウンロード中...'
        $ProgressPreference = 'SilentlyContinue' # 進捗表示があると極端に遅くなるため
        Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing

        Write-Host '展開中...'
        Expand-Archive -Path $zip -DestinationPath $work
        $src = Get-ChildItem $work -Directory | Select-Object -First 1 # izm-newtab-main
        if (-not $src -or -not (Test-Path (Join-Path $src.FullName 'manifest.json'))) {
            throw 'ダウンロードしたファイルの中身が想定と違います'
        }

        # 上書き（update.bat は実行中なので触らない。手元にしかないファイルは消さない）
        Write-Host '上書き中...'
        robocopy $src.FullName $Root /E /XF update.bat /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "ファイルのコピーに失敗しました（robocopy: $LASTEXITCODE）" }
    } finally {
        Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host ''
    Write-Host "v$($latest.version) に更新しました！" -ForegroundColor Green
    Write-Host '新しいタブの更新パネルにある「拡張機能を再読み込み」を押すか、'
    Write-Host 'chrome://extensions で IZM-NewTab の再読み込みボタンを押してください。'
    Finish 0
} catch {
    Write-Host ''
    Write-Host "更新に失敗しました: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "うまくいかないときは https://github.com/$Repo からZIPをダウンロードして上書きしてください。"
    Finish 1
}
