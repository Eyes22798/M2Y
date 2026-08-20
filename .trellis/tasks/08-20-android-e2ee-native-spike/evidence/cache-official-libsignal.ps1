$ErrorActionPreference = 'Stop'

$downloadRoot = Join-Path $env:TEMP 'm2y-libsignal-0.101.0'
$gradleArtifacts = Join-Path $env:USERPROFILE '.gradle\caches\modules-2\files-2.1\org.signal'
$segmentSize = 1MB
$throttle = 2

$artifacts = @(
  [pscustomobject]@{
    Module = 'libsignal-client'
    File = 'libsignal-client-0.101.0.jar'
    Size = 148150784L
    Sha256 = '40c8edaa7e178a8b1610ac6c2c20f2f936c53791949468f77ea4b1af3a64a68f'
    Sha1 = 'c58192970815445ae06925356781afeb4f9f7009'
  },
  [pscustomobject]@{
    Module = 'libsignal-android'
    File = 'libsignal-android-0.101.0.aar'
    Size = 195212272L
    Sha256 = '7034a7ae986153c2261775f43be88edbe8d46cf364b4bc0df08a63fc9a1e389a'
    Sha1 = '65dcfc2e4b7cd780526752a50c9f55963c8cb53d'
  }
)

function Test-ExpectedFile {
  param(
    [Parameter(Mandatory)] [string] $Path,
    [Parameter(Mandatory)] [long] $Size,
    [Parameter(Mandatory)] [string] $Sha256
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }

  $file = Get-Item -LiteralPath $Path
  if ($file.Length -ne $Size) {
    return $false
  }

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Sha256
}

function Get-OfficialArtifact {
  param([Parameter(Mandatory)] $Artifact)

  $artifactRoot = Join-Path $downloadRoot $Artifact.Module
  $partsRoot = Join-Path $artifactRoot 'parts'
  $outputPath = Join-Path $artifactRoot $Artifact.File
  New-Item -ItemType Directory -Force -Path $partsRoot | Out-Null

  if (-not (Test-ExpectedFile -Path $outputPath -Size $Artifact.Size -Sha256 $Artifact.Sha256)) {
    $url = "https://storage.googleapis.com/build-artifacts.signal.org/libraries/maven/org/signal/$($Artifact.Module)/0.101.0/$($Artifact.File)"
    $segmentCount = [math]::Ceiling($Artifact.Size / $segmentSize)
    $pending = [System.Collections.Generic.List[object]]::new()

    for ($index = 0; $index -lt $segmentCount; $index++) {
      $start = [long]$index * $segmentSize
      $end = [math]::Min($Artifact.Size - 1, $start + $segmentSize - 1)
      $expectedPartSize = $end - $start + 1
      $partPath = Join-Path $partsRoot ('part-{0:D5}.bin' -f $index)

      if ((Test-Path -LiteralPath $partPath) -and (Get-Item -LiteralPath $partPath).Length -ne $expectedPartSize) {
        Remove-Item -LiteralPath $partPath
      }

      if (-not (Test-Path -LiteralPath $partPath)) {
        while ($pending.Count -ge $throttle) {
          $process = $pending[0]
          $process.WaitForExit()
          $pending.RemoveAt(0)
        }

        $process = Start-Process -FilePath 'curl.exe' -ArgumentList @(
          '--fail', '--location', '--retry', '50', '--retry-all-errors',
          '--retry-delay', '2', '--connect-timeout', '30',
          '--silent', '--show-error', '--range', "$start-$end",
          '--output', $partPath, $url
        ) -NoNewWindow -PassThru
        $pending.Add($process)
      }
    }

    foreach ($process in $pending) {
      $process.WaitForExit()
    }

    for ($index = 0; $index -lt $segmentCount; $index++) {
      $start = [long]$index * $segmentSize
      $end = [math]::Min($Artifact.Size - 1, $start + $segmentSize - 1)
      $expectedPartSize = $end - $start + 1
      $partPath = Join-Path $partsRoot ('part-{0:D5}.bin' -f $index)
      if (-not (Test-Path -LiteralPath $partPath) -or (Get-Item -LiteralPath $partPath).Length -ne $expectedPartSize) {
        throw "curl did not produce a complete segment for $($Artifact.File): $index"
      }
    }

    $output = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
      for ($index = 0; $index -lt $segmentCount; $index++) {
        $partPath = Join-Path $partsRoot ('part-{0:D5}.bin' -f $index)
        $input = [System.IO.File]::OpenRead($partPath)
        try {
          $input.CopyTo($output)
        } finally {
          $input.Dispose()
        }
      }
    } finally {
      $output.Dispose()
    }
  }

  if (-not (Test-ExpectedFile -Path $outputPath -Size $Artifact.Size -Sha256 $Artifact.Sha256)) {
    throw "Official checksum verification failed for $($Artifact.File)"
  }

  $cacheRoot = Join-Path $gradleArtifacts "$($Artifact.Module)\0.101.0\$($Artifact.Sha1)"
  New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
  Copy-Item -LiteralPath $outputPath -Destination (Join-Path $cacheRoot $Artifact.File) -Force

  Write-Output ("verified {0} bytes={1} sha256={2}" -f $Artifact.File, $Artifact.Size, $Artifact.Sha256)
}

New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
foreach ($artifact in $artifacts) {
  Get-OfficialArtifact -Artifact $artifact
}
