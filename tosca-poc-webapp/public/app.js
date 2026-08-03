// Main entry point — message handling & initialization

import { state, uid, getTestCase } from './js/state.js';
import { els, $, cacheElements, initTabs, loadTab } from './js/dom.js';
import {
  connected,
  connectToExtension,
  sendToExtension,
  renderTabOptions,
  setPortMessageHandler,
} from './js/connection.js';
import {
  renderSteps,
  renderTestCaseSelectors,
  renderStepObjectOptions,
  persistActiveTestCase,
} from './js/builder.js';
import { renderSuiteSelectors, renderSuiteItems } from './js/suite.js';
import {
  setRunButtonsState,
  renderRunSteps,
  renderSuitePreview,
  renderRunStepsForSuite,
  updateRunStepStatus,
  updateSuiteTestCaseStatus,
  renderVariables,
  expandedTestCaseIds,
} from './js/run.js';
import { renderReports } from './js/report.js';
import {
  wireSharedEvents,
  wireBuilderEvents,
  wireSuiteEvents,
  wireRunEvents,
  wireReportEvents,
} from './js/events.js';

// ---------------- Port Message Handler ----------------

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
      state.variables = message.variables || {};
      renderVariables();
      renderStepObjectOptions();
      renderTestCaseSelectors();
      renderSteps();
      renderSuiteSelectors();
      renderSuiteItems();
      renderRunSteps();
      if (els.runModeSelect && els.runModeSelect.value === 'suite') {
        renderSuitePreview();
      }
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
        tc = { id: uid('tc'), name: `Recorded ${new Date().toLocaleTimeString('en-US')}`, steps: [], createdAt: Date.now() };
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
      renderVariables();
      setRunButtonsState(true);
      if (!state.suiteRun) {
        renderRunSteps();
      }
      break;
    case 'WA_EVT_VARIABLE_SET':
      state.variables[message.variableName] = message.value;
      renderVariables();
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
      state.variables = {};
      renderVariables();
      setRunButtonsState(true);
      const statuses = {};
      (message.testCaseIds || []).forEach((id) => { statuses[id] = 'pending'; });
      state.suiteRun = { suiteRunId: message.suiteRunId, testCaseIds: message.testCaseIds || [], statuses };
      renderRunStepsForSuite(message.testCaseIds);
      expandedTestCaseIds.clear();
      message.testCaseIds.forEach((tcId) => {
        expandedTestCaseIds.add(tcId);
      });
      els.runStepList.querySelectorAll('.suite-testcase-header').forEach((h) => {
        h.classList.add('expanded');
      });
      els.runStepList.querySelectorAll('.suite-testcase-steps').forEach((s) => {
        s.classList.add('expanded');
      });
      break;
    }
    case 'WA_EVT_SUITE_TESTCASE_STARTED': {
      if (state.suiteRun) state.suiteRun.statuses[message.testCaseId] = 'running';
      break;
    }
    case 'WA_EVT_SUITE_TESTCASE_FINISHED': {
      if (state.suiteRun) state.suiteRun.statuses[message.testCaseId] = message.status;
      updateSuiteTestCaseStatus(message.testCaseId, message.status);
      break;
    }
    case 'WA_EVT_SUITE_FINISHED':
      state.running = false;
      setRunButtonsState(false);
      break;
    case 'WA_EVT_DATA_CHANGED':
      sendToExtension('WA_GET_ALL_DATA');
      break;
    default:
      break;
  }
}

// ---------------- Init ----------------

async function init() {
  // Register message handler BEFORE any connection attempt
  setPortMessageHandler(handlePortMessage);

  // Cache shared elements (header, connect bar, modal, etc.)
  cacheElements();

  // Wire shared events (connection, modal)
  wireSharedEvents();

  // Initialize tabs with per-tab event wiring + refresh functions
  initTabs({
    builder: {
      wireFn: wireBuilderEvents,
      refreshFn: () => {
        renderStepObjectOptions();
        renderTestCaseSelectors();
        renderSteps();
      },
    },
    suite: {
      wireFn: wireSuiteEvents,
      refreshFn: () => {
        renderSuiteSelectors();
        renderSuiteItems();
      },
    },
    run: {
      wireFn: wireRunEvents,
      refreshFn: () => {
        renderTestCaseSelectors();
        renderSuiteSelectors();
        renderVariables();
        renderRunSteps();
        if (els.runModeSelect && els.runModeSelect.value === 'suite') {
          renderSuitePreview();
        }
      },
    },
    report: {
      wireFn: wireReportEvents,
      refreshFn: () => {
        renderReports();
      },
    },
  });

  // Pre-load Builder tab as default
  await loadTab('builder', wireBuilderEvents, () => {
    renderStepObjectOptions();
    renderTestCaseSelectors();
    renderSteps();
  });
  const builderPanel = $('tab-builder');
  if (builderPanel) builderPanel.classList.add('active');

  els.btnRunSuite.disabled = true;

  // Restore last connected extension ID
  const savedId = localStorage.getItem('tosca_ext_id');
  if (savedId) {
    els.extIdInput.value = savedId;
    connectToExtension(savedId);
  }
}

init();
