(() => {
  window.__feedScrollerShared__ = window.__feedScrollerShared__ || {};

  if (window.__feedScrollerShared__.jkl) return;

  function stopOnly(event) {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      el.isContentEditable
    );
  }

  function visibleInViewport(el, minItemHeight = 24) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const rect = el.getBoundingClientRect();
    if (rect.height < minItemHeight) return false;
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function middleMostVisible(items, minItemHeight = 24) {
    const midY = window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;

    for (const el of items || []) {
      if (!visibleInViewport(el, minItemHeight)) continue;
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const distance = Math.abs(centerY - midY);

      if (distance < bestDist) {
        best = el;
        bestDist = distance;
      }
    }

    return best;
  }

  function ensureFocusable(el) {
    if (!el || el.hasAttribute("tabindex")) return;
    el.setAttribute("tabindex", "-1");
  }

  function createInlineRenderer({
    checkboxTitle = "Mark progress (L)",
    highlightClass,
    itemClass,
    prepareCheckbox = null,
    prepareItem = null,
    progressBoxClass,
  }) {
    let latestContext = null;

    function ensureCheckbox(itemEl) {
      if (!itemEl || itemEl.nodeType !== 1) return null;

      if (itemClass && !itemEl.classList.contains(itemClass)) {
        itemEl.classList.add(itemClass);
      }

      prepareItem?.(itemEl);

      let checkbox = itemEl.querySelector(`:scope > input.${progressBoxClass}`);
      if (checkbox) {
        prepareCheckbox?.(checkbox, itemEl);
        return checkbox;
      }

      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = progressBoxClass;
      checkbox.title = checkboxTitle;
      checkbox.tabIndex = -1;

      checkbox.addEventListener("pointerdown", stopOnly, true);
      checkbox.addEventListener("mousedown", stopOnly, true);
      checkbox.addEventListener("click", stopOnly, true);
      checkbox.addEventListener(
        "change",
        (event) => {
          stopOnly(event);
          latestContext?.onCheckboxChange?.(itemEl, checkbox, event);
          checkbox.blur?.();
        },
        true,
      );

      prepareCheckbox?.(checkbox, itemEl);
      itemEl.appendChild(checkbox);
      return checkbox;
    }

    return {
      activate() {},
      deactivate() {},
      onCurrentChanged(previousItem, nextItem) {
        if (highlightClass && previousItem) {
          previousItem.classList.remove(highlightClass);
        }

        if (highlightClass && nextItem) {
          nextItem.classList.add(highlightClass);
        }
      },
      render(context) {
        latestContext = context;

        for (const item of context.items) {
          const id = context.getItemId(item) || "";
          item.dataset.arcJkId = id;

          const checkbox = ensureCheckbox(item);
          if (!checkbox) continue;

          if (!id || !context.canToggleProgress) {
            checkbox.checked = false;
            checkbox.disabled = true;
            checkbox.style.display = "none";
            continue;
          }

          checkbox.disabled = false;
          checkbox.style.display = "";
          checkbox.checked = !!context.savedId && context.savedId === id;
        }
      },
    };
  }

  function createOverlayRenderer({
    checkboxTitle = "Mark progress (L)",
    highlightBoxId,
    keySinkId = null,
    progressBoxClass,
    viewportBottomScreens = 2,
    viewportTopScreens = 1,
  }) {
    let cbByItem = new WeakMap();
    let highlightBox = null;
    let keySink = null;
    let latestContext = null;
    let visibleCheckboxes = new Set();

    function ensureHighlightBox() {
      if (highlightBox && document.contains(highlightBox)) return highlightBox;

      highlightBox = document.createElement("div");
      highlightBox.id = highlightBoxId;
      document.body.appendChild(highlightBox);
      return highlightBox;
    }

    function removeHighlightBox() {
      if (highlightBox) highlightBox.remove();
      highlightBox = null;
    }

    function ensureKeySink() {
      if (!keySinkId) return null;
      if (keySink && document.contains(keySink)) return keySink;

      keySink = document.getElementById(keySinkId);
      if (keySink && document.contains(keySink)) return keySink;

      keySink = document.createElement("textarea");
      keySink.id = keySinkId;
      keySink.setAttribute("aria-hidden", "true");
      keySink.tabIndex = -1;
      keySink.autocomplete = "off";
      keySink.spellcheck = false;

      keySink.style.position = "fixed";
      keySink.style.left = "-9999px";
      keySink.style.top = "0";
      keySink.style.width = "1px";
      keySink.style.height = "1px";
      keySink.style.opacity = "0";
      keySink.style.pointerEvents = "none";
      keySink.style.zIndex = "2147483647";

      document.body.appendChild(keySink);
      return keySink;
    }

    function focusKeySink() {
      const sink = ensureKeySink();
      if (!sink) return;
      if (document.activeElement !== sink) {
        sink.focus({ preventScroll: true });
      }
    }

    function removeKeySink() {
      if (keySink) keySink.remove();
      keySink = null;
    }

    function removeAllCheckboxes() {
      for (const checkbox of visibleCheckboxes) {
        checkbox?.remove();
      }

      cbByItem = new WeakMap();
      visibleCheckboxes.clear();

      document
        .querySelectorAll(`input.${progressBoxClass}[data-arc-jk="1"]`)
        .forEach((el) => el.remove());
    }

    function ensureCheckbox(item) {
      let checkbox = cbByItem.get(item);
      if (checkbox && document.contains(checkbox)) return checkbox;

      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = progressBoxClass;
      checkbox.tabIndex = -1;
      checkbox.title = checkboxTitle;
      checkbox.dataset.arcJk = "1";

      checkbox.addEventListener("pointerdown", stopOnly, true);
      checkbox.addEventListener("mousedown", stopOnly, true);
      checkbox.addEventListener("click", stopOnly, true);
      checkbox.addEventListener(
        "change",
        (event) => {
          stopOnly(event);
          latestContext?.onCheckboxChange?.(item, checkbox, event);
          checkbox.blur?.();
        },
        true,
      );

      cbByItem.set(item, checkbox);
      document.body.appendChild(checkbox);
      return checkbox;
    }

    return {
      activate() {
        ensureHighlightBox();
        ensureKeySink();
      },
      deactivate() {
        removeAllCheckboxes();
        removeHighlightBox();
        removeKeySink();
      },
      focusKeySink,
      getKeySink() {
        return keySink || document.getElementById(keySinkId);
      },
      onCurrentChanged() {},
      render(context) {
        latestContext = context;

        const box = ensureHighlightBox();
        if (context.current && document.contains(context.current)) {
          const rect = context.current.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            box.style.display = "block";
            box.style.left = `${Math.round(rect.left)}px`;
            box.style.top = `${Math.round(rect.top)}px`;
            box.style.width = `${Math.round(rect.width)}px`;
            box.style.height = `${Math.round(rect.height)}px`;
          } else {
            box.style.display = "none";
          }
        } else {
          box.style.display = "none";
        }

        const newVisible = new Set();
        const topLimit = -window.innerHeight * viewportTopScreens;
        const bottomLimit = window.innerHeight * viewportBottomScreens;

        for (const item of context.items) {
          const rect = item.getBoundingClientRect();
          if (rect.bottom < topLimit || rect.top > bottomLimit) continue;

          const id = context.getItemId(item) || "";
          item.dataset.arcJkId = id;

          if (!id || !context.canToggleProgress) continue;

          const checkbox = ensureCheckbox(item);
          checkbox.checked = !!context.savedId && context.savedId === id;
          checkbox.dataset.selected = context.current === item ? "1" : "0";

          const size = 16;
          const pad = 10;
          let left = rect.left - size - pad;
          if (left < 2) {
            left = Math.max(
              2,
              Math.min(window.innerWidth - size - 2, rect.left + pad),
            );
          }

          const top = Math.max(
            2,
            Math.min(
              window.innerHeight - size - 2,
              rect.top + rect.height / 2 - size / 2,
            ),
          );

          checkbox.style.left = `${Math.round(left)}px`;
          checkbox.style.top = `${Math.round(top)}px`;

          newVisible.add(checkbox);
          visibleCheckboxes.add(checkbox);
        }

        for (const checkbox of Array.from(visibleCheckboxes)) {
          if (newVisible.has(checkbox)) continue;
          checkbox.remove();
          visibleCheckboxes.delete(checkbox);
        }
      },
    };
  }

  function createController({
    allowTypingTarget = () => false,
    canToggleProgress = (scope) => !!scope?.allowsPersistence,
    focusCurrent = true,
    getItemId,
    getItems,
    isEnabled = () => true,
    minItemHeight = 24,
    navScrollGraceMs = 700,
    onActivated = null,
    onAfterSync = null,
    onBeforeSync = null,
    onDeactivated = null,
    renderer,
    storage,
  }) {
    const state = {
      active: false,
      current: null,
      navScrollTimer: null,
      navScrolling: false,
      restoring: false,
      syncQueued: false,
      unsubs: [],
    };

    function getScope() {
      return storage.getScope();
    }

    function markNavScrolling() {
      state.navScrolling = true;
      if (state.navScrollTimer) clearTimeout(state.navScrollTimer);
      state.navScrollTimer = setTimeout(() => {
        state.navScrolling = false;
      }, navScrollGraceMs);
    }

    function activate() {
      if (state.active) return;
      state.active = true;
      renderer.activate?.(api);
      setTimeout(() => {
        if (state.active) renderer.focusKeySink?.();
      }, 0);
      onActivated?.(api);
    }

    function deactivate() {
      const previousItem = state.current;
      state.current = null;
      renderer.onCurrentChanged?.(previousItem, null, api);

      if (!state.active) return;
      state.active = false;
      renderer.deactivate?.(api);
      onDeactivated?.(api);
    }

    function queueSync() {
      if (state.syncQueued) return;
      state.syncQueued = true;
      requestAnimationFrame(() => {
        state.syncQueued = false;
        syncUI();
      });
    }

    function setCurrent(el, { preventScroll = false } = {}) {
      if (!el) return;

      const previousItem = state.current;
      state.current = el;
      renderer.onCurrentChanged?.(previousItem, el, api);

      if (focusCurrent) {
        ensureFocusable(el);
        el.focus?.({ preventScroll: true });
      }

      markNavScrolling();

      if (!preventScroll) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
      }

      queueSync();
    }

    function clearSelection() {
      const previousItem = state.current;
      state.current = null;
      renderer.onCurrentChanged?.(previousItem, null, api);
      queueSync();
    }

    function syncUI() {
      const scope = getScope();
      const enabled = !!isEnabled(scope);

      if (!enabled) {
        deactivate();
        return;
      }

      activate();

      if (state.current && !document.contains(state.current)) {
        const previousItem = state.current;
        state.current = null;
        renderer.onCurrentChanged?.(previousItem, null, api);
      }

      onBeforeSync?.(api);

      const items = (getItems(scope) || []).filter(Boolean);
      const progressEnabled = !!canToggleProgress(scope);
      const savedId = progressEnabled ? storage.load(scope) : null;

      renderer.render?.({
        canToggleProgress: progressEnabled,
        current: state.current,
        getItemId: (item) => getItemId(item, scope),
        items,
        onCheckboxChange: handleCheckboxChange,
        savedId,
        scope,
      });

      onAfterSync?.({
        active: state.active,
        canToggleProgress: progressEnabled,
        current: state.current,
        items,
        savedId,
        scope,
      });
    }

    function getAnchorItem(items) {
      return middleMostVisible(items, minItemHeight) || items[0] || null;
    }

    function move(dir) {
      const scope = getScope();
      if (!isEnabled(scope)) return;

      const items = (getItems(scope) || []).filter(Boolean);
      if (!items.length) return;

      const middleItem = getAnchorItem(items);

      if (
        !state.current ||
        !document.contains(state.current) ||
        !visibleInViewport(state.current, minItemHeight)
      ) {
        if (middleItem) setCurrent(middleItem);
        return;
      }

      const currentIndex = items.indexOf(state.current);
      if (currentIndex === -1) {
        if (middleItem) setCurrent(middleItem);
        return;
      }

      const nextIndex = Math.max(
        0,
        Math.min(items.length - 1, currentIndex + dir),
      );
      setCurrent(items[nextIndex]);
    }

    function toggleProgressForItem(itemEl) {
      if (!itemEl) return false;

      const scope = getScope();
      if (!canToggleProgress(scope)) {
        queueSync();
        return false;
      }

      const id = itemEl.dataset.arcJkId || getItemId(itemEl, scope);
      if (!id) return false;

      itemEl.dataset.arcJkId = id;

      const savedId = storage.load(scope);
      if (savedId === id) storage.clear(scope);
      else storage.save(id, scope);

      queueSync();
      return true;
    }

    function toggleProgressForCurrent() {
      return toggleProgressForItem(state.current);
    }

    function handleCheckboxChange(item, checkbox) {
      const scope = getScope();
      if (!canToggleProgress(scope)) {
        checkbox.checked = false;
        setCurrent(item, { preventScroll: true });
        queueSync();
        return;
      }

      const id = item.dataset.arcJkId || getItemId(item, scope);
      if (!id) {
        checkbox.checked = false;
        queueSync();
        return;
      }

      item.dataset.arcJkId = id;

      if (checkbox.checked) storage.save(id, scope);
      else if (storage.load(scope) === id) storage.clear(scope);

      setCurrent(item, { preventScroll: true });
      queueSync();
    }

    function handleKeydown(event, { allowToggleRepeat = false } = {}) {
      const scope = getScope();
      if (!isEnabled(scope)) return;

      const key = (event.key || "").toLowerCase();
      if (key !== "j" && key !== "k" && key !== "l") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (key === "l" && event.repeat && !allowToggleRepeat) return;

      const activeElement = document.activeElement;
      if (isTypingTarget(activeElement) && !allowTypingTarget(activeElement)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if (key === "j") {
        move(+1);
        return;
      }

      if (key === "k") {
        move(-1);
        return;
      }

      if (
        !state.current ||
        !document.contains(state.current) ||
        !visibleInViewport(state.current, minItemHeight)
      ) {
        const items = (getItems(scope) || []).filter(Boolean);
        const middleItem = getAnchorItem(items);
        if (middleItem) setCurrent(middleItem);
      }

      if (state.current) toggleProgressForCurrent();
    }

    function installKeyHandler({
      allowToggleRepeat = false,
      target = document,
    } = {}) {
      const listener = (event) =>
        handleKeydown(event, { allowToggleRepeat });
      target.addEventListener("keydown", listener, true);

      const cleanup = () => target.removeEventListener("keydown", listener, true);
      state.unsubs.push(cleanup);
      return cleanup;
    }

    function installResetHandlers({
      events = ["wheel", "touchstart", "scroll"],
      target = window,
    } = {}) {
      for (const eventName of events) {
        const listener = () => {
          if (!state.active) return;
          if (state.navScrolling || state.restoring) return;
          clearSelection();
        };

        target.addEventListener(eventName, listener, {
          capture: true,
          passive: true,
        });

        const cleanup = () =>
          target.removeEventListener(eventName, listener, {
            capture: true,
          });
        state.unsubs.push(cleanup);
      }
    }

    function installSyncHandlers({
      events = ["scroll", "resize"],
      target = window,
    } = {}) {
      for (const eventName of events) {
        const listener = () => {
          if (!state.active) return;
          queueSync();
        };

        target.addEventListener(eventName, listener, {
          capture: true,
          passive: true,
        });

        const cleanup = () =>
          target.removeEventListener(eventName, listener, {
            capture: true,
          });
        state.unsubs.push(cleanup);
      }
    }

    function setRestoring(value) {
      state.restoring = !!value;
    }

    const api = {
      clearSelection,
      deactivate,
      getCurrent: () => state.current,
      installKeyHandler,
      installResetHandlers,
      installSyncHandlers,
      markNavScrolling,
      queueSync,
      setCurrent,
      setRestoring,
    };

    return api;
  }

  window.__feedScrollerShared__.jkl = {
    createController,
    createInlineRenderer,
    createOverlayRenderer,
    isTypingTarget,
    middleMostVisible,
    stopOnly,
    visibleInViewport,
  };
})();
