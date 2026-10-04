param([switch]$Restart, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$studioDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logDirectory = Join-Path $studioDirectory 'logs'
[IO.Directory]::CreateDirectory($logDirectory) | Out-Null
$launchLog = Join-Path $logDirectory 'launcher.log'

function Write-LaunchMessage([string]$Message) {
    Write-Host $Message
    Add-Content -LiteralPath $launchLog -Value (('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message)) -Encoding UTF8
}

function Get-StudioHealth([string]$Address) {
    $response = $null
    $reader = $null
    try {
        # No Invoke-WebRequest: no IE dependency or interactive security prompt.
        $request = [Net.HttpWebRequest]::Create($Address + 'api/health')
        $request.Proxy = $null
        $request.Timeout = 800
        $request.ReadWriteTimeout = 800
        $response = $request.GetResponse()
        $reader = [IO.StreamReader]::new($response.GetResponseStream())
        $health = $reader.ReadToEnd() | ConvertFrom-Json
        if ($health.app -eq '227-motion-studio') { return $health }
    } catch { return $null }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $response) { $response.Dispose() }
    }
    return $null
}

try {
    # Windows environment blocks can contain differently cased duplicate
    # names inherited from a terminal. PowerShell 5 Start-Process rejects them.
    $studioEnvironment = [Environment]::GetEnvironmentVariables('Process')
    foreach ($studioDuplicate in ($studioEnvironment.Keys | Group-Object { $_.ToUpperInvariant() } | Where-Object Count -gt 1)) {
        $studioValue = [string]$studioEnvironment[$studioDuplicate.Group[0]]
        foreach ($studioName in $studioDuplicate.Group) { [Environment]::SetEnvironmentVariable($studioName, $null, 'Process') }
        [Environment]::SetEnvironmentVariable($studioDuplicate.Group[0], $studioValue, 'Process')
    }
    $configuration = Get-Content -LiteralPath (Join-Path $studioDirectory 'config.example.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($configName in @('config.json', 'config.local.json')) {
        $configPath = Join-Path $studioDirectory $configName
        if (Test-Path -LiteralPath $configPath) {
            $overrides = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($property in $overrides.PSObject.Properties) { $configuration | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value -Force }
        }
    }
    if ($env:STUDIO_PORT) { $configuration.port = [int]$env:STUDIO_PORT }
    $studioPort = [int]$configuration.port
    if ($studioPort -lt 1 -or $studioPort -gt 65535) { throw 'config.json 中的 port 无效。' }
    $studioAddress = 'http://127.0.0.1:' + $studioPort + '/'
    $nodeCandidates = [Collections.Generic.List[string]]::new()
    $nodeCandidates.Add((Join-Path $studioDirectory 'runtime/node/node.exe'))
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) { $nodeCandidates.Add($nodeCommand.Source) }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if ($base) { $nodeCandidates.Add((Join-Path $base 'nodejs/node.exe')) }
    }
    $nodeExecutable = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $nodeExecutable) { throw '未找到 Node.js。请安装 Node.js 22 或更高版本，然后重新双击启动文件。' }
    $nodeVersion = & $nodeExecutable --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw '需要 Node.js 22 或更高版本。' }
    $serverFile = Join-Path $studioDirectory 'server.mjs'
    if (-not (Test-Path -LiteralPath $serverFile -PathType Leaf)) { throw '缺少 studio/server.mjs，请保留完整工作区。' }
    if (-not (Test-Path -LiteralPath (Join-Path $studioDirectory 'node_modules/three/package.json') -PathType Leaf)) { throw '缺少 studio/node_modules，请保留项目自带的依赖目录。' }

    $health = Get-StudioHealth $studioAddress
    if ($health) {
        if (-not [string]::Equals([IO.Path]::GetFullPath($health.root), $studioDirectory, [StringComparison]::OrdinalIgnoreCase)) { throw ('端口 {0} 已被另一份 22/7 工作区使用，请关闭那份服务或修改 config.json 中的 port。' -f $studioPort) }
        if ($Restart) {
            # Only stop the identified Node process serving this exact workspace.
            $runningProcess = Get-Process -Id ([int]$health.pid) -ErrorAction Stop
            if ($runningProcess.ProcessName -ne 'node') { throw '服务进程身份异常，未执行重启。' }
            Stop-Process -Id $runningProcess.Id -ErrorAction Stop
            $runningProcess.WaitForExit(3000) | Out-Null
            $health = $null
        }
    }

    if (-not $health) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $outputLog = Join-Path $logDirectory ('server-' + $stamp + '.log')
        $errorLog = Join-Path $logDirectory ('server-' + $stamp + '.error.log')
        Write-LaunchMessage ('正在启动 22/7 Motion Studio，Node ' + $nodeVersion + '，端口 ' + $studioPort)
        $process = Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $studioDirectory -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            $health = Get-StudioHealth $studioAddress
            if ($health) { break }
            $process.Refresh()
            if ($process.HasExited) {
                $detail = (Get-Content -LiteralPath $errorLog -Tail 12 -Encoding UTF8 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
                throw ('服务启动失败。' + [Environment]::NewLine + $detail + [Environment]::NewLine + '日志：' + $errorLog)
            }
            Start-Sleep -Milliseconds 250
        }
        if (-not $health) { throw ('服务尚未就绪，请查看日志：' + $errorLog) }
        if (-not [string]::Equals([IO.Path]::GetFullPath($health.root), $studioDirectory, [StringComparison]::OrdinalIgnoreCase)) { throw '端口被另一工作区占用，请修改 config.json 中的 port。' }
    }

    Write-LaunchMessage ('22/7 Motion Studio 已就绪：' + $studioAddress)
    if (-not $NoBrowser) {
        try { Start-Process -FilePath $studioAddress }
        catch { Write-LaunchMessage ('浏览器未自动打开，请手动访问 ' + $studioAddress) }
    }
    exit 0
} catch {
    Write-LaunchMessage ('启动失败：' + $_.Exception.Message)
    Write-Host ('完整启动记录：' + $launchLog) -ForegroundColor Yellow
    exit 1
}
