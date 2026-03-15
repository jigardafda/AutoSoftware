// DevTools bridge script injected into proxied HTML pages
// Enables click-to-inspect element selection with React component source detection

export const DEVTOOLS_BRIDGE_SCRIPT = `
<script data-autosoftware-devtools>
(function() {
  'use strict';

  let inspectMode = false;
  let overlay = null;
  let infoBox = null;
  let currentElement = null;

  // Create overlay element
  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = '__as_inspect_overlay';
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6366f1;background:rgba(99,102,241,0.1);transition:all 0.1s ease;display:none;';
    document.body.appendChild(overlay);

    infoBox = document.createElement('div');
    infoBox.id = '__as_inspect_info';
    infoBox.style.cssText = 'position:fixed;z-index:2147483647;background:#1e1b4b;color:#e0e7ff;padding:6px 10px;border-radius:6px;font:12px/1.4 monospace;pointer-events:none;display:none;max-width:500px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(infoBox);
  }

  // Get CSS selector for an element
  function getSelector(el) {
    if (el.id) return '#' + el.id;
    var path = [];
    while (el && el.nodeType === 1) {
      var selector = el.tagName.toLowerCase();
      if (el.id) { path.unshift('#' + el.id); break; }
      if (el.className && typeof el.className === 'string') {
        var classes = el.className.trim().split(/\\s+/).filter(function(c) { return !c.startsWith('__as_'); }).slice(0, 2);
        if (classes.length) selector += '.' + classes.join('.');
      }
      var parent = el.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
        if (siblings.length > 1) selector += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
      }
      path.unshift(selector);
      el = parent;
      if (path.length > 4) break;
    }
    return path.join(' > ');
  }

  // ── React Fiber Source Detection ──
  // In React dev mode, fibers contain _debugSource with fileName and lineNumber.
  // We traverse the fiber tree to find the owning component and its source location.

  function getFiberFromElement(el) {
    // React attaches fiber via __reactFiber$ or __reactInternalInstance$ keys
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].startsWith('__reactFiber$') || keys[i].startsWith('__reactInternalInstance$')) {
        return el[keys[i]];
      }
    }
    return null;
  }

  function isSourceFile(fileName) {
    if (!fileName) return false;
    // Filter out node_modules, build artifacts, vendor files
    if (fileName.indexOf('node_modules') !== -1) return false;
    if (fileName.indexOf('/chunk-') !== -1) return false;
    if (fileName.indexOf('vendor') !== -1) return false;
    // Must be a source file extension
    return /\\.(jsx?|tsx?|vue|svelte)$/.test(fileName);
  }

  function normalizeFileName(fileName) {
    if (!fileName) return fileName;
    // Remove webpack:// or file:// prefixes
    var normalized = fileName.replace(/^(webpack:\\/\\/|file:\\/\\/\\/|\\.\\/|rsc:\\/\\/)/, '');
    // Remove query strings
    var qIdx = normalized.indexOf('?');
    if (qIdx !== -1) normalized = normalized.substring(0, qIdx);
    return normalized;
  }

  function getComponentName(fiber) {
    if (!fiber) return null;
    var type = fiber.type;
    if (!type) return null;
    if (typeof type === 'string') return null; // HTML element like 'div', 'span'
    return type.displayName || type.name || null;
  }

  function getReactComponentInfo(el) {
    var fiber = getFiberFromElement(el);
    if (!fiber) return null;

    var result = {
      component: null,
      file: null,
      line: null,
      column: null,
      stack: [],
      framework: 'react',
    };

    // Walk up the fiber tree to find owning component with source
    var current = fiber;
    var maxDepth = 30;
    while (current && maxDepth-- > 0) {
      var name = getComponentName(current);

      // Check _debugSource (React dev mode)
      var source = current._debugSource;
      if (source && source.fileName && isSourceFile(source.fileName)) {
        if (!result.file) {
          result.file = normalizeFileName(source.fileName);
          result.line = source.lineNumber || null;
          result.column = source.columnNumber || null;
          result.component = name || result.component;
        }
        if (name) {
          result.stack.push({
            name: name,
            file: normalizeFileName(source.fileName) + (source.lineNumber ? ':' + source.lineNumber : ''),
          });
        }
      } else if (name) {
        // Component without source (e.g., from node_modules)
        result.stack.push({ name: name, file: null });
        if (!result.component) result.component = name;
      }

      // Also check _debugOwner for older React versions
      if (!result.file && current._debugOwner) {
        var ownerSource = current._debugOwner._debugSource;
        if (ownerSource && ownerSource.fileName && isSourceFile(ownerSource.fileName)) {
          result.file = normalizeFileName(ownerSource.fileName);
          result.line = ownerSource.lineNumber || null;
          result.column = ownerSource.columnNumber || null;
          result.component = getComponentName(current._debugOwner) || result.component;
        }
      }

      current = current.return;
    }

    // Keep only first 5 stack entries with source files
    result.stack = result.stack.filter(function(s) { return s.file; }).slice(0, 5);

    return result.file ? result : null;
  }

  function handleMouseMove(e) {
    if (!inspectMode) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || (el.id && el.id.startsWith('__as_'))) return;
    currentElement = el;

    var rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    var dims = Math.round(rect.width) + 'x' + Math.round(rect.height);

    // Try to get React component info for the label
    var componentInfo = getReactComponentInfo(el);
    if (componentInfo && componentInfo.file) {
      var shortFile = componentInfo.file.split('/').pop();
      var label = '<' + (componentInfo.component || '?') + '/>';
      if (componentInfo.line) label += ' ' + shortFile + ':' + componentInfo.line;
      else label += ' ' + shortFile;
      label += ' (' + dims + ')';
      infoBox.textContent = label;
    } else {
      var tag = el.tagName.toLowerCase();
      var id = el.id ? '#' + el.id : '';
      var cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      infoBox.textContent = tag + id + cls + ' (' + dims + ')';
    }

    infoBox.style.display = 'block';
    var infoTop = rect.top - 30;
    if (infoTop < 0) infoTop = rect.bottom + 4;
    infoBox.style.left = Math.max(0, rect.left) + 'px';
    infoBox.style.top = infoTop + 'px';
  }

  function handleClick(e) {
    if (!inspectMode) return;
    e.preventDefault();
    e.stopPropagation();

    var el = currentElement || document.elementFromPoint(e.clientX, e.clientY);
    if (!el || (el.id && el.id.startsWith('__as_'))) return;

    var rect = el.getBoundingClientRect();
    var componentInfo = getReactComponentInfo(el);

    var data = {
      type: 'element-selected',
      element: {
        tagName: el.tagName.toLowerCase(),
        id: el.id || null,
        className: typeof el.className === 'string' ? el.className : '',
        textContent: (el.textContent || '').trim().slice(0, 200),
        selector: getSelector(el),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        // React component source info (the key addition)
        component: componentInfo ? componentInfo.component : null,
        file: componentInfo ? componentInfo.file : null,
        line: componentInfo ? componentInfo.line : null,
        column: componentInfo ? componentInfo.column : null,
        framework: componentInfo ? componentInfo.framework : null,
        stack: componentInfo ? componentInfo.stack : [],
        htmlPreview: el.outerHTML.slice(0, 300),
      }
    };

    // Send to parent frame
    window.parent.postMessage(data, '*');

    // Flash the element
    overlay.style.background = 'rgba(99,102,241,0.3)';
    setTimeout(function() { overlay.style.background = 'rgba(99,102,241,0.1)'; }, 200);
  }

  // Listen for commands from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'toggle-inspect') {
      inspectMode = !inspectMode;
      if (!overlay) createOverlay();
      if (!inspectMode) {
        overlay.style.display = 'none';
        infoBox.style.display = 'none';
        currentElement = null;
        document.body.style.cursor = '';
      } else {
        document.body.style.cursor = 'crosshair';
      }
      window.parent.postMessage({ type: 'inspect-mode-changed', active: inspectMode }, '*');
    }

    if (e.data && e.data.type === 'disable-inspect') {
      inspectMode = false;
      if (overlay) overlay.style.display = 'none';
      if (infoBox) infoBox.style.display = 'none';
      document.body.style.cursor = '';
    }

    // Respond to ping from parent (re-query readiness after page load)
    if (e.data && e.data.type === 'bridge-ping') {
      window.parent.postMessage({ type: 'devtools-bridge-ready' }, '*');
    }
  });

  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);

  // Notify parent that bridge is ready
  window.parent.postMessage({ type: 'devtools-bridge-ready' }, '*');
})();
</script>
<script src="https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.js"></script>
<script data-autosoftware-eruda>
(function() {
  'use strict';

  var COMMAND_SOURCE = 'autosoftware';
  var erudaInited = false;
  var pendingVisible = null;

  function applyVisibility(visible) {
    if (!erudaInited || typeof window.eruda === 'undefined') return;
    if (visible) { window.eruda.show(); }
    else { window.eruda.hide(); }
  }

  function initEruda() {
    if (typeof window.eruda === 'undefined') return;
    if (erudaInited) return;
    window.eruda.init({ defaults: { theme: 'Dark' } });
    window.eruda.hide();
    erudaInited = true;
    // Hide the floating entry button
    try {
      var entryBtn = window.eruda._entryBtn;
      if (entryBtn && entryBtn._$el && entryBtn._$el[0]) {
        entryBtn._$el[0].style.display = 'none';
      }
    } catch (e) { /* ignore */ }
    // Apply any pending visibility state from parent
    if (pendingVisible !== null) {
      applyVisibility(pendingVisible);
      pendingVisible = null;
    }
    window.parent.postMessage({ type: 'eruda-ready' }, '*');
  }

  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== COMMAND_SOURCE) return;
    var command = event.data.command;
    var visible = command === 'show-eruda';
    if (command === 'toggle-eruda') {
      if (erudaInited && typeof window.eruda !== 'undefined') {
        if (window.eruda._isShow) { window.eruda.hide(); }
        else { window.eruda.show(); }
      }
    } else if (command === 'show-eruda' || command === 'hide-eruda') {
      if (erudaInited) {
        applyVisibility(visible);
      } else {
        pendingVisible = visible;
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEruda);
  } else {
    initEruda();
  }
})();
</script>
`;
