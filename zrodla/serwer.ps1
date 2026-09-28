# Pokaz weselny - lokalny serwer: strona pokazu (tylko ten komputer) + pilot w telefonie (siec Wi-Fi).
# Zdjecia i filmy NIE przechodza przez serwer - przegladarka czyta je prosto z folderow.
$port = 8765
$url  = "http://localhost:$port/"
$sep  = [System.IO.Path]::DirectorySeparatorChar
$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path)).TrimEnd($sep) + $sep
$utf8 = New-Object System.Text.UTF8Encoding($false)
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.woff2' = 'font/woff2'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'
}
$S = @{ token = ''; state = '{}'; cmds = New-Object System.Collections.ArrayList; thumb = New-Object byte[] 0; rev = 0; lastSync = [DateTime]::MinValue; seen = @{}; ids = New-Object System.Collections.ArrayList; thumbs = @{}; tord = New-Object System.Collections.ArrayList; gtoken = ''; glast = @{} }

function Get-Ips {
  $list = @()
  foreach ($ni in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($ni.OperationalStatus -ne 'Up') { continue }
    $t = [string]$ni.NetworkInterfaceType
    if ($t -eq 'Loopback' -or $t -eq 'Tunnel') { continue }
    $p = $ni.GetIPProperties()
    $gw = $false
    foreach ($g in $p.GatewayAddresses) { if ($g.Address.AddressFamily -eq 'InterNetwork' -and $g.Address.ToString() -ne '0.0.0.0') { $gw = $true } }
    foreach ($ua in $p.UnicastAddresses) {
      if ($ua.Address.AddressFamily -ne 'InterNetwork') { continue }
      $ip = $ua.Address.ToString()
      if ($ip.StartsWith('169.254.') -or $ip.StartsWith('127.')) { continue }
      # VPN i karty wirtualne (NordVPN = NordLynx, WireGuard, VirtualBox, Hyper-V...) - telefon przez nie sie nie polaczy
      $desc = [string]$ni.Description + ' ' + [string]$ni.Name
      $vpn = $desc -match '(?i)nord|lynx|vpn|wireguard|wintun|tap-|tap |openvpn|virtual|vmware|vbox|hyper-v|vethernet|tailscale|zerotier|hamachi|docker|wsl|bluetooth|proton|surfshark|expressvpn|cisco|fortinet|pangp'
      $kind = 'other'; if ($t -eq 'Wireless80211') { $kind = 'wifi' } elseif ($t -like 'Ethernet*') { $kind = 'ethernet' }
      $rank = 5
      if (-not $vpn) { if ($kind -eq 'wifi') { $rank = 0 } elseif ($gw) { $rank = 1 } else { $rank = 2 } } else { $rank = 9 }
      $list += New-Object PSObject -Property @{ ip = $ip; name = $ni.Name; gw = $gw; vpn = $vpn; kind = $kind; rank = $rank }
    }
  }
  return @($list | Sort-Object -Property rank)
}
function Json-Str([string]$s) {
  return '"' + ($s -replace '\\', '\\' -replace '"', '\"' -replace '[\x00-\x1f]', ' ') + '"'
}
function Send-Resp($client, [int]$code, [string]$type, $body, [bool]$head) {
  $reason = @{ 200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 502 = 'Bad Gateway' }[$code]
  if ($body -is [string]) { $body = $utf8.GetBytes($body) }
  if ($null -eq $body) { $body = New-Object byte[] 0 }
  $h = "HTTP/1.1 $code $reason`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($h)
  $st = $client.GetStream()
  $st.Write($hb, 0, $hb.Length)
  if (-not $head -and $body.Length -gt 0) { $st.Write($body, 0, $body.Length) }
  $st.Flush()
}
function Read-Req($client) {
  $st = $client.GetStream(); $st.ReadTimeout = 2000
  $buf = New-Object byte[] 65536
  $ms = New-Object System.IO.MemoryStream
  $end = -1
  while ($end -lt 0) {
    $n = $st.Read($buf, 0, $buf.Length)
    if ($n -le 0) { return $null }
    $ms.Write($buf, 0, $n)
    if ($ms.Length -gt 262144) { return $null }
    $end = [System.Text.Encoding]::ASCII.GetString($ms.ToArray()).IndexOf("`r`n`r`n")
  }
  $all = $ms.ToArray()
  $lines = [System.Text.Encoding]::ASCII.GetString($all, 0, $end) -split "`r`n"
  $first = $lines[0] -split ' '
  if ($first.Count -lt 2) { return $null }
  $len = 0
  foreach ($l in $lines) { if ($l -match '^(?i)content-length:\s*(\d+)') { $len = [int]$matches[1] } }
  if ($len -gt 8MB) { return $null }
  $body = New-Object System.IO.MemoryStream
  $have = $all.Length - ($end + 4)
  if ($have -gt 0) { $body.Write($all, $end + 4, $have) }
  while ($body.Length -lt $len) {
    $n = $st.Read($buf, 0, [Math]::Min($buf.Length, $len - $body.Length))
    if ($n -le 0) { break }
    $body.Write($buf, 0, $n)
  }
  $target = $first[1]; $path = $target; $qs = ''
  $qi = $target.IndexOf('?'); if ($qi -ge 0) { $path = $target.Substring(0, $qi); $qs = $target.Substring($qi + 1) }
  $q = @{}
  foreach ($pair in ($qs -split '&')) { if ($pair) { $kv = $pair -split '=', 2; $q[[Uri]::UnescapeDataString($kv[0])] = $(if ($kv.Count -gt 1) { [Uri]::UnescapeDataString($kv[1].Replace('+', ' ')) } else { '' }) } }
  return @{ method = $first[0].ToUpper(); path = [Uri]::UnescapeDataString($path); q = $q; body = $body.ToArray() }
}
function YT-Get([string]$u) {
  $h = @{ 'Accept-Language' = 'pl-PL,pl;q=0.9,en;q=0.5'; 'Cookie' = 'CONSENT=YES+cb; SOCS=CAI' }
  $r = Invoke-WebRequest -Uri $u -Headers $h -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' -UseBasicParsing -TimeoutSec 10
  return [string]$r.Content
}
function YT-Search([string]$q) {
  $u = 'https://www.youtube.com/results?search_query=' + [Uri]::EscapeDataString($q) + '&sp=EgIQAQ%3D%3D&hl=pl&gl=PL'
  $h = @{ 'Accept-Language' = 'pl-PL,pl;q=0.9,en;q=0.5'; 'Cookie' = 'CONSENT=YES+cb; SOCS=CAI' }
  $r = Invoke-WebRequest -Uri $u -Headers $h -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' -UseBasicParsing -TimeoutSec 10
  return [string]$r.Content
}
function Handle($client) {
  $r = Read-Req $client
  if ($null -eq $r) { return }
  $addr = $client.Client.RemoteEndPoint.Address
  if ($addr.IsIPv4MappedToIPv6) { $addr = $addr.MapToIPv4() }
  $ipStr = $addr.ToString()
  $local = [System.Net.IPAddress]::IsLoopback($addr)
  $now = [DateTime]::UtcNow
  $head = $r.method -eq 'HEAD'
  $p = $r.path
  $J = 'application/json; charset=utf-8'
  if ($p.StartsWith('/api/')) {
    # tytuly utworow z playlisty (strona playlisty) i pojedynczych filmow (oEmbed) - przegladarka nie moze ich pobrac sama
    $authR = ($local -or ($S.token -and $r.q['k'] -eq $S.token))
    if ($p -eq '/api/ytplaylist' -and $authR) {
      $l = [string]$r.q['list']
      if ($l -notmatch '^[\w-]{2,64}$') { Send-Resp $client 400 $J '{"ok":false}' $head; return }
      try { Send-Resp $client 200 'text/html; charset=utf-8' (YT-Get ('https://www.youtube.com/playlist?list=' + $l + '&hl=pl')) $head } catch { Send-Resp $client 502 $J '{"ok":false}' $head }
      return
    }
    if ($p -eq '/api/oembed' -and $authR) {
      $v = [string]$r.q['id']
      if ($v -notmatch '^[\w-]{11}$') { Send-Resp $client 400 $J '{"ok":false}' $head; return }
      try { Send-Resp $client 200 $J (YT-Get ('https://www.youtube.com/oembed?format=json&url=' + [Uri]::EscapeDataString('https://www.youtube.com/watch?v=' + $v))) $head } catch { Send-Resp $client 502 $J '{"ok":false}' $head }
      return
    }
    if (($p -eq '/api/ytsearch' -and $local) -or ($p -eq '/api/r/ytsearch' -and $S.token -and $r.q['k'] -eq $S.token)) {
      $q = [string]$r.q['q']
      if (-not $q) { Send-Resp $client 400 $J '{"ok":false}' $head; return }
      try { Send-Resp $client 200 'text/html; charset=utf-8' (YT-Search $q) $head }
      catch { Send-Resp $client 502 $J ('{"ok":false,"err":' + (Json-Str $_.Exception.Message) + '}') $head }
      return
    }
    if ($p -eq '/api/info' -and $local) {
      $items = foreach ($x in (Get-Ips)) { '{"ip":' + (Json-Str $x.ip) + ',"name":' + (Json-Str $x.name) + ',"kind":' + (Json-Str $x.kind) + ',"gw":' + $(if ($x.gw) { 'true' } else { 'false' }) + ',"vpn":' + $(if ($x.vpn) { 'true' } else { 'false' }) + '}' }
      Send-Resp $client 200 $J ('{"ips":[' + (@($items) -join ',') + '],"port":' + $port + '}') $head; return
    }
    if ($p -eq '/api/sync' -and $local -and $r.method -eq 'POST') {
      $S.token = [string]$r.q['k']; $S.gtoken = [string]$r.q['g']
      $txt = $utf8.GetString($r.body); if ($txt.Trim().StartsWith('{')) { $S.state = $txt }
      $S.lastSync = $now
      $cm = @($S.cmds); $S.cmds.Clear()
      $n = 0; foreach ($v in @($S.seen.Values)) { if (($now - $v).TotalSeconds -lt 6) { $n++ } }
      Send-Resp $client 200 $J ('{"cmds":[' + ($cm -join ',') + '],"clients":' + $n + '}') $head; return
    }
    if ($p -eq '/api/thumb' -and $local -and $r.method -eq 'POST') {
      $tk = [string]$r.q['key']
      if ($tk) {
        # miniatury wg pliku (biezace i kilka nastepnych zdjec) - trzymamy ostatnie 80
        if (-not $S.thumbs.ContainsKey($tk)) { [void]$S.tord.Add($tk) }
        $S.thumbs[$tk] = $r.body
        while ($S.tord.Count -gt 80) { $S.thumbs.Remove($S.tord[0]); $S.tord.RemoveAt(0) }
        Send-Resp $client 200 $J '{"ok":true}' $head; return
      }
      $S.thumb = $r.body; $S.rev++
      Send-Resp $client 200 $J '{"ok":true}' $head; return
    }
    if ($p.StartsWith('/api/g/')) {
      # prosby o piosenki od gosci - osobny kod, tylko wyszukiwanie i wyslanie prosby
      if (-not $S.gtoken -or $r.q['g'] -ne $S.gtoken) { Send-Resp $client 403 $J '{"ok":false}' $head; return }
      if ($p -eq '/api/g/state') {
        $off = if (($now - $S.lastSync).TotalSeconds -gt 10) { 'true' } else { 'false' }
        Send-Resp $client 200 $J ('{"ok":true,"offline":' + $off + '}') $head; return
      }
      if ($p -eq '/api/g/oembed') {
        $v = [string]$r.q['id']
        if ($v -notmatch '^[\w-]{11}$') { Send-Resp $client 400 $J '{"ok":false}' $head; return }
        try { Send-Resp $client 200 $J (YT-Get ('https://www.youtube.com/oembed?format=json&url=' + [Uri]::EscapeDataString('https://www.youtube.com/watch?v=' + $v))) $head } catch { Send-Resp $client 502 $J '{"ok":false}' $head }
        return
      }
      if ($p -eq '/api/g/ytsearch') {
        $q = [string]$r.q['q']
        try { Send-Resp $client 200 'text/html; charset=utf-8' (YT-Search $q) $head } catch { Send-Resp $client 502 $J '{"ok":false}' $head }
        return
      }
      if ($p -eq '/api/g/req' -and $r.method -eq 'POST') {
        if ($S.glast.ContainsKey($ipStr) -and ($now - $S.glast[$ipStr]).TotalSeconds -lt 15) {
          $w = [int](15 - ($now - $S.glast[$ipStr]).TotalSeconds)
          Send-Resp $client 200 $J ('{"ok":false,"wait":' + $w + '}') $head; return
        }
        $S.glast[$ipStr] = $now
        $t = $utf8.GetString($r.body); if ($t.Length -gt 400) { $t = $t.Substring(0, 400) }
        [void]$S.cmds.Add('{"c":"greq","t":' + (Json-Str $t) + ',"m":' + (Json-Str ($ipStr -replace '[^0-9a-f\.:]', '')) + '}')
        while ($S.cmds.Count -gt 30) { $S.cmds.RemoveAt(0) }
        Send-Resp $client 200 $J '{"ok":true}' $head; return
      }
      Send-Resp $client 404 $J '{"ok":false}' $head; return
    }
    if ($p.StartsWith('/api/r/')) {
      if (-not $S.token -or $r.q['k'] -ne $S.token) { Send-Resp $client 403 $J '{"ok":false}' $head; return }
      $S.seen[$ipStr] = $now
      if ($p -eq '/api/r/state') {
        $off = if (($now - $S.lastSync).TotalSeconds -gt 10) { 'true' } else { 'false' }
        Send-Resp $client 200 $J ('{"ok":true,"offline":' + $off + ',"rev":' + $S.rev + ',"state":' + $S.state + '}') $head; return
      }
      if ($p -eq '/api/r/cmd' -and $r.method -eq 'POST') {
        $c = [string]$r.q['c']; $cid = [string]$r.q['id']
        if ($cid) {
          if ($S.ids.Contains($cid)) { Send-Resp $client 200 $J '{"ok":true,"dup":true}' $head; return }
          [void]$S.ids.Add($cid); while ($S.ids.Count -gt 100) { $S.ids.RemoveAt(0) }
        }
        if ($c -cmatch '^[a-z]{2,12}$') {
          $js = '{"c":"' + $c + '"'
          $t = $utf8.GetString($r.body); if ($t.Length -gt 400) { $t = $t.Substring(0, 400) }
          if ($t.Length -gt 0) { $js += ',"t":' + (Json-Str $t) }
          foreach ($n in @('d', 'i')) { $v = 0; if ([int]::TryParse([string]$r.q[$n], [ref]$v)) { $js += ',"' + $n + '":' + $v } }
          $m = [string]$r.q['m']; if ($m -cmatch '^[a-z]{1,10}$') { $js += ',"m":"' + $m + '"' }
          $js += '}'
          [void]$S.cmds.Add($js); while ($S.cmds.Count -gt 30) { $S.cmds.RemoveAt(0) }
        }
        Send-Resp $client 200 $J '{"ok":true}' $head; return
      }
      if ($p -eq '/api/r/thumb' -and $r.q['key']) {
        $tk = [string]$r.q['key']
        $ct = 'image/jpeg'; if ($tk.StartsWith('__')) { $ct = $J }
        if ($S.thumbs.ContainsKey($tk) -and $S.thumbs[$tk].Length -gt 0) { Send-Resp $client 200 $ct $S.thumbs[$tk] $head } else { Send-Resp $client 204 $ct $null $head }
        return
      }
      if ($p -eq '/api/r/thumb') {
        if ($S.thumb.Length -gt 0) { Send-Resp $client 200 'image/jpeg' $S.thumb $head } else { Send-Resp $client 204 'image/jpeg' $null $head }
        return
      }
    }
    Send-Resp $client 404 $J '{"ok":false}' $head; return
  }
  if ($p -eq '/') { if ($local) { $p = '/index.html' } else { $p = '/prosba.html' } }
  if (-not $local -and $p -ne '/pilot.html' -and $p -ne '/prosba.html' -and $p -notmatch '^/lib/fonts(\.css|/[a-z0-9-]+\.woff2)$') { Send-Resp $client 404 'text/plain' '404' $head; return }
  $full = [System.IO.Path]::GetFullPath((Join-Path $root ($p.TrimStart('/').Replace('/', $sep))))
  if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) { Send-Resp $client 404 'text/plain' '404' $head; return }
  $ext = [System.IO.Path]::GetExtension($full).ToLower()
  $type = 'application/octet-stream'; if ($mime.ContainsKey($ext)) { $type = $mime[$ext] }
  Send-Resp $client 200 $type ([System.IO.File]::ReadAllBytes($full)) $head
}

# --- start ---
# YouTube wymaga TLS 1.2 (Windows PowerShell 5.1 domyslnie go nie wlacza)
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
# Wylacz "szybka edycje" konsoli: klikniecie w to okno wstrzymywaloby serwer (telefon tracilby polaczenie)
try {
  Add-Type -Namespace PW -Name Con -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int h);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);
'@
  $hIn = [PW.Con]::GetStdHandle(-10); [uint32]$mode = 0
  if ([PW.Con]::GetConsoleMode($hIn, [ref]$mode)) {
    if ($mode -band 0x40) { $mode = $mode - 0x40 }
    $mode = $mode -bor 0x80
    [void][PW.Con]::SetConsoleMode($hIn, $mode)
  }
} catch { }
$listener = $null
try {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::IPv6Any, $port)
  $listener.Server.DualMode = $true
  $listener.Start()
} catch {
  $listener = $null
  try { $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port); $listener.Start() } catch { $listener = $null }
}
if ($null -eq $listener) {
  Write-Host "Port $port jest zajety - pokaz prawdopodobnie juz dziala. Otwieram przegladarke..."
  try { Start-Process $url } catch { }
  Start-Sleep -Seconds 3
  exit
}

Write-Host ""
Write-Host "  Pokaz weselny dziala:  $url"
foreach ($x in (Get-Ips)) { Write-Host ("  Pilot w telefonie (ta sama siec Wi-Fi):  http://" + $x.ip + ":$port/pilot.html   [" + $x.name + "]") }
Write-Host ""
Write-Host "  Nie zamykaj tego okna w trakcie pokazu (zamkniecie = koniec pokazu)."
Write-Host "  Jesli Windows zapyta o zapore - kliknij Zezwalaj (potrzebne tylko dla pilota w telefonie)."
Write-Host "  Najlepiej dziala w Chrome lub Edge."
Write-Host ""
try { Start-Process $url } catch { }

$pending = New-Object System.Collections.ArrayList
while ($true) {
  try {
    while ($listener.Pending()) { [void]$pending.Add(@{ c = $listener.AcceptTcpClient(); t = [DateTime]::UtcNow }) }
  } catch { }
  $did = $false
  for ($i = $pending.Count - 1; $i -ge 0; $i--) {
    $it = $pending[$i]
    $ready = $false
    try { $ready = $it.c.Available -gt 0 } catch { }
    if ($ready) {
      $pending.RemoveAt($i); $did = $true
      try { Handle $it.c } catch { }
      try { $it.c.Client.Shutdown([System.Net.Sockets.SocketShutdown]::Send) } catch { }
      try { $it.c.Close() } catch { }
    } elseif (([DateTime]::UtcNow - $it.t).TotalSeconds -gt 10) {
      $pending.RemoveAt($i)
      try { $it.c.Close() } catch { }
    }
  }
  if (-not $did) { Start-Sleep -Milliseconds 8 }
}
