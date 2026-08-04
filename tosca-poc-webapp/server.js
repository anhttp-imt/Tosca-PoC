// Static file server for the Tosca PoC Web App (with MongoDB backend).
// Must run on http://localhost:8787 - this exact origin is whitelisted in the
// extension's manifest.json "externally_connectable.matches".
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PORT = 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

  // GET /api/reports — load all reports from MongoDB
  if (urlPath === '/api/reports' && req.method === 'GET') {
    try {
      const reports = await db.loadReports();
      sendJSON(res, 200, reports);
    } catch (e) {
      console.error('[API] GET /api/reports — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // POST /api/reports — save a new report to MongoDB
  if (urlPath === '/api/reports' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      body.id = body.id || `report-${Date.now()}`;
      await db.saveReport(body);
      sendJSON(res, 201, { success: true });
    } catch (e) {
      console.error('[API] POST /api/reports — error:', e.message);
      sendJSON(res, 400, { error: e.message });
    }
    return;
  }

  // DELETE /api/reports — clear all reports
  if (urlPath === '/api/reports' && req.method === 'DELETE') {
    try {
      await db.deleteAllReports();
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] DELETE /api/reports — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // DELETE /api/reports/:id — delete a single report
  if (urlPath.startsWith('/api/reports/') && req.method === 'DELETE') {
    try {
      const reportId = urlPath.split('/').pop();
      await db.deleteReport(reportId);
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] DELETE /api/reports/:id — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // ==================== Objects (Data Elements) ====================

  // GET /api/objects — load all objects from MongoDB
  if (urlPath === '/api/objects' && req.method === 'GET') {
    try {
      const objects = await db.loadObjects();
      sendJSON(res, 200, objects);
    } catch (e) {
      console.error('[API] GET /api/objects — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // POST /api/objects — save all objects to MongoDB
  if (urlPath === '/api/objects' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      await db.saveAllObjects(body.objects || []);
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] POST /api/objects — error:', e.message);
      sendJSON(res, 400, { error: e.message });
    }
    return;
  }

  // DELETE /api/objects — clear all objects
  if (urlPath === '/api/objects' && req.method === 'DELETE') {
    try {
      await db.deleteAllObjects();
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] DELETE /api/objects — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // ==================== Test Cases ====================

  // GET /api/testcases — load all test cases from MongoDB
  if (urlPath === '/api/testcases' && req.method === 'GET') {
    try {
      const testCases = await db.loadTestCases();
      sendJSON(res, 200, testCases);
    } catch (e) {
      console.error('[API] GET /api/testcases — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // POST /api/testcases — save all test cases to MongoDB
  if (urlPath === '/api/testcases' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      await db.saveAllTestCases(body.testCases || []);
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] POST /api/testcases — error:', e.message);
      sendJSON(res, 400, { error: e.message });
    }
    return;
  }

  // DELETE /api/testcases — clear all test cases
  if (urlPath === '/api/testcases' && req.method === 'DELETE') {
    try {
      await db.deleteAllTestCases();
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] DELETE /api/testcases — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // ==================== Test Suites ====================

  // GET /api/testsuites — load all test suites from MongoDB
  if (urlPath === '/api/testsuites' && req.method === 'GET') {
    try {
      const testSuites = await db.loadTestSuites();
      sendJSON(res, 200, testSuites);
    } catch (e) {
      console.error('[API] GET /api/testsuites — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return;
  }

  // POST /api/testsuites — save all test suites to MongoDB
  if (urlPath === '/api/testsuites' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      await db.saveAllTestSuites(body.testSuites || []);
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] POST /api/testsuites — error:', e.message);
      sendJSON(res, 400, { error: e.message });
    }
    return;
  }

  // DELETE /api/testsuites — clear all test suites
  if (urlPath === '/api/testsuites' && req.method === 'DELETE') {
    try {
      await db.deleteAllTestSuites();
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] DELETE /api/testsuites — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
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

// Connect to database (MongoDB or JSON fallback) on startup
db.connect();

server.listen(PORT, () => {
  console.log(`Tosca PoC Web App: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.close();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  await db.close();
  server.close(() => process.exit(0));
});