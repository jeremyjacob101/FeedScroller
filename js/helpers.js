(() => {
  window.__feedScrollerShared__ = window.__feedScrollerShared__ || {};

  if (window.__feedScrollerShared__.helpers) return;

  function applyCssVars(cssVars = {}) {
    const root = document.documentElement;

    for (const [propertyName, propertyValue] of Object.entries(cssVars)) {
      if (propertyValue == null || propertyValue === "") {
        root.style.removeProperty(propertyName);
      } else {
        root.style.setProperty(propertyName, propertyValue);
      }
    }
  }

  function normalizeHostname(hostname, { stripWww = false } = {}) {
    let next = String(hostname || "").trim().toLowerCase();
    if (stripWww) next = next.replace(/^www\./i, "");
    return next;
  }

  const DEFAULT_MONTH_NAMES = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  function normalizePathname(pathname = location.pathname) {
    return String(pathname || "/").replace(/\/+$/, "") || "/";
  }

  function matchesPattern(value, pattern) {
    if (!pattern) return true;
    if (value == null) return false;

    try {
      return new RegExp(pattern, "i").test(String(value));
    } catch {
      return false;
    }
  }

  function matchesLocation(match) {
    if (typeof match === "function") return !!match(location);

    const normalizedHost = normalizeHostname(location.hostname, match);
    const domains = Array.isArray(match?.domains) ? match.domains : [];
    const allowSubdomains = match?.allowSubdomains !== false;
    const pathnamePatterns = Array.isArray(match?.pathnamePatterns)
      ? match.pathnamePatterns
      : match?.pathnamePattern
        ? [match.pathnamePattern]
        : [];
    let hostMatched = domains.length === 0;

    for (const domain of domains) {
      const normalizedDomain = normalizeHostname(domain, match);
      if (!normalizedDomain) continue;
      if (normalizedHost === normalizedDomain) {
        hostMatched = true;
        break;
      }
      if (allowSubdomains && normalizedHost.endsWith(`.${normalizedDomain}`)) {
        hostMatched = true;
        break;
      }
    }

    if (!hostMatched) return false;

    if (
      pathnamePatterns.length > 0 &&
      !pathnamePatterns.some((pattern) =>
        matchesPattern(location.pathname || "/", pattern),
      )
    ) {
      return false;
    }

    return true;
  }

  function resolveMonthNames(monthNames = DEFAULT_MONTH_NAMES) {
    return Array.isArray(monthNames) && monthNames.length === 12
      ? monthNames.map((value) => String(value || "").toLowerCase())
      : DEFAULT_MONTH_NAMES.slice();
  }

  function parseMonthNamedDatePath(
    pathname,
    { pathnamePattern, monthNames = DEFAULT_MONTH_NAMES } = {},
  ) {
    const normalizedPath = normalizePathname(pathname);
    let match = null;

    try {
      match = normalizedPath.match(new RegExp(pathnamePattern, "i"));
    } catch {
      return null;
    }

    if (!match) return null;

    const [, rawMonth, rawDay, rawYear] = match;
    const resolvedMonthNames = resolveMonthNames(monthNames);
    const monthIndex = resolvedMonthNames.indexOf(
      String(rawMonth || "").toLowerCase(),
    );
    const day = Number(rawDay);
    const year = Number(rawYear);

    if (monthIndex < 0 || !Number.isInteger(day) || !Number.isInteger(year)) {
      return null;
    }

    const date = new Date(Date.UTC(year, monthIndex, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== monthIndex ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function buildMonthNamedDatePath(
    date,
    {
      monthNames = DEFAULT_MONTH_NAMES,
      pathnameTemplate = "/{month}-{day}-{year}",
    } = {},
  ) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

    const resolvedMonthNames = resolveMonthNames(monthNames);
    const monthName = resolvedMonthNames[date.getUTCMonth()];
    if (!monthName) return null;

    return String(pathnameTemplate || "/{month}-{day}-{year}")
      .replace(/\{month\}/g, monthName)
      .replace(/\{day\}/g, String(date.getUTCDate()))
      .replace(/\{year\}/g, String(date.getUTCFullYear()));
  }

  function toCalendarUtcDate(date = new Date()) {
    return new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
  }

  function compareUtcDates(left, right) {
    if (!(left instanceof Date) || Number.isNaN(left.getTime())) return 0;
    if (!(right instanceof Date) || Number.isNaN(right.getTime())) return 0;
    return left.getTime() - right.getTime();
  }

  function pathsEqual(left, right) {
    return normalizePathname(left) === normalizePathname(right);
  }

  function buildAuxiliaryStorageKey(spec, options = {}, suffix = "") {
    const baseKey =
      String(options.progressStorageKey || "").trim() ||
      String(spec?.storageKey || "").trim() ||
      "__arcJKMonthNamedDate";
    return suffix ? `${baseKey}::${suffix}` : baseKey;
  }

  function readJsonFromStorage(storageArea, key) {
    if (!storageArea || !key) return null;

    try {
      const raw = storageArea.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeJsonToStorage(storageArea, key, value) {
    if (!storageArea || !key) return false;

    try {
      storageArea.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function removeStorageValue(storageArea, key) {
    if (!storageArea || !key) return;

    try {
      storageArea.removeItem(key);
    } catch {}
  }

  function getLocalStorageArea() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function getSessionStorageArea() {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  function readSavedPathState({ options = {}, savedId, spec } = {}) {
    if (!savedId) return null;

    const state = readJsonFromStorage(
      getLocalStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "saved-path"),
    );

    if (!state || state.savedId !== savedId) return null;

    return {
      path: normalizePathname(state.path),
      savedId: state.savedId,
      updatedAt: Number(state.updatedAt) || 0,
    };
  }

  function saveSavedPathState({ options = {}, path, savedId, spec } = {}) {
    if (!savedId || !path) return false;

    return writeJsonToStorage(
      getLocalStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "saved-path"),
      {
        path: normalizePathname(path),
        savedId,
        updatedAt: Date.now(),
      },
    );
  }

  function clearSavedPathState({ options = {}, spec } = {}) {
    removeStorageValue(
      getLocalStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "saved-path"),
    );
  }

  function readNavigationState({ options = {}, savedId, spec } = {}) {
    if (!savedId) return null;

    const state = readJsonFromStorage(
      getSessionStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "navigation-state"),
    );

    if (!state || state.savedId !== savedId) return null;

    return {
      mode: String(state.mode || ""),
      savedId: state.savedId,
      savedPath: normalizePathname(state.savedPath),
      todayPath: normalizePathname(state.todayPath),
      updatedAt: Number(state.updatedAt) || 0,
    };
  }

  function saveNavigationState(
    { mode = "jump-to-saved-path", options = {}, savedId, savedPath, spec, todayPath } = {},
  ) {
    if (!savedId || !savedPath || !todayPath) return false;

    return writeJsonToStorage(
      getSessionStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "navigation-state"),
      {
        mode,
        savedId,
        savedPath: normalizePathname(savedPath),
        todayPath: normalizePathname(todayPath),
        updatedAt: Date.now(),
      },
    );
  }

  function clearNavigationState({ options = {}, spec } = {}) {
    removeStorageValue(
      getSessionStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "navigation-state"),
    );
  }

  function readSuppressRestoreState({ options = {}, spec } = {}) {
    const state = readJsonFromStorage(
      getSessionStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "suppress-restore"),
    );
    if (!state?.path) return null;

    return {
      path: normalizePathname(state.path),
      updatedAt: Number(state.updatedAt) || 0,
    };
  }

  function saveSuppressRestoreState({ options = {}, path, spec } = {}) {
    if (!path) return false;

    return writeJsonToStorage(
      getSessionStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "suppress-restore"),
      {
        path: normalizePathname(path),
        updatedAt: Date.now(),
      },
    );
  }

  function clearSuppressRestoreState({ options = {}, spec } = {}) {
    removeStorageValue(
      getSessionStorageArea(),
      buildAuxiliaryStorageKey(spec, options, "suppress-restore"),
    );
  }

  function consumeSuppressRestoreState({
    currentPath = location.pathname,
    options = {},
    spec,
  } = {}) {
    const state = readSuppressRestoreState({ options, spec });
    if (!state || !pathsEqual(state.path, currentPath)) return false;

    clearSuppressRestoreState({ options, spec });
    return true;
  }

  function getMonthNamedDateContext({ options = {}, pathname = location.pathname } = {}) {
    const pathnamePattern =
      String(options.pathnamePattern || "").trim() ||
      "^/([a-z]+)-(\\d{1,2})-(\\d{4})/?$";
    const pathnameTemplate =
      String(options.pathnameTemplate || "").trim() ||
      "/{month}-{day}-{year}";
    const monthNames = resolveMonthNames(options.monthNames);
    const currentPath = normalizePathname(pathname);
    const currentDate = parseMonthNamedDatePath(currentPath, {
      monthNames,
      pathnamePattern,
    });
    const todayDate = toCalendarUtcDate(new Date());
    const todayPath = normalizePathname(
      buildMonthNamedDatePath(todayDate, {
        monthNames,
        pathnameTemplate,
      }) || "/",
    );

    return {
      currentDate,
      currentPath,
      monthNames,
      pathnamePattern,
      pathnameTemplate,
      todayDate,
      todayPath,
      trailingSlash: options.trailingSlash !== false,
    };
  }

  function buildRelativeMonthNamedDatePath(
    date,
    deltaDays,
    { monthNames, pathnameTemplate } = {},
  ) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

    const nextDate = new Date(date.getTime());
    nextDate.setUTCDate(nextDate.getUTCDate() + deltaDays);
    return buildMonthNamedDatePath(nextDate, {
      monthNames,
      pathnameTemplate,
    });
  }

  function normalizeNavigablePath(pathname, { trailingSlash = false } = {}) {
    const normalized = normalizePathname(pathname);
    if (normalized === "/") return "/";
    return trailingSlash ? `${normalized}/` : normalized;
  }

  function navigateToMonthNamedPath(pathname, { trailingSlash = false } = {}) {
    if (!pathname) return false;

    location.assign(
      `${location.origin}${normalizeNavigablePath(pathname, { trailingSlash })}`,
    );
    return true;
  }

  function ensureCollapseStyles() {
    const styleId = "__arc_jk_collapsible_item_styles__";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
.__arc_jk_collapsible_header__ {
  align-items: flex-start;
  display: flex;
  gap: 8px;
  justify-content: space-between;
}
.__arc_jk_collapsible_header__ > *:first-child {
  flex: 1 1 auto;
  min-width: 0;
}
.__arc_jk_collapsible_toggle__ {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  line-height: 1;
  margin: 0;
  opacity: 0.76;
  padding: 0;
}
.__arc_jk_collapsible_toggle__:hover {
  opacity: 1;
}
.__arc_jk_collapsible_toggle_label__ {
  display: inline-block;
  font-size: 14px;
}
.__arc_jk_collapsible_body__ {
  margin-top: 8px;
  overflow: hidden;
  transform: translateY(0);
  transition-property: max-height, opacity, transform, margin-top;
  transition-timing-function: ease;
  will-change: max-height, opacity, transform;
}
.__arc_jk_collapsible_body__[data-collapsed="1"] {
  margin-top: 0;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
}
.__arc_jk_collapsible_body__[data-collapsed="0"] {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
`;

    document.head.appendChild(style);
  }

  function setCollapsedState(
    wrapper,
    toggleButton,
    expanded,
    { collapsedLabel, expandedLabel, immediate = false, transitionMs = 220 } = {},
  ) {
    if (!wrapper || !toggleButton) return;

    const nextExpanded = !!expanded;
    const targetHeight = `${Math.max(wrapper.scrollHeight, 1)}px`;

    wrapper.style.transitionDuration = `${Math.max(0, Number(transitionMs) || 220)}ms`;
    wrapper.dataset.collapsed = nextExpanded ? "0" : "1";
    wrapper.style.maxHeight = nextExpanded
      ? targetHeight
      : immediate
        ? "0px"
        : wrapper.style.maxHeight || targetHeight;

    toggleButton.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
    toggleButton.setAttribute(
      "title",
      nextExpanded
        ? toggleButton.dataset.expandedTitle || "Hide content"
        : toggleButton.dataset.collapsedTitle || "Show content",
    );

    const labelEl =
      toggleButton.querySelector(".__arc_jk_collapsible_toggle_label__") ||
      toggleButton;
    labelEl.textContent = nextExpanded
      ? expandedLabel || "▾"
      : collapsedLabel || "▸";

    if (nextExpanded || immediate) {
      wrapper.style.maxHeight = nextExpanded ? targetHeight : "0px";
      return;
    }

    requestAnimationFrame(() => {
      wrapper.dataset.collapsed = "1";
      wrapper.style.maxHeight = "0px";
    });
  }

  function createCollapseToggleButton(options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "__arc_jk_collapsible_toggle__";
    button.dataset.collapsedTitle =
      String(options.toggleTitleCollapsed || "").trim() || "Show content";
    button.dataset.expandedTitle =
      String(options.toggleTitleExpanded || "").trim() || "Hide content";

    const label = document.createElement("span");
    label.className = "__arc_jk_collapsible_toggle_label__";
    label.textContent =
      String(options.toggleCollapsedLabel || "").trim() || "▸";
    button.appendChild(label);

    return button;
  }

  function ensureCollapseWrapper(item, contentParent) {
    if (!item || !contentParent) return null;

    let wrapper = contentParent.querySelector(
      ':scope > .__arc_jk_collapsible_body__[data-arc-jk-collapse="1"]',
    );
    if (wrapper && document.contains(wrapper)) return wrapper;

    wrapper = document.createElement("div");
    wrapper.className = "__arc_jk_collapsible_body__";
    wrapper.dataset.arcJkCollapse = "1";
    wrapper.dataset.collapsed = "1";
    return wrapper;
  }

  function syncFollowingSiblingCollapse(item, options = {}) {
    if (!item || !options.headerXPath || !options.hideFollowingSiblingsOfHeader) {
      return;
    }

    const header = evalXPathFirst(options.headerXPath, item);
    if (!header || !header.parentElement) return;

    const contentParent = options.contentContainerXPath
      ? evalXPathFirst(options.contentContainerXPath, item)
      : header.parentElement;
    if (!contentParent || header.parentElement !== contentParent) return;

    ensureCollapseStyles();

    const wrapper = ensureCollapseWrapper(item, contentParent);
    if (!wrapper) return;

    if (wrapper.parentNode !== contentParent) {
      contentParent.insertBefore(wrapper, header.nextSibling);
    }

    let node = header.nextSibling;
    while (node) {
      const nextSibling = node.nextSibling;
      if (node !== wrapper) {
        wrapper.appendChild(node);
      }
      node = nextSibling;
    }

    if (!wrapper.childNodes.length) {
      wrapper.remove();
      const orphanToggle = header.querySelector(
        ':scope > .__arc_jk_collapsible_toggle__[data-arc-jk-collapse="1"]',
      );
      orphanToggle?.remove();
      return;
    }

    header.classList.add("__arc_jk_collapsible_header__");

    let toggleButton = header.querySelector(
      ':scope > .__arc_jk_collapsible_toggle__[data-arc-jk-collapse="1"]',
    );
    if (!toggleButton) {
      toggleButton = createCollapseToggleButton(options);
      toggleButton.dataset.arcJkCollapse = "1";
      header.appendChild(toggleButton);
    }

    const expanded = item.dataset.arcJkCollapseExpanded === "1";
    setCollapsedState(wrapper, toggleButton, expanded, {
      collapsedLabel: options.toggleCollapsedLabel,
      expandedLabel: options.toggleExpandedLabel,
      immediate: item.dataset.arcJkCollapseReady !== "1",
      transitionMs: options.transitionMs,
    });

    toggleButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isExpanded = item.dataset.arcJkCollapseExpanded === "1";
      const nextExpanded = !isExpanded;
      item.dataset.arcJkCollapseExpanded = nextExpanded ? "1" : "0";
      setCollapsedState(wrapper, toggleButton, nextExpanded, {
        collapsedLabel: options.toggleCollapsedLabel,
        expandedLabel: options.toggleExpandedLabel,
        transitionMs: options.transitionMs,
      });
    };

    if (item.dataset.arcJkCollapseReady !== "1") {
      item.dataset.arcJkCollapseExpanded =
        options.startCollapsed === false ? "1" : "0";
      setCollapsedState(
        wrapper,
        toggleButton,
        item.dataset.arcJkCollapseExpanded === "1",
        {
          collapsedLabel: options.toggleCollapsedLabel,
          expandedLabel: options.toggleExpandedLabel,
          immediate: true,
          transitionMs: options.transitionMs,
        },
      );
    } else if (item.dataset.arcJkCollapseExpanded === "1") {
      wrapper.style.maxHeight = `${Math.max(wrapper.scrollHeight, 1)}px`;
    }

    item.dataset.arcJkCollapseReady = "1";
  }

  function applyCollapseNonHeaderContent({ items = [], options = {} } = {}) {
    if (!Array.isArray(items) || !items.length) return;
    if (!options?.headerXPath || !options?.hideFollowingSiblingsOfHeader) return;

    for (const item of items) {
      syncFollowingSiblingCollapse(item, options);
    }
  }

  function loadSessionState(sessionKey, savedId) {
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return null;

      const state = JSON.parse(raw);
      if (!state || state.savedId !== savedId) return null;
      if (!Array.isArray(state.visitedPaths)) return null;

      return {
        hops: Number(state.hops) || 0,
        savedId: state.savedId,
        startPath: normalizePathname(state.startPath),
        visitedPaths: state.visitedPaths.map((value) =>
          normalizePathname(value),
        ),
      };
    } catch {
      return null;
    }
  }

  function saveSessionState(sessionKey, state) {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function clearSessionState(sessionKey) {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {}
  }

  const loadMoreClickStateByKey = Object.create(null);

  function tryClickLoadMoreButton({
    controller,
    currentPath = location.pathname,
    loadMoreButtonXPaths = [],
    loadMoreClickThrottleMs = 900,
    sessionKey = "__arcJKLoadMore__",
  } = {}) {
    if (!Array.isArray(loadMoreButtonXPaths) || !loadMoreButtonXPaths.length) {
      return false;
    }

    const loadMoreButton = loadMoreButtonXPaths
      .map((xpath) => evalXPathFirst(xpath))
      .find(Boolean);

    if (!loadMoreButton) return false;

    const clickStateKey = `${sessionKey}::${normalizePathname(currentPath)}`;
    const clickState = loadMoreClickStateByKey[clickStateKey] || {
      lastClickedAt: 0,
    };

    if (!isClickable(loadMoreButton)) {
      loadMoreClickStateByKey[clickStateKey] = clickState;
      return true;
    }

    if (Date.now() - clickState.lastClickedAt >= loadMoreClickThrottleMs) {
      controller?.markNavScrolling?.();
      loadMoreButton.scrollIntoView?.({
        block: "center",
        inline: "nearest",
      });
      loadMoreButton.click?.();
      clickState.lastClickedAt = Date.now();
    }

    loadMoreClickStateByKey[clickStateKey] = clickState;
    return true;
  }

  function navigateToPreviousMonthNamedDay({
    currentDate,
    currentPath,
    maxBackDays = 90,
    monthNames = DEFAULT_MONTH_NAMES,
    pathnameTemplate = "/{month}-{day}-{year}",
    savedId,
    sessionKey,
    trailingSlash = true,
  } = {}) {
    if (!currentDate || !savedId || !sessionKey) return true;

    const previousDate = new Date(currentDate.getTime());
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);

    const previousPath = buildMonthNamedDatePath(previousDate, {
      monthNames,
      pathnameTemplate,
    });
    if (!previousPath) return true;

    let state = loadSessionState(sessionKey, savedId);
    if (!state) {
      state = {
        hops: 0,
        savedId,
        startPath: currentPath,
        visitedPaths: [currentPath],
      };
    } else if (currentPath === state.startPath) {
      state = {
        hops: 0,
        savedId,
        startPath: currentPath,
        visitedPaths: [currentPath],
      };
    } else if (currentPath !== state.visitedPaths[state.visitedPaths.length - 1]) {
      if (state.visitedPaths.includes(currentPath)) {
        clearSessionState(sessionKey);
        return true;
      }

      state = {
        hops: 0,
        savedId,
        startPath: currentPath,
        visitedPaths: [currentPath],
      };
    }

    if (state.hops >= maxBackDays || state.visitedPaths.includes(previousPath)) {
      clearSessionState(sessionKey);
      return true;
    }

    state.hops += 1;
    state.visitedPaths.push(previousPath);

    if (!saveSessionState(sessionKey, state)) {
      clearSessionState(sessionKey);
      return true;
    }

    navigateToMonthNamedPath(previousPath, { trailingSlash });
    return true;
  }

  function getMonthNamedNavRootId(spec, options = {}) {
    return (
      String(options.navRootId || "").trim() ||
      `__arc_jk_month_named_nav__${String(spec?.name || "site").replace(
        /[^a-z0-9_-]+/gi,
        "_",
      )}`
    );
  }

  function ensureMonthNamedNavStyles() {
    const styleId = "__arc_jk_month_named_nav_styles__";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
#__arc_jk_month_named_nav_wrap__ {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483647;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: min(92vw, 540px);
}
#__arc_jk_month_named_nav_wrap__ button {
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #111;
  cursor: pointer;
  font: 600 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  padding: 9px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
#__arc_jk_month_named_nav_wrap__ button:hover:not(:disabled) {
  background: #fff;
}
#__arc_jk_month_named_nav_wrap__ button:disabled {
  cursor: default;
  opacity: 0.45;
}
#__arc_jk_month_named_nav_wrap__ button[data-kind="today"] {
  background: #111;
  border-color: #111;
  color: #fff;
}
`;

    document.head.appendChild(style);
  }

  function ensureMonthNamedNavRoot(spec, options = {}) {
    ensureMonthNamedNavStyles();

    const rootId = getMonthNamedNavRootId(spec, options);
    let root = document.getElementById(rootId);
    if (root && document.contains(root)) return root;

    root = document.createElement("div");
    root.id = rootId;
    root.setAttribute("data-arc-jk", "month-named-nav");
    root.innerHTML = '<div id="__arc_jk_month_named_nav_wrap__"></div>';
    document.body.appendChild(root);
    return root;
  }

  function renderMonthNamedNavButtons({
    currentDate,
    currentPath,
    navigationState = null,
    options = {},
    savedPath = "",
    spec,
    todayDate,
    todayPath,
  } = {}) {
    if (!document.body || !currentDate || !todayDate) return;

    const root = ensureMonthNamedNavRoot(spec, options);
    const wrap =
      root.querySelector("#__arc_jk_month_named_nav_wrap__") || root;
    wrap.textContent = "";

    const previousPath = buildRelativeMonthNamedDatePath(currentDate, -1, {
      monthNames: resolveMonthNames(options.monthNames),
      pathnameTemplate:
        String(options.pathnameTemplate || "").trim() ||
        "/{month}-{day}-{year}",
    });
    const nextPath = buildRelativeMonthNamedDatePath(currentDate, +1, {
      monthNames: resolveMonthNames(options.monthNames),
      pathnameTemplate:
        String(options.pathnameTemplate || "").trim() ||
        "/{month}-{day}-{year}",
    });
    const nextDate = new Date(currentDate.getTime());
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    function appendButton({
      disabled = false,
      kind = "nav",
      label,
      onClick,
    } = {}) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label || "";
      button.disabled = !!disabled;
      button.dataset.kind = kind;

      if (!disabled && typeof onClick === "function") {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        });
      }

      wrap.appendChild(button);
    }

    function navigateByButton(targetPath) {
      if (!targetPath) return;

      if (!savedPath || !pathsEqual(targetPath, savedPath)) {
        saveSuppressRestoreState({
          options,
          path: targetPath,
          spec,
        });
      }

      navigateToMonthNamedPath(targetPath, {
        trailingSlash: options.trailingSlash !== false,
      });
    }

    appendButton({
      disabled: !previousPath,
      label: "Previous day",
      onClick: () => navigateByButton(previousPath),
    });

    appendButton({
      disabled:
        !nextPath || compareUtcDates(nextDate, todayDate) > 0,
      label: "Next day",
      onClick: () => navigateByButton(nextPath),
    });

    const todayTargetPath = normalizePathname(
      navigationState?.todayPath || todayPath,
    );

    appendButton({
      kind: "today",
      label: "Take me to today",
      onClick: () => {
        clearNavigationState({ options, spec });

        if (pathsEqual(currentPath, todayTargetPath)) {
          window.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
          return;
        }

        saveSuppressRestoreState({
          options,
          path: todayTargetPath,
          spec,
        });
        navigateToMonthNamedPath(todayTargetPath, {
          trailingSlash: options.trailingSlash !== false,
        });
      },
    });
  }

  const afterSyncHandlers = {
    monthNamedDateNavigation({
      items = [],
      options = {},
      savedId,
      spec,
    } = {}) {
      const page = getMonthNamedDateContext({ options });
      if (!page.currentDate) return;

      if (!savedId) {
        clearSavedPathState({ options, spec });
        clearNavigationState({ options, spec });
      } else {
        const currentPageHasSavedItem = items.some(
          (item) => (item?.dataset?.arcJkId || "") === savedId,
        );

        if (currentPageHasSavedItem) {
          saveSavedPathState({
            options,
            path: page.currentPath,
            savedId,
            spec,
          });

          const navigationState = readNavigationState({ options, savedId, spec });
          if (
            navigationState &&
            !pathsEqual(navigationState.savedPath, page.currentPath)
          ) {
            saveNavigationState({
              mode: navigationState.mode || "jump-to-saved-path",
              options,
              savedId,
              savedPath: page.currentPath,
              spec,
              todayPath: navigationState.todayPath,
            });
          }
        }
      }

      const savedPathState = readSavedPathState({ options, savedId, spec });
      const navigationState = readNavigationState({ options, savedId, spec });

      renderMonthNamedNavButtons({
        currentDate: page.currentDate,
        currentPath: page.currentPath,
        navigationState,
        options,
        savedPath: savedPathState?.path || "",
        spec,
        todayDate: page.todayDate,
        todayPath: page.todayPath,
      });
    },
  };

  const restoreMissingItemHandlers = {
    monthNamedDateSavedPath({ controller, options = {}, savedId, spec } = {}) {
      const sessionKey =
        String(options.sessionKey || "").trim() ||
        "__arcJKRestorePreviousDay__";
      const loadMoreButtonXPaths = Array.isArray(options.loadMoreButtonXPaths)
        ? options.loadMoreButtonXPaths
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        : String(options.loadMoreButtonXPath || "").trim()
          ? [String(options.loadMoreButtonXPath || "").trim()]
          : [];
      const loadMoreClickThrottleMs = Math.max(
        0,
        Number(options.loadMoreClickThrottleMs) || 900,
      );
      const maxBackDays = Math.max(1, Number(options.maxBackDays) || 90);
      const page = getMonthNamedDateContext({ options });

      if (!page.currentDate) {
        clearSessionState(sessionKey);
        return true;
      }

      if (
        consumeSuppressRestoreState({
          currentPath: page.currentPath,
          options,
          spec,
        })
      ) {
        clearSessionState(sessionKey);
        window.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
        return true;
      }

      if (!savedId) {
        clearSessionState(sessionKey);
        return true;
      }

      const savedPathState = readSavedPathState({ options, savedId, spec });
      const savedPath =
        savedPathState &&
        matchesPattern(savedPathState.path, page.pathnamePattern)
          ? normalizePathname(savedPathState.path)
          : "";

      if (savedPath) {
        clearSessionState(sessionKey);

        if (pathsEqual(page.currentPath, page.todayPath) && !pathsEqual(savedPath, page.currentPath)) {
          saveNavigationState({
            options,
            savedId,
            savedPath,
            spec,
            todayPath: page.currentPath,
          });
          navigateToMonthNamedPath(savedPath, {
            trailingSlash: page.trailingSlash,
          });
          return true;
        }

        if (pathsEqual(page.currentPath, savedPath)) {
          const foundLoadMore = tryClickLoadMoreButton({
            controller,
            currentPath: page.currentPath,
            loadMoreButtonXPaths,
            loadMoreClickThrottleMs,
            sessionKey,
          });
          return foundLoadMore ? false : true;
        }

        if (!pathsEqual(page.currentPath, page.todayPath)) {
          return true;
        }
      }

      if (!pathsEqual(page.currentPath, page.todayPath)) {
        clearSessionState(sessionKey);
        return true;
      }

      const foundLoadMore = tryClickLoadMoreButton({
        controller,
        currentPath: page.currentPath,
        loadMoreButtonXPaths,
        loadMoreClickThrottleMs,
        sessionKey,
      });
      if (foundLoadMore) return false;

      return navigateToPreviousMonthNamedDay({
        currentDate: page.currentDate,
        currentPath: page.currentPath,
        maxBackDays,
        monthNames: page.monthNames,
        pathnameTemplate: page.pathnameTemplate,
        savedId,
        sessionKey,
        trailingSlash: page.trailingSlash,
      });
    },
  };

  restoreMissingItemHandlers.previousDayMonthNamedPath =
    restoreMissingItemHandlers.monthNamedDateSavedPath;

  function evalXPathFirst(path, root = document) {
    try {
      const result = document.evaluate(
        path,
        root,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      return result.singleNodeValue || null;
    } catch {
      return null;
    }
  }

  function evalXPathSnapshot(path, root = document) {
    try {
      return document.evaluate(
        path,
        root,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
    } catch {
      return null;
    }
  }

  function snapshotToArray(snapshot) {
    if (!snapshot) return [];

    const items = [];
    for (let index = 0; index < snapshot.snapshotLength; index += 1) {
      const node = snapshot.snapshotItem(index);
      if (node && node.nodeType === 1) items.push(node);
    }
    return items;
  }

  function normalizeHref(href) {
    if (!href) return null;

    try {
      const url = new URL(href, location.origin);
      return url.pathname + (url.search || "");
    } catch {
      return null;
    }
  }

  function parseRgb(color) {
    const match = String(color || "").match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;

    const channels = match[1]
      .split(",")
      .slice(0, 3)
      .map((value) => Number.parseFloat(value.trim()));

    return channels.some((value) => Number.isNaN(value)) ? null : channels;
  }

  function colorChannelsMeetMinimum(color, minChannel = 235) {
    const rgb = parseRgb(color);
    if (!rgb) return false;
    return rgb.every((channel) => channel >= minChannel);
  }

  function indicatorLooksActive(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rgb = parseRgb(style.backgroundColor);
    const opacity = Number.parseFloat(style.opacity || "1");
    return !!rgb && opacity > 0.05 && rgb.some((channel) => channel > 0);
  }

  function isClickable(el) {
    if (!el) return false;
    if (
      el.hasAttribute("aria-disabled") &&
      el.getAttribute("aria-disabled") === "true"
    ) {
      return false;
    }
    if (el.classList.contains("disabled")) return false;
    if (el.getAttribute("disabled") != null) return false;
    return true;
  }

  function trimmedText(value) {
    return String(value || "").trim();
  }

  function firstNonEmpty(values = []) {
    for (const value of values) {
      if (trimmedText(value)) return trimmedText(value);
    }
    return "";
  }

  function getLastElementChild(el) {
    if (!el) return null;
    const children = Array.from(el.children || []);
    return children.length ? children[children.length - 1] : null;
  }

  window.__feedScrollerShared__.helpers = {
    applyCssVars,
    applyCollapseNonHeaderContent,
    afterSyncHandlers,
    colorChannelsMeetMinimum,
    evalXPathFirst,
    evalXPathSnapshot,
    firstNonEmpty,
    getLastElementChild,
    indicatorLooksActive,
    isClickable,
    matchesLocation,
    matchesPattern,
    normalizePathname,
    normalizeHostname,
    normalizeHref,
    parseRgb,
    parseMonthNamedDatePath,
    buildMonthNamedDatePath,
    compareUtcDates,
    restoreMissingItemHandlers,
    snapshotToArray,
    toCalendarUtcDate,
    trimmedText,
  };
})();
