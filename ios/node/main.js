// Serwer programu Pokazy na iPadzie (Node.js wbudowany w aplikację).
// Ten sam serwer co na Windows: pilot w telefonie, kod QR dla gości, życzenia, galeria, dostęp do plików.
const path = require('path'), fs = require('fs');
const E = process.env;
const data = E.POKAZY_DATA || path.join(__dirname, 'dane');
const docs = E.POKAZY_DOCS || path.join(__dirname, 'dokumenty');
fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(docs, { recursive: true });
const logFile = path.join(data, 'log.txt');
try { if (fs.statSync(logFile).size > 2e6) fs.renameSync(logFile, logFile + '.old'); } catch { }
const log = (...a) => { try { fs.appendFileSync(logFile, new Date().toISOString() + ' ' + a.map(x => typeof x === 'string' ? x : (x && x.stack) || JSON.stringify(x)).join(' ') + '\n'); } catch { } };
process.on('uncaughtException', e => log('błąd', e));
process.on('unhandledRejection', e => log('błąd (obietnica)', e));

const { createServer } = require('./server');
const { createNativeIOS } = require('./native-ios');
const native = createNativeIOS({ cacheDir: path.join(data, 'cache'), docsDir: docs, mapFile: E.POKAZY_MAP || path.join(data, 'sciezki.json'), log });
const port = +E.POKAZY_PORT || 8765;
const server = createServer({ webDir: E.POKAZY_WEB || path.join(__dirname, 'web'), port, native, log, tileDir: path.join(data, 'cache', 'mapa'), token: E.POKAZY_TOKEN || '', tmpDir: path.join(data, 'cache') });
server.listen()
  .then(() => { log('serwer gotowy', port, 'node', process.version); try { fs.writeFileSync(path.join(data, 'serwer.json'), JSON.stringify({ port, t: Date.now() })); } catch { } })
  .catch(e => log('serwer nie wystartował', e));
// serwer działa, dopóki działa aplikacja
setInterval(() => { }, 1 << 30);
