// Routes: /api/testcases
const db = require('../db');

exports.handle = async (req, res, { parseBody, sendJSON }) => {
  const urlPath = req.url.split('?')[0];

  // GET /api/testcases
  if (urlPath === '/api/testcases' && req.method === 'GET') {
    try {
      const testCases = await db.loadTestCases();
      sendJSON(res, 200, testCases);
    } catch (e) {
      console.error('[API] GET /api/testcases — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return true;
  }

  // POST /api/testcases
  if (urlPath === '/api/testcases' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      console.log('[API] POST /api/testcases — received body keys:', Object.keys(body));
      console.log('[API] POST /api/testcases — testCases count:', (body.testCases || []).length);
      if (body.testCases && body.testCases.length > 0) {
        console.log('[API] POST /api/testcases — first TC sample:', JSON.stringify(body.testCases[0]).slice(0, 300));
      }
      await db.saveAllTestCases(body.testCases || []);
      console.log('[API] POST /api/testcases — saved successfully');
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] POST /api/testcases — error:', e.message);
      console.error('[API] POST /api/testcases — stack:', e.stack);
      sendJSON(res, 400, { error: e.message });
    }
    return true;
  }

  // DELETE /api/testcases
  if (urlPath === '/api/testcases' && req.method === 'DELETE') {
    try {
      await db.deleteAllTestCases();
      sendJSON(res, 200, { success: true });
    } catch (e) {
      console.error('[API] DELETE /api/testcases — error:', e.message);
      sendJSON(res, 500, { error: e.message });
    }
    return true;
  }

  return false;
};