// Injected on-demand into the target tab via chrome.scripting.executeScript.
// Depends on lib/selector-utils.js being injected first (exposes window.ToscaSelectorUtils).
(function () {
  if (window.__toscaPocContentLoaded) return;
  window.__toscaPocContentLoaded = true;

  let overlayEl = null;
  let labelEl = null;
  let runOverlayEl = null;

  function ensureOverlay() {
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.className = 'tosca-poc-highlight-overlay';
      overlayEl.style.display = 'none';
      document.documentElement.appendChild(overlayEl);
    }
    if (!labelEl) {
      labelEl = document.createElement('div');
      labelEl.className = 'tosca-poc-highlight-label';
      labelEl.style.display = 'none';
      document.documentElement.appendChild(labelEl);
    }
  }

  function ensureRunOverlay() {
    if (!runOverlayEl) {
      runOverlayEl = document.createElement('div');
      runOverlayEl.className = 'tosca-poc-run-overlay';
      runOverlayEl.style.display = 'none';
      document.documentElement.appendChild(runOverlayEl);
    }
  }

  function positionOverlay(el, overlay, label) {
    const rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    if (label) {
      label.style.display = 'block';
      label.style.left = `${rect.left}px`;
      label.style.top = `${Math.max(0, rect.top - 20)}px`;
      label.textContent = describeElement(el);
    }
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.style.display = 'none';
    if (labelEl) labelEl.style.display = 'none';
  }

  function describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const idPart = el.id ? `#${el.id}` : '';
    const text = (el.innerText || el.value || '').trim().slice(0, 24);
    return `${tag}${idPart}${text ? ' "' + text + '"' : ''}`;
  }

  function isIgnorableElement(el) {
    return (
      !el ||
      el === document.documentElement ||
      el === document.body ||
      el.classList.contains('tosca-poc-highlight-overlay') ||
      el.classList.contains('tosca-poc-highlight-label') ||
      el.classList.contains('tosca-poc-run-overlay')
    );
  }

  // ---------------- Scan mode ----------------

  function onScanMouseMove(e) {
    const el = e.target;
    if (isIgnorableElement(el)) return;
    ensureOverlay();
    positionOverlay(el, overlayEl, labelEl);
  }

  function onScanClick(e) {
    const el = e.target;
    if (isIgnorableElement(el)) return;
    e.preventDefault();
    e.stopPropagation();
    const selectors = ToscaSelectorUtils.generateSelectors(el);
    const entry = {
      name: describeElement(el),
      selectors,
      tagName: el.tagName.toLowerCase(),
      pageUrlPattern: location.origin + location.pathname,
      capturedAt: Date.now(),
    };
    chrome.runtime.sendMessage({ type: 'CS_OBJECT_CAPTURED', entry });
  }

  function enableScanMode() {
    ensureOverlay();
    document.addEventListener('mousemove', onScanMouseMove, true);
    document.addEventListener('click', onScanClick, true);
  }

  function disableScanMode() {
    document.removeEventListener('mousemove', onScanMouseMove, true);
    document.removeEventListener('click', onScanClick, true);
    hideOverlay();
  }

  // ---------------- Record mode ----------------

  function actionForElement(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') return 'select';
    if (tag === 'input' || tag === 'textarea') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return 'click';
      return 'input';
    }
    return 'click';
  }

  function onRecordClick(e) {
    const el = e.target;
    if (isIgnorableElement(el)) return;
    if (actionForElement(el) !== 'click') return; // text inputs recorded on change instead
    emitRecordedStep(el, 'click');
  }

  function onRecordChange(e) {
    const el = e.target;
    if (isIgnorableElement(el)) return;
    const action = actionForElement(el);
    if (action === 'input') emitRecordedStep(el, 'input', el.value);
    else if (action === 'select') emitRecordedStep(el, 'select', el.value);
  }

  function emitRecordedStep(el, action, value) {
    const selectors = ToscaSelectorUtils.generateSelectors(el);
    const objectEntry = {
      name: describeElement(el),
      selectors,
      tagName: el.tagName.toLowerCase(),
      pageUrlPattern: location.origin + location.pathname,
      capturedAt: Date.now(),
    };
    chrome.runtime.sendMessage({ type: 'CS_STEP_RECORDED', step: { action, value }, objectEntry });
  }

  function enableRecordMode() {
    document.addEventListener('click', onRecordClick, true);
    document.addEventListener('change', onRecordChange, true);
  }

  function disableRecordMode() {
    document.removeEventListener('click', onRecordClick, true);
    document.removeEventListener('change', onRecordChange, true);
  }

  // ---------------- Playback ----------------

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function executeStep(step, selectors) {
    ensureRunOverlay();
    const el = ToscaSelectorUtils.findElement(selectors || {});
    if (!el) {
      return {
        status: 'fail',
        message: `Không tìm thấy element (selector: ${ToscaSelectorUtils.pickBestSelector(selectors || {})})`,
      };
    }
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    positionOverlay(el, runOverlayEl, null);
    await sleep(150);

    try {
      switch (step.action) {
        case 'click':
          el.click();
          break;
        case 'input':
          el.focus();
          setNativeValue(el, step.value ?? '');
          el.blur();
          break;
        case 'select':
          el.value = step.value ?? '';
          el.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        case 'verify': {
          const actual = (el.innerText ?? el.value ?? '').trim();
          const expected = (step.expectedValue ?? step.value ?? '').trim();
          if (actual !== expected) {
            return { status: 'fail', message: `Verify thất bại: mong đợi "${expected}", thực tế "${actual}"` };
          }
          break;
        }
        case 'wait':
          await sleep(step.waitMs || 500);
          break;
        default:
          return { status: 'fail', message: `Action không hỗ trợ: ${step.action}` };
      }
    } catch (err) {
      return { status: 'fail', message: `Lỗi khi thực thi: ${err.message}` };
    }

    await sleep(150);
    runOverlayEl.style.display = 'none';
    return { status: 'pass', message: 'OK' };
  }

  // ---------------- Messaging ----------------

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return;

    switch (message.type) {
      case 'BG_PING':
        sendResponse({ ok: true });
        return;
      case 'BG_ENABLE_SCAN':
        enableScanMode();
        sendResponse({ ok: true });
        return;
      case 'BG_DISABLE_SCAN':
        disableScanMode();
        sendResponse({ ok: true });
        return;
      case 'BG_ENABLE_RECORD':
        enableRecordMode();
        sendResponse({ ok: true });
        return;
      case 'BG_DISABLE_RECORD':
        disableRecordMode();
        sendResponse({ ok: true });
        return;
      case 'BG_EXECUTE_STEP':
        executeStep(message.step, message.selectors).then(sendResponse);
        return true; // keep the message channel open for the async response
      default:
        return;
    }
  });
})();
