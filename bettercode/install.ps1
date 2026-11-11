# Installs BetterCode on Windows from its GitHub releases: the `bettercode` command into ~\.bettercode\bin and the
# BetterCode desktop app. Rerun it to update both.
#
#   irm https://github.com/7q9k/BetterCode/releases/latest/download/install.ps1 | iex
#
# Options come from environment variables, since `iex` takes no arguments:
#   $env:BETTERCODE_VERSION = "2.3.0"   install a specific version
#   $env:BETTERCODE_NO_DESKTOP = "1"    install only the bettercode command

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = "7q9k/BetterCode"
$InstallDir = Join-Path $HOME ".bettercode\bin"

$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$arch = switch ($arch) {
  "ARM64" { "arm64" }
  "AMD64" { "x64" }
  default { throw "Unsupported architecture: $arch" }
}

$target = "windows-$arch"
if ($arch -eq "x64") {
  # PF_AVX2_INSTRUCTIONS_AVAILABLE; CPUs without AVX2 need the baseline build.
  $kernel = Add-Type -PassThru -Name K -Namespace BetterCodeInstall -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(int feature);'
  if (-not $kernel::IsProcessorFeaturePresent(40)) { $target = "$target-baseline" }
}

if ($env:BETTERCODE_VERSION) {
  $tag = "v" + $env:BETTERCODE_VERSION.TrimStart("v")
} else {
  $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ Accept = "application/vnd.github+json" }
  $tag = $latest.tag_name
}
$version = $tag.TrimStart("v")
$base = "https://github.com/$Repo/releases/download/$tag"

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("bettercode-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Force $tmp | Out-Null

try {
  Write-Host ""
  Write-Host "Installing bettercode $version ($target)"
  $archive = Join-Path $tmp "bettercode.zip"
  Invoke-WebRequest -UseBasicParsing -Uri "$base/bettercode-$target.zip" -OutFile $archive
  Expand-Archive -Force -Path $archive -DestinationPath (Join-Path $tmp "cli")
  New-Item -ItemType Directory -Force $InstallDir | Out-Null
  Copy-Item -Force (Join-Path $tmp "cli\bettercode.exe") (Join-Path $InstallDir "bettercode.exe")

  $desktop = $false
  if (-not $env:BETTERCODE_NO_DESKTOP) {
    if ($arch -eq "x64") {
      Write-Host "Installing the desktop app"
      $setup = Join-Path $tmp "bettercode-setup.exe"
      Invoke-WebRequest -UseBasicParsing -Uri "$base/bettercode-desktop-windows-x64-setup.exe" -OutFile $setup
      Start-Process -FilePath $setup -ArgumentList "/S" -Wait
      $desktop = $true
    } else {
      Write-Host "No desktop app is built for Windows ARM64 yet; installed the bettercode command only."
    }
  }

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (($userPath -split ";") -notcontains $InstallDir) {
    [Environment]::SetEnvironmentVariable("Path", (@($userPath, $InstallDir) | Where-Object { $_ }) -join ";", "User")
    Write-Host "Added $InstallDir to your PATH."
  }
  if (($env:Path -split ";") -notcontains $InstallDir) { $env:Path = "$env:Path;$InstallDir" }

  Write-Host ""
  Write-Host "BetterCode $version is installed." -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Start it in a project:  cd <project>; bettercode"
  if ($desktop) { Write-Host "  Desktop app:            BetterCode in the Start menu" }
  Write-Host ""
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
