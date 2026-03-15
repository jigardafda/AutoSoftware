// DevTools bridge script injected into proxied HTML pages
// Enables click-to-inspect element selection with React component source detection
// Uses bippy (injected in <head>) for React DevTools hook access + source mapping

export const DEVTOOLS_BRIDGE_SCRIPT = `
<script data-autosoftware-devtools>
(function() {
  'use strict';

  var inspectMode = false;
  var overlay = null;
  var infoBox = null;
  var currentElement = null;

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

  // ── React Component Detection via bippy (preferred) or _debugSource fallback ──

  function hasBippy() {
    return typeof ReactBippy !== 'undefined' && ReactBippy.isInstrumentationActive();
  }

  function isUsefulName(name) {
    if (!name || name.length <= 1 || name.charAt(0) === '_') return false;
    var skip = ['Suspense','Fragment','StrictMode','Profiler','SuspenseList'];
    return skip.indexOf(name) === -1;
  }

  function getReactComponentInfo(el) {
    // ── Try bippy first (hooks into React DevTools, has source maps) ──
    if (hasBippy()) {
      var fiber = ReactBippy.getFiberFromHostInstance(el);
      if (fiber) {
        // Get nearest component name
        var component = null;
        var cur = fiber.return;
        while (cur) {
          if (ReactBippy.isCompositeFiber(cur)) {
            var n = ReactBippy.getDisplayName(cur.type);
            if (n && isUsefulName(n)) { component = n; break; }
          }
          cur = cur.return;
        }

        // Build result synchronously with what we have, then enhance with owner stack
        var result = {
          component: component,
          file: null, line: null, column: null,
          stack: [],
          framework: 'react',
          _pendingStack: ReactBippy.getOwnerStack(fiber)
        };

        // Walk fiber for component names
        var names = [];
        ReactBippy.traverseFiber(fiber, function(f) {
          if (names.length >= 5) return true;
          if (ReactBippy.isCompositeFiber(f)) {
            var name = ReactBippy.getDisplayName(f.type);
            if (name && isUsefulName(name)) names.push(name);
          }
          return false;
        }, true);
        if (!result.component && names.length) result.component = names[0];

        return result;
      }
    }

    // ── Fallback: direct fiber traversal with _debugSource ──
    var keys = Object.keys(el);
    var fiber = null;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].startsWith('__reactFiber$') || keys[i].startsWith('__reactInternalInstance$')) {
        fiber = el[keys[i]]; break;
      }
    }
    if (!fiber) return null;

    var result = { component: null, file: null, line: null, column: null, stack: [], framework: 'react' };
    var current = fiber;
    var depth = 30;
    while (current && depth-- > 0) {
      var type = current.type;
      var name = type && typeof type !== 'string' ? (type.displayName || type.name || null) : null;
      var source = current._debugSource || (current._debugInfo && current._debugInfo[0] && current._debugInfo[0].source);
      if (source && source.fileName && !/node_modules|\\/chunk-|vendor/.test(source.fileName) && /\\.(jsx?|tsx?|vue|svelte)$/.test(source.fileName)) {
        var normFile = source.fileName.replace(/^(webpack:\\/\\/|file:\\/\\/\\/|\\.\\/|rsc:\\/\\/)/, '').split('?')[0];
        if (!result.file) {
          result.file = normFile;
          result.line = source.lineNumber || null;
          result.column = source.columnNumber || null;
          result.component = name || result.component;
        }
        if (name) result.stack.push({ name: name, file: normFile + (source.lineNumber ? ':' + source.lineNumber : '') });
      } else if (name) {
        result.stack.push({ name: name, file: null });
        if (!result.component) result.component = name;
      }
      current = current.return;
    }
    result.stack = result.stack.filter(function(s) { return s.file; }).slice(0, 5);
    return (result.file || result.component) ? result : null;
  }

  // Resolve owner stack (async) from bippy and enhance element data
  function resolveOwnerStack(componentInfo) {
    if (!componentInfo || !componentInfo._pendingStack) {
      return Promise.resolve(componentInfo);
    }
    return componentInfo._pendingStack.then(function(stack) {
      delete componentInfo._pendingStack;
      if (!stack) return componentInfo;
      for (var i = 0; i < stack.length; i++) {
        var frame = stack[i];
        if (frame.fileName && ReactBippy.isSourceFile(frame.fileName)) {
          var file = ReactBippy.normalizeFileName(frame.fileName);
          if (!componentInfo.file) {
            componentInfo.file = file;
            componentInfo.line = frame.lineNumber || null;
            componentInfo.column = frame.columnNumber || null;
          }
          var name = '';
          if (frame.functionName && isUsefulName(frame.functionName)) name = frame.functionName;
          componentInfo.stack.push({ name: name, file: file + (frame.lineNumber ? ':' + frame.lineNumber : '') });
          if (componentInfo.stack.length >= 5) break;
        }
      }
      return componentInfo;
    }).catch(function() { delete componentInfo._pendingStack; return componentInfo; });
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
    var ci = getReactComponentInfo(el);

    if (ci && ci.file) {
      var shortFile = ci.file.split('/').pop();
      var label = '<' + (ci.component || '?') + '/>';
      if (ci.line) label += ' ' + shortFile + ':' + ci.line;
      else label += ' ' + shortFile;
      label += ' (' + dims + ')';
      infoBox.textContent = label;
    } else if (ci && ci.component) {
      infoBox.textContent = '<' + ci.component + '/> (' + dims + ')';
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
    var ci = getReactComponentInfo(el);

    // Resolve owner stack (async for bippy) then send
    resolveOwnerStack(ci).then(function(info) {
      var data = {
        type: 'element-selected',
        element: {
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          className: typeof el.className === 'string' ? el.className : '',
          textContent: (el.textContent || '').trim().slice(0, 200),
          selector: getSelector(el),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          component: info ? info.component : null,
          file: info ? info.file : null,
          line: info ? info.line : null,
          column: info ? info.column : null,
          framework: info ? info.framework : null,
          stack: info ? info.stack : [],
          htmlPreview: el.outerHTML.slice(0, 300),
        }
      };
      window.parent.postMessage(data, '*');
    });

    overlay.style.background = 'rgba(99,102,241,0.3)';
    setTimeout(function() { overlay.style.background = 'rgba(99,102,241,0.1)'; }, 200);
  }

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
    if (e.data && e.data.type === 'bridge-ping') {
      window.parent.postMessage({ type: 'devtools-bridge-ready' }, '*');
    }
  });

  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
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
