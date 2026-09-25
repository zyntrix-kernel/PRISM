<# PRISM offline launcher (Windows PowerShell 5.1 compatible).
   Serves this folder over http://localhost:<port> and opens the browser.
   No installs, no internet needed for tracking (wasm + model ship locally).
   localhost counts as a secure context, so the webcam works.
   Usage: double-click Start-PRISM.bat, or: powershell -File Start-PRISM.ps1 [-Port 8080] #>
param([int]$Port = 0)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }

function Get-FreePort {
  $l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  $l.Start()
  $p = $l.LocalEndpoint.Port
  $l.Stop()
  return $p
}

if ($Port -le 0) { $Port = Get-FreePort }

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.wasm' = 'application/wasm'
  '.task' = 'application/octet-stream'
  '.onnx' = 'application/octet-stream'
  '.data' = 'application/octet-stream'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.svg'  = 'image/svg+xml'
  '.map'  = 'application/json'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not listen on port $Port (in use?). Retry with: Start-PRISM.ps1 -Port 8099" -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

$url = "http://localhost:$Port/"
$portFile = Join-Path $env:TEMP 'prism-usb.port'
Set-Content -Path $portFile -Value $Port -NoNewline
Write-Host ''
Write-Host '  PRISM is live at ' -NoNewline
Write-Host $url -ForegroundColor Cyan
Write-Host '  Keep this window open. Close it (or Ctrl+C) to stop.' -ForegroundColor DarkGray
Write-Host ''
Start-Process $url

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = $ctx.Request.Url.LocalPath.TrimStart('/')
      if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
      $full = Join-Path $root $path
      $full = [IO.Path]::GetFullPath($full)
      # Block path traversal outside the PRISM folder.
      if (-not $full.StartsWith([IO.Path]::GetFullPath($root), [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
        $ctx.Response.StatusCode = 404
        $ctx.Response.Close()
        continue
      }
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = $mime[$ext]
      if (-not $type) { $type = 'application/octet-stream' }
      $ctx.Response.ContentType = $type
      if ($ctx.Request.HttpMethod -eq 'HEAD') {
        $ctx.Response.ContentLength64 = (Get-Item $full).Length
        $ctx.Response.Close()
        continue
      }
      $bytes = [IO.File]::ReadAllBytes($full)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.Close()
    } catch {
      try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
  Remove-Item $portFile -ErrorAction SilentlyContinue
}
