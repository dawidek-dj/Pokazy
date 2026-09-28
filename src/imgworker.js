// Wątek roboczy: dekodowanie HEIC (libheif) poza głównym wątkiem aplikacji
const { parentPort } = require('worker_threads');
const fs = require('fs');
const decode = require('heic-decode');
parentPort.on('message', async ({ id, path }) => {
  try {
    const img = await decode({ buffer: fs.readFileSync(path) });
    const data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    parentPort.postMessage({ id, width: img.width, height: img.height, data }, [data.buffer]);
  } catch (e) { parentPort.postMessage({ id, error: String(e && e.message || e) }); }
});
