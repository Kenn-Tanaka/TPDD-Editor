import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, 'dist');

const runtimeConfigPath = path.join(distDir, 'tpdd-config.json');
if (!fs.existsSync(runtimeConfigPath)) {
  throw new Error('dist/tpdd-config.json がありません。配布パッケージを修復してください。');
}
const runtimeConfig = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
if (!Number.isInteger(runtimeConfig.editorPort) || runtimeConfig.editorPort < 1 || runtimeConfig.editorPort > 65535) {
  throw new Error('tpdd-config.json の editorPort は1〜65535の整数である必要があります。');
}
const PORT = runtimeConfig.editorPort;
const HOST = '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

if (!fs.existsSync(distDir)) {
  console.error('\n[エラー] 静的ファイルディレクトリ (dist/) が見つかりません。\n');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const parsedUrl = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  let safePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(distDir, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[起動エラー] ポート ${PORT} は既に使用されています。`);
    console.error('思考展開図エディタは 127.0.0.1:3000 に固定バインドします。');
    console.error(`ポート ${PORT} を使用しているプロセスを終了してから再起動してください。\n`);
    process.exit(1);
  } else {
    console.error('\n[サーバー予期せぬエラー]', err);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log('  思考展開図エディタ (TPDD Editor) サーバー起動中');
  console.log(`  URL: http://${HOST}:${PORT}`);
  console.log('  ※ ブラウザで上記URLを開いてご利用ください。');
  console.log('  ※ 終了する場合は Ctrl+C を押してください。');
  console.log('====================================================\n');
});
