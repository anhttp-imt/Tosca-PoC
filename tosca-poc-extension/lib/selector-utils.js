// Shared selector generation/lookup logic, used by content.js (classic script, no ES modules
// so it can be injected via chrome.scripting.executeScript alongside content.js).
(function (global) {
  function cssEscape(value) {
    if (global.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/([ #.;?%&,+*~':"!^$[\]()=>|/\\])/g, '\\$1');
  }

  function isUnique(selector, doc) {
    try {
      return doc.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  function buildCssPath(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'HTML') {
      if (node.id) {
        path.unshift(`#${cssEscape(node.id)}`);
        break;
      }
      let selector = node.tagName.toLowerCase();
      let nth = 1;
      let sibling = node;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName === node.tagName) nth++;
      }
      selector += `:nth-of-type(${nth})`;
      path.unshift(selector);
      node = node.parentElement;
    }
    return path.join(' > ');
  }

  function buildXPath(el) {
    if (!(el instanceof Element)) return '';
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
      node = node.parentElement;
    }
    return '/' + parts.join('/');
  }

  function getShortText(el) {
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return text.slice(0, 60);
  }

  function generateSelectors(el) {
    const doc = el.ownerDocument;
    const selectors = {};

    if (el.id) {
      const sel = `#${cssEscape(el.id)}`;
      if (isUnique(sel, doc)) selectors.id = sel;
    }

    const testIdAttr = ['data-testid', 'data-test', 'data-qa'].find((attr) => el.getAttribute(attr));
    if (testIdAttr) {
      const sel = `[${testIdAttr}="${cssEscape(el.getAttribute(testIdAttr))}"]`;
      if (isUnique(sel, doc)) selectors.dataTestId = sel;
    }

    const name = el.getAttribute('name');
    if (name) {
      const sel = `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
      if (isUnique(sel, doc)) selectors.name = sel;
    }

    selectors.css = buildCssPath(el);
    selectors.xpath = buildXPath(el);
    selectors.text = getShortText(el);

    return selectors;
  }

  function pickBestSelector(selectors) {
    return selectors.id || selectors.dataTestId || selectors.name || selectors.css || selectors.xpath || '';
  }

  function findElement(selectors) {
    const candidates = [selectors.id, selectors.dataTestId, selectors.name, selectors.css];
    for (const sel of candidates) {
      if (!sel) continue;
      try {
        const found = document.querySelector(sel);
        if (found) return found;
      } catch (e) {
        // invalid/stale selector, try next candidate
      }
    }
    if (selectors.xpath) {
      try {
        const result = document.evaluate(
          selectors.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        if (result.singleNodeValue) return result.singleNodeValue;
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  global.ToscaSelectorUtils = { generateSelectors, pickBestSelector, findElement, buildCssPath, buildXPath };
})(window);
