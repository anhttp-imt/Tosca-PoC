(function () {
  const state = {
    objects: [],
    testCases: [],
    testSuites: [],
    reports: [],
    activeTestCaseId: null,
    activeSuiteId: null,
    scanning: false, // unused here, kept for parity with step summary helpers
    recording: false,
    running: false,
    suiteRun: null, // { suiteRunId, testCaseIds, statuses: { [testCaseId]: 'pending'|'running'|'pass'|'fail' } }
  };

  const els = {};
  let port = null;
  let connected = false;

  function $(id) { return document.getElementById(id); }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getTestCase(id) { return state.testCases.find((t) => t.id === id) || null; }
  function getObject(id) { return state.objects.find((o) => o.id === id) || null; }
  function getSuite(id) { return state.testSuites.find((s) => s.id === id) || null; }

  function getTargetTabId() {
    const v = els.targetTabSelect.value;
    return v ? parseInt(v, 10) : null;
  }

  // ---------------- Connection ----------------

  function setConnectStatus(ok, text) {
    els.connectStatus.textContent = text;
    els.connectStatus.className = `status-chip status-${ok ? 'pass' : 'fail'}`;
  }

  function sendToExtension(type, payload) {
    if (!port) return;
    try {
      port.postMessage({ type, ...(payload || {}) });
    } catch (e) {
      // port likely dead; onDisconnect will handle state cleanup
    }
  }

  function connectToExtension(extId) {
    if (port) {
      try { port.disconnect(); } catch (e) { /* ignore */ }
      port = null;
    }
    if (!window.chrome || !chrome.runtime || !chrome.runtime.connect) {
      setConnectStatus(false, 'Trình duyệt không hỗ trợ chrome.runtime.connect');
      return;
    }
    try {
      port = chrome.runtime.connect(extId, { name: 'tosca-poc-webapp' });
    } catch (e) {
      setConnectStatus(false, `Lỗi kết nối: ${e.message}`);
      return;
    }
    port.onMessage.addListener(handlePortMessage);
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      connected = false;
      setConnectStatus(false, err ? `Lỗi: ${err.message}` : 'Mất kết nối');
      port = null;
    });
    connected = true;
    setConnectStatus(true, 'Đã kết nối');
    localStorage.setItem('tosca_ext_id', extId);
    sendToExtension('WA_LIST_TABS');
    sendToExtension('WA_GET_ALL_DATA');
  }

  function handlePortMessage(message) {
    if (!message || typeof message.type !== 'string') return;
    switch (message.type) {
      case 'WA_TABS_LIST':
        renderTabOptions(message.tabs || []);
        break;
      case 'WA_ALL_DATA':
        state.objects = message.objects || [];
        state.testCases = message.testCases || [];
        state.testSuites = message.testSuites || [];
        state.reports = message.reports || [];
        renderStepObjectOptions();
        renderTestCaseSelectors();
        renderSteps();
        renderSuiteSelectors();
        renderSuiteItems();
        renderRunSteps();
        renderReports();
        break;
      case 'WA_EVT_OBJECT_ADDED':
        if (!state.objects.some((o) => o.id === message.entry.id)) state.objects.push(message.entry);
        renderStepObjectOptions();
        renderSteps();
        break;
      case 'WA_EVT_STEP_ADDED': {
        let tc = getTestCase(state.activeTestCaseId);
        if (!tc) {
          tc = { id: uid('tc'), name: `Recorded ${new Date().toLocaleTimeString('vi-VN')}`, steps: [], createdAt: Date.now() };
          state.testCases.push(tc);
          state.activeTestCaseId = tc.id;
          renderTestCaseSelectors();
        }
        tc.steps.push(message.step);
        renderSteps();
        persistActiveTestCase();
        break;
      }
      case 'WA_EVT_RUN_STARTED':
        state.running = true;
        setRunButtonsState(true);
        renderRunSteps();
        break;
      case 'WA_EVT_STEP_RUNNING':
        updateRunStepStatus(message.stepId, 'running', '');
        break;
      case 'WA_EVT_STEP_RESULT':
        updateRunStepStatus(message.stepId, message.status, message.message);
        break;
      case 'WA_EVT_RUN_FINISHED':
        state.running = false;
        setRunButtonsState(false);
        state.reports.unshift(message.report);
        renderReports();
        break;
      case 'WA_EVT_SUITE_STARTED': {
        state.running = true;
        setRunButtonsState(true);
        (message.testCaseIds || []).forEach((id) => { statuses[id] = 'pending'; });
        state.suiteRun = { suiteRunId: message.suiteRunId, testCaseIds: message.testCaseIds || [], statuses };
        renderSuiteProgressList();
        break;
      }
      case 'WA_EVT_SUITE_TESTCASE_STARTED': {
        if (state.suiteRun) state.suiteRun.statuses[message.testCaseId] = 'running';
        renderSuiteProgressList();
        renderRunSteps(message.testCaseId);
        break;
      }
      case 'WA_EVT_SUITE_TESTCASE_FINISHED': {
        if (state.suiteRun) state.suiteRun.statuses[message.testCaseId] = message.status;
        renderSuiteProgressList();
        break;
      }
      case 'WA_EVT_SUITE_FINISHED':
        state.running = false;
        setRunButtonsState(false);
        // Trạng thái từng test case đã được cập nhật qua WA_EVT_SUITE_TESTCASE_FINISHED;
        // chi tiết report của từng test case xem ở tab Report (nhóm theo suite).
        break;
      case 'WA_EVT_DATA_CHANGED':
        // Extension báo data đã thay đổi (từ side panel hoặc web app khác) — tự động re-fetch
        sendToExtension('WA_GET_ALL_DATA');
        break;
      default:
        break;
    }
  }

  function renderTabOptions(tabs) {
    const prevValue = els.targetTabSelect.value;
    els.targetTabSelect.innerHTML = '';
    if (tabs.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '(không có tab nào)';
      opt.value = '';
      els.targetTabSelect.appendChild(opt);
      return;
    }
    tabs.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = String(t.id);
      opt.textContent = `${t.title || t.url} — ${t.url}`.slice(0, 90);
      els.targetTabSelect.appendChild(opt);
    });
    if (tabs.some((t) => String(t.id) === prevValue)) els.targetTabSelect.value = prevValue;
  }

  // ---------------- Tabs (UI) ----------------

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        $(`tab-${btn.dataset.tab}`).classList.add('active');
      });
    });
  }

  // ---------------- Test Builder ----------------

  function renderTestCaseSelectors() {
    [els.testcaseSelect, els.runTestcaseSelect].forEach((sel) => {
      const prevValue = sel.value;
      sel.innerHTML = '';
      if (state.testCases.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = '(No Test Case)';
        opt.value = '';
        sel.appendChild(opt);
      } else {
        state.testCases.forEach((tc) => {
          const opt = document.createElement('option');
          opt.value = tc.id;
          opt.textContent = `${tc.name} (${tc.steps.length} step)`;
          sel.appendChild(opt);
        });
      }
      if (prevValue && state.testCases.some((t) => t.id === prevValue)) sel.value = prevValue;
    });

    if (!state.activeTestCaseId || !getTestCase(state.activeTestCaseId)) {
      state.activeTestCaseId = state.testCases[0]?.id || null;
    }
    if (state.activeTestCaseId) els.testcaseSelect.value = state.activeTestCaseId;

    const hasActive = !!state.activeTestCaseId;
    els.btnRecordToggle.disabled = !hasActive;
    els.btnDeleteTestcase.disabled = !hasActive;
  }

  function renderStepObjectOptions() {
    els.stepObjectSelect.innerHTML = '';
    if (state.objects.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '(chưa có object - hãy Scan trong extension trước)';
      opt.value = '';
      els.stepObjectSelect.appendChild(opt);
      return;
    }
    state.objects.forEach((obj) => {
      const opt = document.createElement('option');
      opt.value = obj.id;
      opt.textContent = obj.name;
      els.stepObjectSelect.appendChild(opt);
    });
  }

  function actionLabel(action) {
    return { click: 'Click', input: 'Input', select: 'Select', verify: 'Verify Text', wait: 'Wait', sendkey: 'Send Key' }[action] || action;
  }

  function stepSummary(step) {
    const obj = getObject(step.objectId);
    const objName = obj ? obj.name : step.action === 'wait' || step.action === 'sendkey' ? '(no target)' : '(object đã bị xóa)';
    if (step.action === 'wait') return `Wait ${step.waitMs || step.value || 500}ms`;
    if (step.action === 'sendkey') return `Send Key "${step.value ?? ''}"`;
    if (step.action === 'verify') return `Verify "${objName}" == "${step.expectedValue ?? step.value ?? ''}"`;
    if (step.action === 'input' || step.action === 'select') return `${actionLabel(step.action)} "${objName}" = "${step.value ?? ''}"`;
    return `${actionLabel(step.action)} "${objName}"`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderSteps() {
    const tc = getTestCase(state.activeTestCaseId);
    els.stepList.innerHTML = '';
    const steps = tc ? tc.steps : [];
    els.stepEmpty.classList.toggle('visible', steps.length === 0);

    steps.forEach((step, idx) => {
      const li = document.createElement('li');
      li.className = 'item-card';
      li.draggable = true;
      li.dataset.stepIndex = idx;
      li.innerHTML = `
        <div class="item-card-row">
          <span class="drag-handle" title="Kéo để thay đổi vị trí">☰</span>
          <span class="item-title">${idx + 1}. ${escapeHtml(stepSummary(step))}</span>
          <span class="item-actions">
            <button data-action="up" title="Lên">↑</button>
            <button data-action="down" title="Xuống">↓</button>
            <button data-action="edit" title="Chỉnh sửa">✏️</button>
            <button data-action="delete" title="Xóa">🗑</button>
          </span>
        </div>
      `;
      li.querySelector('[data-action="up"]').addEventListener('click', () => moveStep(idx, -1));
      li.querySelector('[data-action="down"]').addEventListener('click', () => moveStep(idx, 1));
      li.querySelector('[data-action="edit"]').addEventListener('click', () => openStepEditModal(idx));
      li.querySelector('[data-action="delete"]').addEventListener('click', () => deleteStep(idx));

      // Drag and drop events
      li.addEventListener('dragstart', handleDragStart);
      li.addEventListener('dragend', handleDragEnd);
      li.addEventListener('dragover', handleDragOver);
      li.addEventListener('dragleave', handleDragLeave);
      li.addEventListener('drop', handleDrop);

      els.stepList.appendChild(li);
    });
  }

  function persistActiveTestCase() {
    const tc = getTestCase(state.activeTestCaseId);
    if (!tc) return;
    sendToExtension('WA_SAVE_TEST_CASE', { testCase: tc });
    renderTestCaseSelectors();
  }

  function moveStep(idx, dir) {
    const tc = getTestCase(state.activeTestCaseId);
    if (!tc) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= tc.steps.length) return;
    const [item] = tc.steps.splice(idx, 1);
    tc.steps.splice(newIdx, 0, item);
    renderSteps();
    persistActiveTestCase();
  }

  function deleteStep(idx) {
    const tc = getTestCase(state.activeTestCaseId);
    if (!tc) return;
    tc.steps.splice(idx, 1);
    renderSteps();
    persistActiveTestCase();
  }

  // ---------------- Drag and Drop ----------------

  let dragSrcIndex = null;

  function handleDragStart(e) {
    dragSrcIndex = parseInt(this.dataset.stepIndex, 10);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIndex);
  }

  function handleDragEnd(e) {
    this.classList.remove('dragging');
    // Clear all drag-over indicators
    els.stepList.querySelectorAll('.item-card').forEach((card) => {
      card.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    dragSrcIndex = null;
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Remove previous indicators from all cards
    els.stepList.querySelectorAll('.item-card').forEach((card) => {
      card.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      this.classList.add('drag-over-top');
    } else {
      this.classList.add('drag-over-bottom');
    }
  }

  function handleDragLeave(e) {
    this.classList.remove('drag-over-top', 'drag-over-bottom');
  }

  function handleDrop(e) {
    e.preventDefault();
    const destIndex = parseInt(this.dataset.stepIndex, 10);
    if (dragSrcIndex === null || dragSrcIndex === destIndex) return;

    const tc = getTestCase(state.activeTestCaseId);
    if (!tc) return;

    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    // If dropping below the card, insert after; otherwise insert before
    const insertIndex = e.clientY < midY ? destIndex : destIndex + 1;

    const [item] = tc.steps.splice(dragSrcIndex, 1);
    // Adjust index if source was before destination
    const adjustedInsertIndex = dragSrcIndex < insertIndex ? insertIndex - 1 : insertIndex;
    tc.steps.splice(adjustedInsertIndex, 0, item);

    renderSteps();
    persistActiveTestCase();
  }

  // ---------------- Step Edit Modal ----------------

  let editingStepIndex = null;

  function openStepEditModal(idx) {
    const tc = getTestCase(state.activeTestCaseId);
    if (!tc) return;
    const step = tc.steps[idx];
    editingStepIndex = idx;

    // Populate object select
    els.editStepObjectSelect.innerHTML = '';
    if (state.objects.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '(No Object)';
      opt.value = '';
      els.editStepObjectSelect.appendChild(opt);
    } else {
      state.objects.forEach((obj) => {
        const opt = document.createElement('option');
        opt.value = obj.id;
        opt.textContent = obj.name;
        if (obj.id === step.objectId) opt.selected = true;
        els.editStepObjectSelect.appendChild(opt);
      });
    }

    // Set action
    els.editStepActionSelect.value = step.action;

    // Set value based on action
    let value = '';
    if (step.action === 'input' || step.action === 'select') value = step.value ?? '';
    else if (step.action === 'verify') value = step.expectedValue ?? '';
    else if (step.action === 'wait') value = String(step.waitMs ?? 500);
    els.editStepValueInput.value = value;

    els.stepEditOverlay.classList.add('active');
  }

  function closeStepEditModal() {
    els.stepEditOverlay.classList.remove('active');
    editingStepIndex = null;
  }

  function saveStepEdit() {
    const tc = getTestCase(state.activeTestCaseId);
    if (!tc || editingStepIndex === null) return;

    const step = tc.steps[editingStepIndex];
    const action = els.editStepActionSelect.value;
    const objectId = els.editStepObjectSelect.value || null;
    const rawValue = els.editStepValueInput.value;

    step.action = action;
    step.objectId = objectId;
    delete step.value;
    delete step.expectedValue;
    delete step.waitMs;

    if (action === 'input' || action === 'select') step.value = rawValue;
    if (action === 'verify') step.expectedValue = rawValue;
    if (action === 'wait') step.waitMs = parseInt(rawValue, 10) || 500;
    if (action === 'sendkey') step.value = rawValue;

    closeStepEditModal();
    renderSteps();
    persistActiveTestCase();
  }

  function setRecording(on) {
    state.recording = on;
    els.btnRecordToggle.textContent = on ? 'Dừng Record' : 'Bắt đầu Record';
    els.btnRecordToggle.classList.toggle('active', on);
  }

  function setRunButtonsState(isRunning) {
    els.btnRunTestcase.disabled = isRunning;
    els.btnCancelRun.disabled = !isRunning;
  }

  // ---------------- Suite Builder ----------------

  function renderSuiteSelectors() {
    [els.suiteSelect, els.runSuiteSelect].forEach((sel) => {
      const prevValue = sel.value;
      sel.innerHTML = '';
      if (state.testSuites.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = '(No Suite)';
        opt.value = '';
        sel.appendChild(opt);
      } else {
        state.testSuites.forEach((s) => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.name} (${s.testCaseIds.length} test case)`;
          sel.appendChild(opt);
        });
      }
      if (prevValue && state.testSuites.some((s) => s.id === prevValue)) sel.value = prevValue;
    });

    if (!state.activeSuiteId || !getSuite(state.activeSuiteId)) {
      state.activeSuiteId = state.testSuites[0]?.id || null;
    }
    if (state.activeSuiteId) els.suiteSelect.value = state.activeSuiteId;
    els.btnDeleteSuite.disabled = !state.activeSuiteId;

    // Object select dùng để "+ Thêm vào Suite" - liệt kê test case, không phải object.
    els.suiteAddTestcaseSelect.innerHTML = '';
    if (state.testCases.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '(No Test Case in Test Builder)';
      opt.value = '';
      els.suiteAddTestcaseSelect.appendChild(opt);
    } else {
      state.testCases.forEach((tc) => {
        const opt = document.createElement('option');
        opt.value = tc.id;
        opt.textContent = tc.name;
        els.suiteAddTestcaseSelect.appendChild(opt);
      });
    }
  }

  function renderSuiteItems() {
    const suite = getSuite(state.activeSuiteId);
    els.suiteItemList.innerHTML = '';
    const ids = suite ? suite.testCaseIds : [];
    els.suiteEmpty.classList.toggle('visible', ids.length === 0);

    ids.forEach((tcId, idx) => {
      const tc = getTestCase(tcId);
      const li = document.createElement('li');
      li.className = 'item-card';
      const label = tc ? `${tc.name} (${tc.steps.length} step)` : '(test case đã bị xóa)';
      li.innerHTML = `
        <div class="item-card-row">
          <span class="item-title">${idx + 1}. ${escapeHtml(label)}</span>
          <span class="item-actions">
            <button data-action="up" title="Lên">↑</button>
            <button data-action="down" title="Xuống">↓</button>
            <button data-action="delete" title="Xóa khỏi suite">🗑</button>
          </span>
        </div>
      `;
      li.querySelector('[data-action="up"]').addEventListener('click', () => moveSuiteItem(idx, -1));
      li.querySelector('[data-action="down"]').addEventListener('click', () => moveSuiteItem(idx, 1));
      li.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSuiteItem(idx));
      els.suiteItemList.appendChild(li);
    });
  }

  function persistActiveSuite() {
    const suite = getSuite(state.activeSuiteId);
    if (!suite) return;
    sendToExtension('WA_SAVE_TEST_SUITE', { suite });
    renderSuiteSelectors();
  }

  function moveSuiteItem(idx, dir) {
    const suite = getSuite(state.activeSuiteId);
    if (!suite) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= suite.testCaseIds.length) return;
    const [item] = suite.testCaseIds.splice(idx, 1);
    suite.testCaseIds.splice(newIdx, 0, item);
    renderSuiteItems();
    persistActiveSuite();
  }

  function deleteSuiteItem(idx) {
    const suite = getSuite(state.activeSuiteId);
    if (!suite) return;
    suite.testCaseIds.splice(idx, 1);
    renderSuiteItems();
    persistActiveSuite();
  }

  function renderSuiteProgressList() {
    els.suiteProgressList.innerHTML = '';
    if (!state.suiteRun) return;
    state.suiteRun.testCaseIds.forEach((tcId, idx) => {
      const tc = getTestCase(tcId);
      const status = state.suiteRun.statuses[tcId] || 'pending';
      const li = document.createElement('li');
      li.className = 'item-card';
      li.dataset.suiteTestcaseId = tcId;
      li.innerHTML = `
        <div class="item-card-row">
          <span class="item-title">${idx + 1}. ${escapeHtml(tc ? tc.name : '(test case đã bị xóa)')}</span>
          <span class="status-chip status-${status}">${status}</span>
        </div>
      `;
      els.suiteProgressList.appendChild(li);
    });
  }

  // ---------------- Run ----------------

  function renderRunSteps(explicitTcId) {
    const tc = getTestCase(explicitTcId || els.runTestcaseSelect.value);
    els.runStepList.innerHTML = '';
    const steps = tc ? tc.steps : [];
    els.runEmpty.classList.toggle('visible', steps.length === 0);

    steps.forEach((step, idx) => {
      const li = document.createElement('li');
      li.className = 'item-card';
      li.dataset.stepId = step.id;
      li.innerHTML = `
        <div class="item-card-row">
          <span class="item-title">${idx + 1}. ${escapeHtml(stepSummary(step))}</span>
          <span class="status-chip status-pending">pending</span>
        </div>
        <span class="item-sub run-msg"></span>
      `;
      els.runStepList.appendChild(li);
    });
  }

  function updateRunStepStatus(stepId, status, message) {
    const li = els.runStepList.querySelector(`[data-step-id="${CSS.escape(stepId)}"]`);
    if (!li) return;
    const chip = li.querySelector('.status-chip');
    chip.className = `status-chip status-${status}`;
    chip.textContent = status;
    li.querySelector('.run-msg').textContent = message || '';
  }

  // ---------------- Report ----------------

  function fmtTime(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('vi-VN');
  }

  function buildReportCard(report) {
    const card = document.createElement('div');
    card.className = 'report-card';
    const duration = report.finishedAt ? report.finishedAt - report.startedAt : 0;
    card.innerHTML = `
      <div class="report-card-header">
        <span class="item-title"></span>
        <span class="status-chip status-${report.overallStatus}"></span>
      </div>
      <div class="report-card-body"></div>
    `;
    card.querySelector('.item-title').textContent = `${report.testCaseName} — ${fmtTime(report.startedAt)} (${duration}ms)`;
    card.querySelector('.status-chip').textContent = report.overallStatus;

    const body = card.querySelector('.report-card-body');
    (report.steps || []).forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'report-step-row';
      row.innerHTML = `
        ${s.screenshotDataUrl ? `<img src="${s.screenshotDataUrl}" alt="screenshot" />` : ''}
        <div class="report-step-info">
          <div><span class="status-chip status-${s.status}">${s.status}</span> step ${idx + 1} (${s.durationMs}ms)</div>
          <div class="report-step-msg"></div>
        </div>
      `;
      row.querySelector('.report-step-msg').textContent = s.message || '';
      const img = row.querySelector('img');
      if (img) img.addEventListener('click', () => window.open(s.screenshotDataUrl, '_blank'));
      body.appendChild(row);
    });

    card.querySelector('.report-card-header').addEventListener('click', () => body.classList.toggle('open'));
    return card;
  }

  function buildSuiteReportGroup(suiteRunId, suiteName, reports) {
    const group = document.createElement('div');
    group.className = 'report-card suite-report-group';
    const overallStatus = reports.some((r) => r.overallStatus === 'fail') ? 'fail' : 'pass';
    const first = reports[0];
    group.innerHTML = `
      <div class="report-card-header">
        <span class="item-title"></span>
        <span class="status-chip status-${overallStatus}"></span>
      </div>
      <div class="report-card-body"></div>
    `;
    group.querySelector('.item-title').textContent = `🗂 Suite: ${suiteName} — ${fmtTime(first.startedAt)} (${reports.length} test case)`;
    group.querySelector('.status-chip').textContent = overallStatus;

    const body = group.querySelector('.report-card-body');
    reports.forEach((r) => body.appendChild(buildReportCard(r)));

    group.querySelector('.report-card-header').addEventListener('click', () => body.classList.toggle('open'));
    return group;
  }

  function renderReports() {
    els.reportList.innerHTML = '';
    els.reportEmpty.classList.toggle('visible', state.reports.length === 0);

    const renderedSuiteRuns = new Set();
    state.reports.forEach((report) => {
      if (report.suiteRunId) {
        if (renderedSuiteRuns.has(report.suiteRunId)) return;
        renderedSuiteRuns.add(report.suiteRunId);
        const groupReports = state.reports
          .filter((r) => r.suiteRunId === report.suiteRunId)
          .sort((a, b) => (a.suiteIndex ?? 0) - (b.suiteIndex ?? 0));
        els.reportList.appendChild(buildSuiteReportGroup(report.suiteRunId, report.suiteName, groupReports));
        return;
      }
      els.reportList.appendChild(buildReportCard(report));
    });
  }

  // ---------------- Events ----------------

  function wireEvents() {
    els.btnConnect.addEventListener('click', () => {
      const extId = els.extIdInput.value.trim();
      if (!extId) { alert('Hãy dán Extension ID trước.'); return; }
      connectToExtension(extId);
    });

    els.btnRefreshTabs.addEventListener('click', () => {
      if (!connected) { alert('Hãy Connect trước.'); return; }
      sendToExtension('WA_LIST_TABS');
    });

    els.btnNewTestcase.addEventListener('click', () => {
      const name = prompt('Tên test case mới:', `Test case ${state.testCases.length + 1}`);
      if (!name) return;
      const tc = { id: uid('tc'), name, steps: [], createdAt: Date.now() };
      state.testCases.push(tc);
      state.activeTestCaseId = tc.id;
      sendToExtension('WA_SAVE_TEST_CASE', { testCase: tc });
      renderTestCaseSelectors();
      renderSteps();
    });

    els.testcaseSelect.addEventListener('change', () => {
      state.activeTestCaseId = els.testcaseSelect.value || null;
      renderTestCaseSelectors();
      renderSteps();
    });

    els.btnDeleteTestcase.addEventListener('click', () => {
      const tc = getTestCase(state.activeTestCaseId);
      if (!tc || !confirm(`Xóa test case "${tc.name}"?`)) return;
      sendToExtension('WA_DELETE_TEST_CASE', { testCaseId: tc.id });
      state.testCases = state.testCases.filter((t) => t.id !== tc.id);
      state.activeTestCaseId = null;
      renderTestCaseSelectors();
      renderSteps();
    });

    els.btnRecordToggle.addEventListener('click', () => {
      if (!connected) { alert('Hãy Connect tới extension trước.'); return; }
      const tabId = getTargetTabId();
      if (!tabId) { alert('Hãy chọn Target Tab trước.'); return; }
      if (!state.activeTestCaseId) return;
      setRecording(!state.recording);
      sendToExtension(state.recording ? 'WA_START_RECORD' : 'WA_STOP_RECORD', { tabId });
    });

    els.btnAddStep.addEventListener('click', () => {
      const tc = getTestCase(state.activeTestCaseId);
      if (!tc) { alert('Hãy chọn hoặc tạo test case trước.'); return; }
      const action = els.stepActionSelect.value;
      const objectId = els.stepObjectSelect.value || null;
      const rawValue = els.stepValueInput.value;
      if (action !== 'wait' && action !== 'sendkey' && !objectId) { alert('Hãy scan object trong extension trước khi thêm step.'); return; }

      const step = { id: uid('step'), action, objectId };
      if (action === 'input' || action === 'select') step.value = rawValue;
      if (action === 'verify') step.expectedValue = rawValue;
      if (action === 'wait') step.waitMs = parseInt(rawValue, 10) || 500;
      if (action === 'sendkey') step.value = rawValue;

      tc.steps.push(step);
      els.stepValueInput.value = '';
      renderSteps();
      persistActiveTestCase();
    });

    els.runTestcaseSelect.addEventListener('change', () => renderRunSteps());

    els.runModeSelect.addEventListener('change', () => {
      const isSuite = els.runModeSelect.value === 'suite';
      els.runModeTestcaseDiv.style.display = isSuite ? 'none' : '';
      els.runModeSuiteDiv.style.display = isSuite ? '' : 'none';
    });

    els.btnNewSuite.addEventListener('click', () => {
      const name = prompt('Tên suite mới:', `Suite ${state.testSuites.length + 1}`);
      if (!name) return;
      const suite = { id: uid('suite'), name, testCaseIds: [], createdAt: Date.now() };
      state.testSuites.push(suite);
      state.activeSuiteId = suite.id;
      sendToExtension('WA_SAVE_TEST_SUITE', { suite });
      renderSuiteSelectors();
      renderSuiteItems();
    });

    els.suiteSelect.addEventListener('change', () => {
      state.activeSuiteId = els.suiteSelect.value || null;
      renderSuiteSelectors();
      renderSuiteItems();
    });

    els.btnDeleteSuite.addEventListener('click', () => {
      const suite = getSuite(state.activeSuiteId);
      if (!suite || !confirm(`Xóa suite "${suite.name}"?`)) return;
      sendToExtension('WA_DELETE_TEST_SUITE', { suiteId: suite.id });
      state.testSuites = state.testSuites.filter((s) => s.id !== suite.id);
      state.activeSuiteId = null;
      renderSuiteSelectors();
      renderSuiteItems();
    });

    els.btnSuiteAddTestcase.addEventListener('click', () => {
      const suite = getSuite(state.activeSuiteId);
      if (!suite) { alert('Hãy chọn hoặc tạo suite trước.'); return; }
      const tcId = els.suiteAddTestcaseSelect.value;
      if (!tcId) { alert('Hãy tạo test case ở Test Builder trước.'); return; }
      suite.testCaseIds.push(tcId);
      renderSuiteItems();
      persistActiveSuite();
    });

    els.btnRunTestcase.addEventListener('click', () => {
      if (!connected) { alert('Hãy Connect tới extension trước.'); return; }
      const tabId = getTargetTabId();
      if (!tabId) { alert('Hãy chọn Target Tab trước.'); return; }

      if (els.runModeSelect.value === 'suite') {
        const suite = getSuite(els.runSuiteSelect.value);
        if (!suite || suite.testCaseIds.length === 0) { alert('Suite rỗng hoặc chưa chọn.'); return; }
        els.suiteProgressList.innerHTML = '';
        els.runStepList.innerHTML = '';
        sendToExtension('WA_RUN_TEST_SUITE', { tabId, suite });
        return;
      }

      const tc = getTestCase(els.runTestcaseSelect.value);
      if (!tc || tc.steps.length === 0) { alert('Test case rỗng hoặc chưa chọn.'); return; }
      state.suiteRun = null;
      els.suiteProgressList.innerHTML = '';
      renderRunSteps();
      sendToExtension('WA_RUN_TEST_CASE', { tabId, testCase: tc });
    });

    els.btnClearReports.addEventListener('click', () => {
      if (!confirm(
        '🗑 Xóa lịch sử report\n\n' +
        'Hành động này sẽ xóa toàn bộ kết quả test đã lưu (báo cáo PASS/FAIL).\n' +
        'Các Object, Test Case và Test Suite sẽ KHÔNG bị ảnh hưởng.\n\n' +
        'Bạn có chắc chắn muốn tiếp tục?'
      )) return;
      sendToExtension('WA_CLEAR_REPORTS');
      state.reports = [];
      renderReports();
    });

    els.btnClearStorage.addEventListener('click', () => {
      if (!confirm(
        '⚠️ Xóa toàn bộ storage\n\n' +
        'Hành động này sẽ XÓA HOÀN TOÀN tất cả dữ liệu:\n' +
        '  • Object Repository (tất cả selectors đã scan)\n' +
        '  • Test Cases (tất cả các test đã tạo)\n' +
        '  • Test Suites (tất cả các suite đã cấu hình)\n' +
        '  • Reports (tất cả kết quả test đã lưu)\n\n' +
        'Hành động này KHÔNG THỂ HOÀN TÁC.\n\n' +
        'Bạn có chắc chắn muốn tiếp tục?'
      )) return;
      sendToExtension('WA_CLEAR_ALL_STORAGE');
      state.objects = {};
      state.testCases = [];
      state.testSuites = [];
      state.reports = [];
      renderObjects();
      renderTestCases();
      renderSuites();
      renderReports();
    });

    els.btnCancelRun.addEventListener('click', () => {
      if (!state.running) return;
      sendToExtension('WA_CANCEL_RUN', {});
    });

    // Step edit modal events
    els.btnModalClose.addEventListener('click', closeStepEditModal);
    els.btnModalCancel.addEventListener('click', closeStepEditModal);
    els.btnModalSave.addEventListener('click', saveStepEdit);
    els.stepEditOverlay.addEventListener('click', (e) => {
      if (e.target === els.stepEditOverlay) closeStepEditModal();
    });
  }

  // ---------------- Init ----------------

  function init() {
    Object.assign(els, {
      extIdInput: $('ext-id-input'),
      btnConnect: $('btn-connect'),
      connectStatus: $('connect-status'),
      targetTabSelect: $('target-tab-select'),
      btnRefreshTabs: $('btn-refresh-tabs'),
      testcaseSelect: $('testcase-select'),
      runTestcaseSelect: $('run-testcase-select'),
      btnNewTestcase: $('btn-new-testcase'),
      btnDeleteTestcase: $('btn-delete-testcase'),
      btnRecordToggle: $('btn-record-toggle'),
      stepList: $('step-list'),
      stepEmpty: $('step-empty'),
      stepObjectSelect: $('step-object-select'),
      stepActionSelect: $('step-action-select'),
      stepValueInput: $('step-value-input'),
      btnAddStep: $('btn-add-step'),
      stepEditOverlay: $('step-edit-overlay'),
      editStepObjectSelect: $('edit-step-object-select'),
      editStepActionSelect: $('edit-step-action-select'),
      editStepValueInput: $('edit-step-value-input'),
      btnModalClose: $('btn-modal-close'),
      btnModalCancel: $('btn-modal-cancel'),
      btnModalSave: $('btn-modal-save'),
      suiteSelect: $('suite-select'),
      btnNewSuite: $('btn-new-suite'),
      btnDeleteSuite: $('btn-delete-suite'),
      suiteItemList: $('suite-item-list'),
      suiteEmpty: $('suite-empty'),
      suiteAddTestcaseSelect: $('suite-add-testcase-select'),
      btnSuiteAddTestcase: $('btn-suite-add-testcase'),
      runModeSelect: $('run-mode-select'),
      runModeTestcaseDiv: $('run-mode-testcase'),
      runModeSuiteDiv: $('run-mode-suite'),
      runSuiteSelect: $('run-suite-select'),
      suiteProgressList: $('suite-progress-list'),
      runStepList: $('run-step-list'),
      runEmpty: $('run-empty'),
      btnRunTestcase: $('btn-run-testcase'),
      btnCancelRun: $('btn-cancel-run'),
      reportList: $('report-list'),
      reportEmpty: $('report-empty'),
      btnClearReports: $('btn-clear-reports'),
      btnClearStorage: $('btn-clear-storage'),
    });

    initTabs();
    wireEvents();

    const savedId = localStorage.getItem('tosca_ext_id');
    if (savedId) {
      els.extIdInput.value = savedId;
      connectToExtension(savedId);
    }
  }

  init();
})();
