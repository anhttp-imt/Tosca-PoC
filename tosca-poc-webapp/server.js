// Zero-dependency static file server for the Tosca PoC Web App.
// Must run on http://localhost:8787 - this exact origin is whitelisted in the
// extension's manifest.json "externally_connectable.matches".
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize reports file if not exists
if (!fs.existsSync(REPORTS_FILE)) {
  fs.writeFileSync(REPORTS_FILE, '[]', 'utf-8');
}

function loadReports() {
  try {
    const data = fs.readFileSync(REPORTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveReports(reports) {
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf-8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // GET /api/reports — load all reports from disk
  if (urlPath === '/api/reports' && req.method === 'GET') {
    const reports = loadReports();
    sendJSON(res, 200, reports);
    return;
  }

  // POST /api/reports — save a new report to disk
  if (urlPath === '/api/reports' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const reports = loadReports();
      reports.unshift(body);
      saveReports(reports);
      sendJSON(res, 201, { success: true });
    } catch (e) {
      console.error('[API] POST /api/reports — error:', e.message);
      sendJSON(res, 400, { error: e.message });
    }
    return;
  }

  // DELETE /api/reports — clear all reports
  if (urlPath === '/api/reports' && req.method === 'DELETE') {
    saveReports([]);
    sendJSON(res, 200, { success: true });
    return;
  }

  // DELETE /api/reports/:id — delete a single report
  if (urlPath.startsWith('/api/reports/') && req.method === 'DELETE') {
    const reportId = urlPath.split('/').pop();
    const reports = loadReports().filter((r) => r.id !== reportId);
    saveReports(reports);
    sendJSON(res, 200, { success: true });
    return;
  }

  // ---- Static File Serving ----
  const safePath = path.normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
    // Disable caching for JS/CSS/HTML during development
    if (['.js', '.css', '.html'].includes(ext)) {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Tosca PoC Web App: http://localhost:${PORT}`);
});
