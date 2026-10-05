param([Parameter(Mandatory=$true)][string]$UnityExe, [Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$studioDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectDirectory = Join-Path $studioDirectory 'desktop-unity'
$editorExecutable = (Resolve-Path -LiteralPath $UnityExe).Path
$pluginDirectory = Join-Path $projectDirectory 'Assets/Plugins'
[IO.Directory]::CreateDirectory($pluginDirectory) | Out-Null
$jsonLibrary = Join-Path (Split-Path $editorExecutable) 'Data/Managed/Newtonsoft.Json.dll'
Copy-Item -LiteralPath $jsonLibrary -Destination (Join-Path $pluginDirectory 'Newtonsoft.Json.dll')
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$env:STUDIO_NATIVE_BUILD = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) '22-7 Motion Studio.exe'
$buildLog = Join-Path $studioDirectory 'cache/native-build.log'
[IO.Directory]::CreateDirectory((Split-Path $buildLog)) | Out-Null
$nativeBuild = Start-Process -FilePath $editorExecutable -WindowStyle Hidden -ArgumentList '-batchmode','-projectPath',('"'+$projectDirectory+'"'),'-executeMethod','BuildStudio.Build','-logFile',('"'+$buildLog+'"') -Wait -PassThru
if ($nativeBuild.ExitCode -ne 0) { throw 'Unity 构建失败，请检查本机 cache/native-build.log' }
Write-Host '原生 Windows 程序已构建。'
