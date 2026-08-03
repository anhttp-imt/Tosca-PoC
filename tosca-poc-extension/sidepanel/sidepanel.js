(function () {
  const state = { objects: [], scanning: false };
  const els = {};

  function $(id) { return document.getElementById(id); }

  function send(type, payload) {
    return chrome.runtime.sendMessage({ type, ...payload });
  }

  function renderObjects() {
    const list = els.objectList;
    list.innerHTML = '';
    els.objectEmpty.classList.toggle('visible', state.objects.length === 0);

    state.objects.forEach((obj) => {
      const li = document.createElement('li');
      li.className = 'item-card';
      const bestSelector =
        obj.selectors.id || obj.selectors.dataTestId || obj.selectors.name || obj.selectors.css || obj.selectors.xpath;
      li.innerHTML = `
        <div class="item-card-row">
          <span class="item-title"></span>
          <span class="item-actions">
            <button data-action="rename" title="Rename">✎</button>
            <button data-action="delete" title="Delete">🗑</button>
          </span>
        </div>
        <span class="item-sub"></span>
        <span class="item-sub"></span>
      `;
      li.querySelector('.item-title').textContent = obj.name;
      const subs = li.querySelectorAll('.item-sub');
      subs[0].textContent = `selector: ${bestSelector}`;
      subs[1].textContent = obj.pageUrlPattern;
      li.querySelector('[data-action="rename"]').addEventListener('click', async () => {
        const name = prompt('New Object Name:', obj.name);
        if (!name) return;
        obj.name = name;
        await send('SP_RENAME_OBJECT', { objectId: obj.id, name });
        renderObjects();
      });
      li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`Delete object "${obj.name}"?`)) return;
        await send('SP_DELETE_OBJECT', { objectId: obj.id });
        state.objects = state.objects.filter((o) => o.id !== obj.id);
        renderObjects();
      });
      list.appendChild(li);
    });
  }

  function setScanning(on) {
    state.scanning = on;
    els.btnScanToggle.textContent = on ? 'Stop Scan' : 'Start Scan';
    els.btnScanToggle.classList.toggle('btn-primary', !on);
    els.btnScanToggle.classList.toggle('btn-danger', on);
  }

  function wireEvents() {
    els.btnScanToggle.addEventListener('click', async () => {
      setScanning(!state.scanning);
      await send(state.scanning ? 'SP_START_SCAN' : 'SP_STOP_SCAN');
    });

    els.btnCopyId.addEventListener('click', async () => {
      await navigator.clipboard.writeText(chrome.runtime.id);
      els.btnCopyId.textContent = 'Đã copy!';
      setTimeout(() => { els.btnCopyId.textContent = 'Copy'; }, 1200);
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'EVT_OBJECT_ADDED') {
      if (!state.objects.some((o) => o.id === message.entry.id)) state.objects.push(message.entry);
      renderObjects();
    }
  });

  async function init() {
    Object.assign(els, {
      extId: $('ext-id'),
      btnCopyId: $('btn-copy-id'),
      objectList: $('object-list'),
      objectEmpty: $('object-empty'),
      btnScanToggle: $('btn-scan-toggle'),
    });

    els.extId.textContent = chrome.runtime.id;
    wireEvents();

    const data = await send('SP_GET_OBJECTS');
    state.objects = data.objects || [];
    renderObjects();
  }

  init();
})();
