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

# ---------- 進み具合の表示 ----------
# 1行を上書きしながら  / [=====     ]  50%  のように表示する（割合が分からないときはくるくるだけ）
$Spinner = '/', '-', '\', '|'
$script:spinIndex = 0
$script:lastDraw = [DateTime]::MinValue

function Show-Progress([string]$Label, [double]$Ratio = -1, [string]$Extra = '') {
    # 書き換えすぎると遅くなるので 0.08 秒に1回まで
    $now = [DateTime]::Now
    if (($now - $script:lastDraw).TotalMilliseconds -lt 80) { return }
    $script:lastDraw = $now
    $script:spinIndex = ($script:spinIndex + 1) % $Spinner.Count
    $spin = $Spinner[$script:spinIndex]
    if ($Ratio -ge 0) {
        $line = '  {0} {1} {2} {3,3}%  {4}' -f $spin, $Label, (Format-Bar $Ratio), [Math]::Floor([Math]::Min(1.0, $Ratio) * 100), $Extra
    } else {
        $line = '  {0} {1}  {2}' -f $spin, $Label, $Extra
    }
    [Console]::Write("`r" + $line.PadRight(60))
}

function Complete-Progress([string]$Label, [string]$Extra = '') {
    $line = '  OK {0} {1} 100%  {2}' -f $Label, (Format-Bar 1), $Extra
    [Console]::Write("`r" + $line.PadRight(60) + "`n")
    $script:lastDraw = [DateTime]::MinValue
}

function Format-Bar([double]$Ratio, [int]$Width = 20) {
    $filled = [int][Math]::Floor([Math]::Min(1.0, [Math]::Max(0.0, $Ratio)) * $Width) # 1 と書くと整数として扱われ、0.3 などが切り捨てられる
    return '[' + ('=' * $filled) + (' ' * ($Width - $filled)) + ']'
}

function Format-Size([double]$Bytes) {
    if ($Bytes -ge 1MB) { return '{0:N1} MB' -f ($Bytes / 1MB) }
    return '{0:N0} KB' -f ($Bytes / 1KB)
}

try {
    Write-Host '=== 出雲式新しいタブ アップデート ===' -ForegroundColor Cyan

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
        # ダウンロード（GitHub の ZIP は大きさが事前に分からないので、くるくると受け取った量を出す）
        $zip = Join-Path $work 'latest.zip'
        Add-Type -AssemblyName System.Net.Http
        $client = New-Object System.Net.Http.HttpClient
        $client.Timeout = [TimeSpan]::FromMinutes(5)
        $received = 0
        try {
            $response = $client.GetAsync($ZipUrl, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
            $response.EnsureSuccessStatusCode() | Out-Null
            $total = $response.Content.Headers.ContentLength
            $in = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            $out = [IO.File]::Create($zip)
            try {
                $buffer = New-Object byte[] 65536
                while (($read = $in.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $out.Write($buffer, 0, $read)
                    $received += $read
                    $ratio = if ($total) { $received / $total } else { -1 }
                    Show-Progress 'ダウンロード' $ratio (Format-Size $received)
                }
            } finally {
                $out.Dispose()
                $in.Dispose()
            }
        } finally {
            $client.Dispose()
        }
        Complete-Progress 'ダウンロード' (Format-Size $received)

        # 展開（ファイルの数が分かるので、何%まで進んだかを出す）
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $extractRoot = Join-Path $work 'extract'
        $archive = [IO.Compression.ZipFile]::OpenRead($zip)
        try {
            $entries = @($archive.Entries)
            $rootFull = [IO.Path]::GetFullPath($extractRoot) + [IO.Path]::DirectorySeparatorChar
            for ($i = 0; $i -lt $entries.Count; $i++) {
                $entry = $entries[$i]
                $dest = [IO.Path]::GetFullPath((Join-Path $extractRoot $entry.FullName))
                # ZIP の中のパスで展開先の外に書き出さないようにする
                if (-not $dest.StartsWith($rootFull)) { throw "ZIP の中に不正なパスがあります: $($entry.FullName)" }
                if ($entry.FullName.EndsWith('/')) {
                    New-Item -ItemType Directory -Path $dest -Force | Out-Null
                } else {
                    New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
                    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
                }
                Show-Progress '展開      ' (($i + 1) / $entries.Count) "$($i + 1) / $($entries.Count)"
            }
        } finally {
            $archive.Dispose()
        }
        Complete-Progress '展開      ' "$($entries.Count) 個"

        $src = Get-ChildItem $extractRoot -Directory | Select-Object -First 1 # izm-newtab-main
        if (-not $src -or -not (Test-Path (Join-Path $src.FullName 'manifest.json'))) {
            throw 'ダウンロードしたファイルの中身が想定と違います'
        }

        # 上書き（update.bat は実行中なので触らない。手元にしかないファイルは消さない）
        $files = @(Get-ChildItem $src.FullName -Recurse -File | Where-Object { $_.FullName -ne (Join-Path $src.FullName 'update.bat') })
        for ($i = 0; $i -lt $files.Count; $i++) {
            $relative = $files[$i].FullName.Substring($src.FullName.Length + 1)
            $dest = Join-Path $Root $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
            Copy-Item -LiteralPath $files[$i].FullName -Destination $dest -Force
            Show-Progress '上書き    ' (($i + 1) / $files.Count) "$($i + 1) / $($files.Count)"
        }
        Complete-Progress '上書き    ' "$($files.Count) 個"
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
