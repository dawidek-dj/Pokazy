#!/usr/bin/env python3
# Pokaz weselny - lokalny serwer: strona pokazu (tylko ten komputer) + pilot w telefonie (siec Wi-Fi).
# Zdjecia i filmy NIE przechodza przez serwer - przegladarka czyta je prosto z folderow.
import json, os, re, socket, sys, threading, time, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs

PORT = int(os.environ.get('POKAZ_PORT', '8765'))
ROOT = os.path.dirname(os.path.abspath(__file__))
MIME = {'.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'}
LOCK = threading.Lock()
ST = {'token': '', 'state': b'{}', 'cmds': [], 'thumb': b'', 'rev': 0, 'last_sync': 0.0, 'seen': {}, 'ids': [], 'thumbs': {}, 'gtoken': '', 'glast': {}}


def lan_ips():
    out, seen = [], set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1)); ip = s.getsockname()[0]; s.close()
        out.append({'ip': ip, 'name': '', 'gw': True}); seen.add(ip)
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in seen and not ip.startswith('127.') and not ip.startswith('169.254.'):
                out.append({'ip': ip, 'name': '', 'gw': False}); seen.add(ip)
    except OSError:
        pass
    return out


def yt_get(u):
    import urllib.request
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                                             'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.5', 'Cookie': 'CONSENT=YES+cb; SOCS=CAI'})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read()


def yt_search(q):
    # strona wyników YouTube pobierana przez serwer (przeglądarka nie może jej pobrać sama)
    import urllib.request, urllib.parse
    u = 'https://www.youtube.com/results?search_query=' + urllib.parse.quote(q) + '&sp=EgIQAQ%3D%3D&hl=pl&gl=PL'
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                                             'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.5', 'Cookie': 'CONSENT=YES+cb; SOCS=CAI'})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read()


class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def client_ip(self):
        ip = self.client_address[0]
        return ip[7:] if ip.startswith('::ffff:') else ip

    def is_local(self):
        ip = self.client_ip()
        return ip == '::1' or ip.startswith('127.')

    def send(self, code, ctype, body=b''):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        if self.command != 'HEAD' and body:
            self.wfile.write(body)
        self.close_connection = True

    def json(self, obj, code=200):
        self.send(code, 'application/json; charset=utf-8', json.dumps(obj).encode())

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n > 0 else b''

    def route(self):
        u = urlsplit(self.path)
        path, q = u.path, {k: v[0] for k, v in parse_qs(u.query).items()}
        local = self.is_local()
        now = time.time()
        if path.startswith('/api/'):
            auth_r = local or (ST['token'] and q.get('k') == ST['token'])
            if path == '/api/ytplaylist' and auth_r:
                l = q.get('list', '')
                if not re.fullmatch(r'[\w-]{2,64}', l):
                    return self.json({'ok': False}, 400)
                try:
                    return self.send(200, 'text/html; charset=utf-8', yt_get('https://www.youtube.com/playlist?list=' + l + '&hl=pl'))
                except Exception:
                    return self.json({'ok': False}, 502)
            if path == '/api/oembed' and auth_r:
                v = q.get('id', '')
                if not re.fullmatch(r'[\w-]{11}', v):
                    return self.json({'ok': False}, 400)
                try:
                    import urllib.parse
                    return self.send(200, 'application/json; charset=utf-8', yt_get('https://www.youtube.com/oembed?format=json&url=' + urllib.parse.quote('https://www.youtube.com/watch?v=' + v)))
                except Exception:
                    return self.json({'ok': False}, 502)
            if path == '/api/ytsearch' and local or path == '/api/r/ytsearch' and ST['token'] and q.get('k') == ST['token']:
                qq = q.get('q', '')
                if not qq:
                    return self.json({'ok': False}, 400)
                try:
                    return self.send(200, 'text/html; charset=utf-8', yt_search(qq))
                except Exception as e:
                    return self.json({'ok': False, 'err': str(e)}, 502)
            if path == '/api/info' and local:
                return self.json({'ips': lan_ips(), 'port': PORT})
            if path == '/api/sync' and local and self.command == 'POST':
                data = self.body()
                with LOCK:
                    ST['token'] = q.get('k', ''); ST['gtoken'] = q.get('g', ''); ST['state'] = data or b'{}'; ST['last_sync'] = now
                    cmds, ST['cmds'] = ST['cmds'], []
                    clients = sum(1 for t in ST['seen'].values() if now - t < 6)
                return self.json({'cmds': cmds, 'clients': clients})
            if path == '/api/thumb' and local and self.command == 'POST':
                data = self.body()
                if q.get('key'):
                    with LOCK:
                        th = ST['thumbs']; th.pop(q['key'], None); th[q['key']] = data
                        while len(th) > 80: th.pop(next(iter(th)))
                    return self.json({'ok': True})
                with LOCK:
                    ST['thumb'] = data; ST['rev'] += 1
                return self.json({'ok': True})
            if path.startswith('/api/g/'):
                # prośby o piosenki od gości — osobny kod, tylko wyszukiwanie i wysłanie prośby
                with LOCK:
                    if not ST['gtoken'] or q.get('g') != ST['gtoken']:
                        return self.json({'ok': False}, 403)
                if path == '/api/g/state':
                    return self.json({'ok': True, 'offline': now - ST['last_sync'] > 10})
                if path == '/api/g/oembed':
                    v = q.get('id', '')
                    if not re.fullmatch(r'[\w-]{11}', v):
                        return self.json({'ok': False}, 400)
                    try:
                        import urllib.parse
                        return self.send(200, 'application/json; charset=utf-8', yt_get('https://www.youtube.com/oembed?format=json&url=' + urllib.parse.quote('https://www.youtube.com/watch?v=' + v)))
                    except Exception:
                        return self.json({'ok': False}, 502)
                if path == '/api/g/ytsearch':
                    try:
                        return self.send(200, 'text/html; charset=utf-8', yt_search(q.get('q', '')))
                    except Exception:
                        return self.json({'ok': False}, 502)
                if path == '/api/g/req' and self.command == 'POST':
                    ip = self.client_ip()
                    with LOCK:
                        last = ST['glast'].get(ip, 0)
                        if now - last < 15:
                            return self.json({'ok': False, 'wait': int(15 - (now - last))})
                        ST['glast'][ip] = now
                        ST['cmds'] = (ST['cmds'] + [{'c': 'greq', 't': self.body().decode('utf-8', 'replace')[:400], 'm': re.sub(r'[^0-9a-f.:]', '', ip)}])[-30:]
                    return self.json({'ok': True})
                return self.json({'ok': False}, 404)
            if path.startswith('/api/r/'):
                with LOCK:
                    if not ST['token'] or q.get('k') != ST['token']:
                        return self.json({'ok': False}, 403)
                    ST['seen'][self.client_ip()] = now
                if path == '/api/r/state':
                    with LOCK:
                        body = b'{"ok":true,"offline":%s,"rev":%d,"state":%s}' % (b'true' if now - ST['last_sync'] > 10 else b'false', ST['rev'], ST['state'])
                    return self.send(200, 'application/json; charset=utf-8', body)
                if path == '/api/r/cmd' and self.command == 'POST':
                    c = q.get('c', ''); cid = q.get('id', '')
                    with LOCK:
                        dup = bool(cid) and cid in ST['ids']
                        if cid and not dup:
                            ST['ids'] = (ST['ids'] + [cid])[-100:]
                    if dup:
                        return self.json({'ok': True, 'dup': True})
                    if re.fullmatch(r'[a-z]{2,12}', c):
                        cmd = {'c': c}
                        body = self.body().decode('utf-8', 'replace')[:400]
                        if body: cmd['t'] = body
                        for n in ('d', 'i'):
                            if q.get(n, '').isdigit(): cmd[n] = int(q[n])
                        if re.fullmatch(r'[a-z]{1,10}', q.get('m', '')): cmd['m'] = q['m']
                        with LOCK:
                            ST['cmds'] = (ST['cmds'] + [cmd])[-30:]
                    return self.json({'ok': True})
                if path == '/api/r/thumb' and q.get('key'):
                    with LOCK:
                        t = ST['thumbs'].get(q['key'], b'')
                    ct = 'application/json; charset=utf-8' if q['key'].startswith('__') else 'image/jpeg'
                    return self.send(200, ct, t) if t else self.send(204, ct)
                if path == '/api/r/thumb':
                    with LOCK:
                        t = ST['thumb']
                    return self.send(200, 'image/jpeg', t) if t else self.send(204, 'image/jpeg')
            return self.json({'ok': False}, 404)
        # pliki
        if path == '/':
            path = '/index.html' if local else '/prosba.html'
        if not local and path not in ('/pilot.html', '/prosba.html') and not re.fullmatch(r'/lib/fonts(\.css|/[a-z0-9-]+\.woff2)', path):
            return self.send(404, 'text/plain', b'404')
        full = os.path.realpath(os.path.join(ROOT, path.lstrip('/')))
        if not full.startswith(ROOT + os.sep) or not os.path.isfile(full):
            return self.send(404, 'text/plain', b'404')
        with open(full, 'rb') as f:
            data = f.read()
        self.send(200, MIME.get(os.path.splitext(full)[1].lower(), 'application/octet-stream'), data)

    def do_GET(self):
        self.route()

    def do_HEAD(self):
        self.route()

    def do_POST(self):
        self.route()


class DualStack(ThreadingHTTPServer):
    daemon_threads = True
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def main():
    url = f'http://localhost:{PORT}/'
    try:
        srv = DualStack(('::', PORT), H)
    except OSError:
        try:
            srv = ThreadingHTTPServer(('0.0.0.0', PORT), H)
        except OSError:
            print(f'Port {PORT} jest zajety - pokaz prawdopodobnie juz dziala. Otwieram przegladarke...')
            webbrowser.open(url)
            return
    print(f'\n  Pokaz weselny dziala:  {url}')
    for x in lan_ips():
        print(f'  Pilot w telefonie (ta sama siec Wi-Fi): http://{x["ip"]}:{PORT}/pilot.html')
    print('  Nie zamykaj tego okna w trakcie pokazu.\n')
    if '--no-browser' not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
