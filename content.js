(() => {
  // ============================================================
  // Unified router for one content.js across all 3 sites
  // (scrolling / J-K-L / progress save+restore only)
  // ============================================================
  if (window.__arcUnifiedJKInstalled__) return;
  window.__arcUnifiedJKInstalled__ = true;

  const ROUTER_DEBUG = false;
  const rlog = (...args) => {
    if (ROUTER_DEBUG) console.log("[arc-router]", ...args);
  };

  const normalizeHost = () =>
    location.hostname.replace(/^www\./i, "").toLowerCase();
  const normalizedPath = () => location.pathname.replace(/\/+$/, "") || "/";

  const isLetterboxdHost = () =>
    /(^|\.)letterboxd\.com$/i.test(location.hostname);
  const isXHost = () =>
    /(^|\.)x\.com$/i.test(location.hostname) ||
    /(^|\.)twitter\.com$/i.test(location.hostname);
  const isBskyHost = () => /^bsky\.app$/i.test(normalizeHost());

  function dispatchByRoute() {
    const host = normalizeHost();
    const path = normalizedPath();
    rlog("dispatch", { host, path, href: location.href });

    if (isLetterboxdHost()) {
      installLetterboxdActivityModule();
      return;
    }

    if (isXHost()) {
      installXModule();
      return;
    }

    if (isBskyHost()) {
      installBskyModule();
      return;
    }
  }

  // SPA URL change detection
  let __arcRouterLastHref = location.href;

  function onUrlMaybeChanged() {
    if (location.href === __arcRouterLastHref) return;
    __arcRouterLastHref = location.href;
    rlog("url changed", location.href);
    setTimeout(dispatchByRoute, 50);
  }

  try {
    const _pushState = history.pushState;
    const _replaceState = history.replaceState;

    history.pushState = function (...args) {
      const ret = _pushState.apply(this, args);
      onUrlMaybeChanged();
      return ret;
    };

    history.replaceState = function (...args) {
      const ret = _replaceState.apply(this, args);
      onUrlMaybeChanged();
      return ret;
    };
  } catch {}

  window.addEventListener("popstate", onUrlMaybeChanged, true);
  window.addEventListener("hashchange", onUrlMaybeChanged, true);

  // Fallback for weird SPA transitions
  const routerMo = new MutationObserver(() => {
    onUrlMaybeChanged();

    // Also give modules extra chances to install on SPA swaps even if href doesn't change
    if (isLetterboxdHost() || isXHost() || isBskyHost()) {
      dispatchByRoute();
    }
  });
  routerMo.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial dispatch
  dispatchByRoute();

  // ============================================================
  // Letterboxd /activity module (J/K/L + progress + restore)
  // ============================================================
  function installLetterboxdActivityModule() {
    (() => {
      const DEBUG = false;

      const hostIsLetterboxd = () =>
        /(^|\.)letterboxd\.com$/i.test(location.hostname);
      const normalizedPath = () => location.pathname.replace(/\/+$/, ""); // "/activity/" -> "/activity"
      const isActivityRoute = () =>
        hostIsLetterboxd() && normalizedPath() === "/activity";

      const dlog = (...args) => {
        if (DEBUG) console.log("[arc-boost]", ...args);
      };

      // Runs ONLY on: /activity
      if (!isActivityRoute()) return;

      // Prevent double-inject (Arc Boosts can re-run on soft navigations)
      if (window.__arcJKLetterboxdXPathInstalled) return;
      window.__arcJKLetterboxdXPathInstalled = true;

      dlog("activity: installing on", location.href);

      const HIGHLIGHT_CLASS = "__arc_jk_selected__";
      const PROGRESS_BOX_CLASS = "__arc_jk_progress_box__";
      const ITEM_CLASS = "__arc_jk_item__";

      const MIN_ITEM_HEIGHT = 24;
      const NAV_SCROLL_GRACE_MS = 700;

      const STORAGE_KEY = "arc-jk-letterboxd-progress-activity-id-v1";

      const POSTS_XPATH_BASE =
        "/html/body/div[1]/div/div/section/div[2]/div/section";
      const POSTS_CONTAINER_XPATH =
        "/html/body/div[1]/div/div/section/div[2]/div";
      const LOAD_MORE_BTN_XPATH =
        "/html/body/div[1]/div/div/section/div[3]/div/a";

      const RESTORE_MAX_STEPS = 260;
      const RESTORE_TICK_MS = 260;
      const STUCK_LIMIT = 12;

      const style = document.createElement("style");
      style.textContent = `
        .${HIGHLIGHT_CLASS} {
          outline: 2px solid rgba(29, 155, 240, 0.95);
          outline-offset: 2px;
          border-radius: 8px;
          scroll-margin-top: 25vh;
          scroll-margin-bottom: 25vh;
        }

        .${ITEM_CLASS} { position: relative; overflow: visible !important; }

        .${PROGRESS_BOX_CLASS} {
          position: absolute;
          left: -24px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          margin: 0;
          cursor: pointer;
          z-index: 999999;
          opacity: 0.18;
          transition: opacity 120ms ease;
          accent-color: rgba(29, 155, 240, 0.95);
          appearance: auto;
          pointer-events: auto !important;
        }

        .${ITEM_CLASS}:hover .${PROGRESS_BOX_CLASS},
        .${HIGHLIGHT_CLASS} .${PROGRESS_BOX_CLASS} {
          opacity: 1;
        }
      `;
      document.documentElement.appendChild(style);

      let current = null;

      let navScrolling = false;
      let navScrollTimer = null;

      let restoring = false;

      let feedObserver = null;

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

      function visibleInViewport(el) {
        const r = el.getBoundingClientRect();
        if (r.height < MIN_ITEM_HEIGHT) return false;
        return r.bottom > 0 && r.top < window.innerHeight;
      }

      function ensureFocusable(el) {
        if (!el) return;
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      }

      function clearHighlight() {
        if (current) current.classList.remove(HIGHLIGHT_CLASS);
      }

      function resetSelection() {
        clearHighlight();
        current = null;
      }

      function setCurrent(el, { preventScroll = false } = {}) {
        if (!el) return;

        clearHighlight();
        current = el;
        current.classList.add(HIGHLIGHT_CLASS);

        ensureFocusable(current);
        current.focus?.({ preventScroll: true });

        navScrolling = true;
        if (navScrollTimer) clearTimeout(navScrollTimer);
        navScrollTimer = setTimeout(() => {
          navScrolling = false;
        }, NAV_SCROLL_GRACE_MS);

        if (!preventScroll) {
          current.scrollIntoView({ block: "center", inline: "nearest" });
        }

        updateProgressCheckboxes();
      }

      function evalXPathFirst(path, root = document) {
        try {
          const res = document.evaluate(
            path,
            root,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          );
          return res.singleNodeValue || null;
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

      function findPostsContainer() {
        return evalXPathFirst(POSTS_CONTAINER_XPATH);
      }

      function getItems() {
        const snap = evalXPathSnapshot(POSTS_XPATH_BASE);
        if (!snap) return [];
        const items = [];
        for (let i = 0; i < snap.snapshotLength; i++) {
          const n = snap.snapshotItem(i);
          if (n && n.nodeType === 1) items.push(n);
        }
        return items;
      }

      function middleMostVisible(items) {
        const midY = window.innerHeight / 2;
        let best = null;
        let bestDist = Infinity;

        for (const el of items) {
          if (!visibleInViewport(el)) continue;
          const r = el.getBoundingClientRect();
          const cY = r.top + r.height / 2;
          const d = Math.abs(cY - midY);
          if (d < bestDist) {
            bestDist = d;
            best = el;
          }
        }
        return best;
      }

      function getItemId(itemEl) {
        if (!itemEl) return null;
        const id =
          itemEl.getAttribute("data-activity-id") || itemEl.dataset.activityId;
        return id ? String(id) : null;
      }

      function loadProgressId() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw && typeof raw === "string" ? raw : null;
      }

      function saveProgressId(id) {
        if (!id) return;
        localStorage.setItem(STORAGE_KEY, id);
      }

      function clearProgressId() {
        localStorage.removeItem(STORAGE_KEY);
      }

      function ensureProgressUI(itemEl) {
        if (!itemEl || itemEl.nodeType !== 1) return;

        if (!itemEl.classList.contains(ITEM_CLASS))
          itemEl.classList.add(ITEM_CLASS);

        if (itemEl.querySelector(`:scope > input.${PROGRESS_BOX_CLASS}`))
          return;

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = PROGRESS_BOX_CLASS;
        cb.title = "Mark progress (L)";
        cb.tabIndex = -1;

        const stopOnly = (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation?.();
        };

        cb.addEventListener("pointerdown", stopOnly, true);
        cb.addEventListener("mousedown", stopOnly, true);
        cb.addEventListener("click", stopOnly, true);

        cb.addEventListener(
          "change",
          (e) => {
            stopOnly(e);

            const item = cb.closest(`.${ITEM_CLASS}`) || cb.parentElement;
            if (!item) return;

            const id = item.dataset.arcJkId || getItemId(item);
            if (!id) {
              cb.checked = false;
              return;
            }

            item.dataset.arcJkId = id;

            if (cb.checked) saveProgressId(id);
            else if (loadProgressId() === id) clearProgressId();

            updateProgressCheckboxes();
            setCurrent(item, { preventScroll: true });
            cb.blur?.();
          },
          true,
        );

        itemEl.appendChild(cb);
      }

      function updateProgressCheckboxes() {
        const saved = loadProgressId();
        const items = getItems();

        for (const item of items) {
          ensureProgressUI(item);

          const id = getItemId(item) || "";
          item.dataset.arcJkId = id;

          const cb = item.querySelector(`:scope > input.${PROGRESS_BOX_CLASS}`);
          if (!cb) continue;

          if (!id) {
            cb.checked = false;
            cb.disabled = true;
            cb.style.display = "none";
            continue;
          }

          cb.disabled = false;
          cb.style.display = "";
          cb.checked = !!saved && saved === id;
        }
      }

      function toggleProgressForItem(itemEl) {
        const el = itemEl || current;
        if (!el) return;

        const id = el.dataset.arcJkId || getItemId(el);
        if (!id) return;

        const saved = loadProgressId();
        if (saved === id) clearProgressId();
        else saveProgressId(id);

        updateProgressCheckboxes();
      }

      function startObservingFeed() {
        const container = findPostsContainer();
        if (!container) return;
        if (feedObserver) return;

        feedObserver = new MutationObserver(() => {
          updateProgressCheckboxes();
        });

        feedObserver.observe(container, { childList: true, subtree: false });
      }

      function move(dir) {
        startObservingFeed();

        const items = getItems();
        if (!items.length) return;

        for (const el of items) ensureProgressUI(el);
        updateProgressCheckboxes();

        const mid = middleMostVisible(items) || items[0];

        if (
          !current ||
          !document.contains(current) ||
          !visibleInViewport(current)
        ) {
          setCurrent(mid);
          return;
        }

        const idx = items.indexOf(current);
        if (idx === -1) {
          setCurrent(mid);
          return;
        }

        const nextIdx = Math.max(0, Math.min(items.length - 1, idx + dir));
        setCurrent(items[nextIdx]);
      }

      window.addEventListener(
        "wheel",
        () => {
          if (!navScrolling && !restoring) resetSelection();
        },
        { passive: true, capture: true },
      );

      window.addEventListener(
        "touchstart",
        () => {
          if (!navScrolling && !restoring) resetSelection();
        },
        { passive: true, capture: true },
      );

      window.addEventListener(
        "scroll",
        () => {
          if (!navScrolling && !restoring) resetSelection();
        },
        { passive: true, capture: true },
      );

      function findLoadMoreButton() {
        return evalXPathFirst(LOAD_MORE_BTN_XPATH);
      }

      function isClickable(el) {
        if (!el) return false;
        if (
          el.hasAttribute("aria-disabled") &&
          el.getAttribute("aria-disabled") === "true"
        )
          return false;
        if (el.classList.contains("disabled")) return false;
        if (el.getAttribute("disabled") != null) return false;
        return true;
      }

      function scrollToBottomInstant() {
        const h =
          document.documentElement.scrollHeight || document.body.scrollHeight;

        navScrolling = true;
        if (navScrollTimer) clearTimeout(navScrollTimer);
        navScrollTimer = setTimeout(() => {
          navScrolling = false;
        }, NAV_SCROLL_GRACE_MS);

        window.scrollTo({ top: h, left: 0, behavior: "auto" });
        window.scrollBy(0, -1);
        window.scrollBy(0, +1);
      }

      let lastClickedSig = "";
      let lastClickAt = 0;

      function tryLoadMore() {
        scrollToBottomInstant();

        const btn = findLoadMoreButton();
        if (!btn || !isClickable(btn)) return false;

        const sig = btn.getAttribute("href") || btn.textContent || "btn";
        const now = Date.now();

        if (sig === lastClickedSig && now - lastClickAt < 900) return true;

        lastClickedSig = sig;
        lastClickAt = now;

        btn.click();
        return true;
      }

      function findItemBySavedId(savedId) {
        if (!savedId) return null;
        const items = getItems();
        for (const item of items) {
          const id = item.dataset.arcJkId || getItemId(item);
          if (id && id === savedId) return item;
        }
        return null;
      }

      function getLastItemSignature() {
        const items = getItems();
        if (!items.length) return "";
        const last = items[items.length - 1];
        return getItemId(last) || String(items.length);
      }

      function restoreProgressIfAny() {
        const savedId = loadProgressId();
        if (!savedId) return;

        restoring = true;

        let steps = 0;
        let stuckCount = 0;
        let lastSig = "";

        const tick = () => {
          if (!isActivityRoute()) {
            restoring = false;
            return;
          }

          updateProgressCheckboxes();

          const found = findItemBySavedId(savedId);
          if (found) {
            setCurrent(found);
            restoring = false;
            return;
          }

          steps += 1;
          if (steps > RESTORE_MAX_STEPS) {
            restoring = false;
            return;
          }

          const sig = getLastItemSignature();
          if (sig && sig === lastSig) stuckCount += 1;
          else stuckCount = 0;
          lastSig = sig;

          const didLoad = tryLoadMore();

          if (!didLoad && stuckCount >= STUCK_LIMIT) {
            restoring = false;
            return;
          }

          setTimeout(tick, RESTORE_TICK_MS);
        };

        setTimeout(tick, 60);
      }

      document.addEventListener(
        "keydown",
        (e) => {
          if (!isActivityRoute()) return;

          const key = (e.key || "").toLowerCase();

          if (key === "j" || key === "k") {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (isTypingTarget(document.activeElement)) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            move(key === "j" ? +1 : -1);
            return;
          }

          if (key === "l") {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (isTypingTarget(document.activeElement)) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            if (
              !current ||
              !document.contains(current) ||
              !visibleInViewport(current)
            ) {
              const items = getItems();
              const mid = middleMostVisible(items) || items[0];
              if (mid) setCurrent(mid);
            }

            if (current) toggleProgressForItem(current);
          }
        },
        true,
      );

      startObservingFeed();
      updateProgressCheckboxes();
      restoreProgressIfAny();
    })();
  }

  // ============================================================
  // X.com module (Movies tab J/K/L + progress + restore)
  // ============================================================
  function installXModule() {
    (() => {
      // Prevent double-inject
      if (window.__arcJKBoostInstalled_X) return;
      window.__arcJKBoostInstalled_X = true;

      const KEY_SINK_ID = "__arc_jk_key_sink__";
      const STORAGE_KEY = "arc-jk-progress-x-status-v3"; // bumped
      const DEBUG_STORAGE_KEY = "arc-jk-debug-x-enabled-v1";

      // Add phrases here (plain English). Case-insensitive.
      // Each phrase is matched as a substring across the whole post text.
      const BLOCK_PHRASES = ["stuns for", "bridgerton"];

      // Your exact tab nodes
      const HOME_TAB_XPATH =
        "/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/nav/div/div[2]/div/div[1]";
      const MOVIES_TAB_XPATH =
        "/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/nav/div/div[2]/div/div[4]";

      // This is the one you said actually carries aria-selected
      const MOVIES_TAB_SELECTED_XPATH =
        "/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/nav/div/div[2]/div/div[4]/div";

      const HIGHLIGHT_BOX_ID = "__arc_jk_highlight_box__";
      const PROGRESS_BOX_CLASS = "__arc_jk_progress_box__";

      const DEBUG_BOX_ID = "__arc_jk_debug_box__";
      const MIN_ITEM_HEIGHT = 24;
      const NAV_SCROLL_GRACE_MS = 700;

      // Restore behavior tuning
      const RESTORE_MAX_MS = 60000;
      const RESTORE_TICK_MS = 120;
      const RESTORE_MAX_STUCK_TICKS = 140; // ~17s at 120ms
      const RESTORE_STEP_FACTOR = 0.9; // scroll by ~90% viewport
      const RESTORE_BOTTOM_MARGIN_SCREENS = 2.0; // "near bottom" threshold

      // ---------- Debug ----------
      let DEBUG = false;
      try {
        DEBUG = localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
      } catch {}

      function log(...args) {
        if (DEBUG) console.log("[arc-jk-x]", ...args);
      }

      function setDebugEnabled(v, { persist = true } = {}) {
        DEBUG = !!v;
        if (persist) {
          try {
            localStorage.setItem(DEBUG_STORAGE_KEY, DEBUG ? "1" : "0");
          } catch {}
        }
        if (!DEBUG) removeDebugBox();
        else ensureDebugBox();
        queueSync();
        log("Debug set:", DEBUG);
      }

      function ensureDebugBox() {
        if (!DEBUG) return null;
        let el = document.getElementById(DEBUG_BOX_ID);
        if (el && document.contains(el)) return el;

        el = document.createElement("div");
        el.id = DEBUG_BOX_ID;
        el.style.position = "fixed";
        el.style.right = "12px";
        el.style.bottom = "12px";
        el.style.zIndex = "2147483647";
        el.style.maxWidth = "420px";
        el.style.padding = "10px 12px";
        el.style.borderRadius = "10px";
        el.style.font =
          "12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
        el.style.background = "rgba(0,0,0,0.78)";
        el.style.color = "rgba(255,255,255,0.92)";
        el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)";
        el.style.pointerEvents = "none";
        el.style.whiteSpace = "pre-wrap";
        document.body.appendChild(el);
        return el;
      }

      function removeDebugBox() {
        const el = document.getElementById(DEBUG_BOX_ID);
        if (el) el.remove();
      }

      function updateDebugBox(text) {
        if (!DEBUG) return;
        const el = ensureDebugBox();
        if (!el) return;
        el.textContent = text || "";
      }

      // ---------- Style ----------
      const style = document.createElement("style");
      style.textContent = `
        #${HIGHLIGHT_BOX_ID} {
          position: fixed;
          box-sizing: border-box;
          border: 2px solid rgba(29, 155, 240, 0.95);
          border-radius: 12px;
          pointer-events: none;
          z-index: 2147483647;
          display: none;
        }

        input.${PROGRESS_BOX_CLASS}[data-arc-jk="1"] {
          position: fixed;
          width: 16px;
          height: 16px;
          margin: 0;
          cursor: pointer;
          z-index: 2147483647;
          opacity: 0.85;
          transition: opacity 120ms ease;
          accent-color: rgba(29, 155, 240, 0.95);
          appearance: auto;
          pointer-events: auto !important;
          background: transparent;
        }

        input.${PROGRESS_BOX_CLASS}[data-arc-jk="1"][data-selected="0"] {
          opacity: 0.35;
        }
      `;
      document.documentElement.appendChild(style);

      // ---------- Helpers ----------
      function evalXPathFirst(path) {
        try {
          const res = document.evaluate(
            path,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          );
          return res.singleNodeValue || null;
        } catch {
          return null;
        }
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

      function visibleInViewport(el) {
        const r = el.getBoundingClientRect();
        if (r.height < MIN_ITEM_HEIGHT) return false;
        return r.bottom > 0 && r.top < window.innerHeight;
      }

      function getScrollEl() {
        return (
          document.scrollingElement || document.documentElement || document.body
        );
      }

      // ---------- Key Sink ----------
      function ensureKeySink() {
        let el = document.getElementById(KEY_SINK_ID);
        if (el) return el;

        el = document.createElement("textarea");
        el.id = KEY_SINK_ID;
        el.setAttribute("aria-hidden", "true");
        el.tabIndex = -1;
        el.autocomplete = "off";
        el.spellcheck = false;

        el.style.position = "fixed";
        el.style.left = "-9999px";
        el.style.top = "0";
        el.style.width = "1px";
        el.style.height = "1px";
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.style.zIndex = "2147483647";

        document.body.appendChild(el);
        return el;
      }

      function focusKeySink() {
        const el = ensureKeySink();
        if (document.activeElement !== el) {
          el.focus({ preventScroll: true });
        }
      }

      function removeKeySink() {
        const el = document.getElementById(KEY_SINK_ID);
        if (el) el.remove();
      }

      // ---------- Movies guard ----------
      function isMoviesActiveNow() {
        const moviesSel = evalXPathFirst(MOVIES_TAB_SELECTED_XPATH);
        return (
          !!moviesSel && moviesSel.getAttribute("aria-selected") === "true"
        );
      }

      function clickedInsideMoviesTab(e) {
        const moviesWrap = evalXPathFirst(MOVIES_TAB_XPATH);
        return !!moviesWrap && moviesWrap.contains(e.target);
      }

      function clickedInsideHomeTab(e) {
        const home = evalXPathFirst(HOME_TAB_XPATH);
        return !!home && home.contains(e.target);
      }

      // ---------- Progress ID (STATUS NUMERIC ONLY) ----------
      function extractStatusId(href) {
        if (!href) return null;
        try {
          const u = new URL(href, location.origin);
          const path = u.pathname || "";
          // handles: /user/status/123, /i/status/123, etc.
          const m = path.match(/\/status\/(\d+)/);
          return m ? m[1] : null;
        } catch {
          // If URL constructor fails, try regex on raw string:
          const m = String(href).match(/\/status\/(\d+)/);
          return m ? m[1] : null;
        }
      }

      function getPermalinkAnchor(itemEl) {
        if (!itemEl) return null;

        const withTime = itemEl
          .querySelector('a[href*="/status/"] time[datetime]')
          ?.closest('a[href*="/status/"]');
        if (withTime) return withTime;

        return itemEl.querySelector('a[href*="/status/"]');
      }

      function getItemId(itemEl) {
        const a = getPermalinkAnchor(itemEl);
        if (!a) return null;
        return extractStatusId(a.getAttribute("href"));
      }

      function loadProgressId() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw && typeof raw === "string" ? raw : null;
        } catch {
          return null;
        }
      }

      function saveProgressId(id) {
        if (!id) return;
        try {
          localStorage.setItem(STORAGE_KEY, String(id));
        } catch {}
      }

      function clearProgressId() {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
      }

      // ---------- Blocking ----------
      function normalizeTextForMatch(s) {
        return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
      }

      function shouldBlockItem(itemEl) {
        if (!itemEl) return false;
        const text = normalizeTextForMatch(itemEl.innerText);
        if (!text) return false;

        for (const phrase of BLOCK_PHRASES) {
          const p = normalizeTextForMatch(phrase);
          if (p && text.includes(p)) return true;
        }
        return false;
      }

      function blockItem(itemEl) {
        if (!itemEl) return;
        if (itemEl.dataset.arcJkBlocked === "1") return;

        itemEl.dataset.arcJkBlocked = "1";
        itemEl.style.display = "none";
        itemEl.setAttribute("aria-hidden", "true");

        if (current === itemEl) current = null;
      }

      // ---------- Items ----------
      function itemFromArticle(article) {
        return article.closest('div[data-testid="cellInnerDiv"]') || article;
      }

      function getItems() {
        const main = document.querySelector("main");
        if (!main) return [];

        const articles = Array.from(main.querySelectorAll("article")).filter(
          (a) => !!a.querySelector('a[href*="/status/"]'),
        );

        const items = [];
        const seen = new Set();

        for (const a of articles) {
          const it = itemFromArticle(a);
          if (!it) continue;
          if (seen.has(it)) continue;
          seen.add(it);

          if (shouldBlockItem(it)) {
            blockItem(it);
            continue;
          }

          items.push(it);
        }

        items.sort(
          (x, y) =>
            x.getBoundingClientRect().top - y.getBoundingClientRect().top,
        );
        return items;
      }

      function middleMostVisible(items) {
        const midY = window.innerHeight / 2;
        let best = null;
        let bestDist = Infinity;

        for (const el of items) {
          if (!visibleInViewport(el)) continue;
          const r = el.getBoundingClientRect();
          const cY = r.top + r.height / 2;
          const d = Math.abs(cY - midY);
          if (d < bestDist) {
            bestDist = d;
            best = el;
          }
        }
        return best;
      }

      // ---------- UI ----------
      let moviesActive = false;
      let restoring = false;

      let navScrolling = false;
      let navScrollTimer = null;

      let current = null;

      let highlightBox = null;

      let cbByItem = new WeakMap();
      let visibleCheckboxes = new Set();

      let syncQueued = false;

      function ensureHighlightBox() {
        if (highlightBox && document.contains(highlightBox))
          return highlightBox;
        highlightBox = document.createElement("div");
        highlightBox.id = HIGHLIGHT_BOX_ID;
        document.body.appendChild(highlightBox);
        return highlightBox;
      }

      function removeHighlightBox() {
        if (highlightBox) highlightBox.remove();
        highlightBox = null;
      }

      function removeAllCheckboxes() {
        for (const cb of visibleCheckboxes) {
          if (cb) cb.remove();
        }
        visibleCheckboxes.clear();

        document
          .querySelectorAll(`input.${PROGRESS_BOX_CLASS}[data-arc-jk="1"]`)
          .forEach((el) => el.remove());
        cbByItem = new WeakMap();
      }

      function queueSync() {
        if (!moviesActive) return;
        if (syncQueued) return;
        syncQueued = true;
        requestAnimationFrame(() => {
          syncQueued = false;
          syncUI();
        });
      }

      function syncUI() {
        if (!moviesActive) return;

        // HARD stop if Movies not selected anymore
        if (!isMoviesActiveNow()) {
          deactivateMovies();
          return;
        }

        ensureHighlightBox();
        if (DEBUG) ensureDebugBox();

        const items = getItems();
        const saved = loadProgressId();

        // Highlight
        if (current && document.contains(current)) {
          const r = current.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            highlightBox.style.display = "block";
            highlightBox.style.left = `${Math.round(r.left)}px`;
            highlightBox.style.top = `${Math.round(r.top)}px`;
            highlightBox.style.width = `${Math.round(r.width)}px`;
            highlightBox.style.height = `${Math.round(r.height)}px`;
          } else {
            highlightBox.style.display = "none";
          }
        } else {
          highlightBox.style.display = "none";
        }

        // Checkboxes: only near viewport for speed (±1 screen)
        const newVisible = new Set();
        const topLimit = -window.innerHeight;
        const bottomLimit = window.innerHeight * 2;

        for (const item of items) {
          const r = item.getBoundingClientRect();
          if (r.bottom < topLimit || r.top > bottomLimit) continue;

          const id = item.dataset.arcJkId || getItemId(item);
          if (!id) continue;
          item.dataset.arcJkId = id;

          let cb = cbByItem.get(item);
          if (!cb || !document.contains(cb)) {
            cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = PROGRESS_BOX_CLASS;
            cb.tabIndex = -1;
            cb.dataset.arcJk = "1";
            cb.style.pointerEvents = "auto";

            const stopOnly = (e) => {
              e.stopPropagation();
              e.stopImmediatePropagation?.();
            };

            cb.addEventListener("pointerdown", stopOnly, true);
            cb.addEventListener("mousedown", stopOnly, true);
            cb.addEventListener("click", stopOnly, true);

            cb.addEventListener(
              "change",
              (e) => {
                stopOnly(e);

                const itemId = item.dataset.arcJkId || getItemId(item);
                if (!itemId) {
                  cb.checked = false;
                  return;
                }
                item.dataset.arcJkId = itemId;

                if (cb.checked) saveProgressId(itemId);
                else if (loadProgressId() === itemId) clearProgressId();

                setCurrent(item, { preventScroll: true });
                queueSync();
                cb.blur?.();
              },
              true,
            );

            cbByItem.set(item, cb);
            document.body.appendChild(cb);
          }

          cb.checked = !!saved && saved === id;
          cb.dataset.selected = current === item ? "1" : "0";

          // LEFT side
          const size = 16;
          const pad = 10;
          let x = r.left - size - pad;
          if (x < 2)
            x = Math.max(
              2,
              Math.min(window.innerWidth - size - 2, r.left + pad),
            );

          const y = Math.max(
            2,
            Math.min(
              window.innerHeight - size - 2,
              r.top + r.height / 2 - size / 2,
            ),
          );

          cb.style.left = `${Math.round(x)}px`;
          cb.style.top = `${Math.round(y)}px`;

          newVisible.add(cb);
          visibleCheckboxes.add(cb);
        }

        for (const cb of Array.from(visibleCheckboxes)) {
          if (!newVisible.has(cb)) {
            cb.remove();
            visibleCheckboxes.delete(cb);
          }
        }

        // Debug overlay
        if (DEBUG) {
          const scrollEl = getScrollEl();
          const scrollTop = Math.round(scrollEl.scrollTop || 0);
          const scrollHeight = Math.round(scrollEl.scrollHeight || 0);
          const clientHeight = Math.round(scrollEl.clientHeight || 0);

          const curId = current
            ? current.dataset.arcJkId || getItemId(current)
            : null;
          const firstId = items[0]
            ? items[0].dataset.arcJkId || getItemId(items[0])
            : null;
          const lastId = items[items.length - 1]
            ? items[items.length - 1].dataset.arcJkId ||
              getItemId(items[items.length - 1])
            : null;

          updateDebugBox(
            [
              `debug: ${DEBUG ? "ON" : "OFF"}  moviesActive=${moviesActive} restoring=${restoring}`,
              `savedId=${saved || "-"}`,
              `currentId=${curId || "-"}`,
              `items=${items.length}  first=${firstId || "-"}  last=${lastId || "-"}`,
              `scrollTop=${scrollTop}  clientH=${clientHeight}  scrollH=${scrollHeight}`,
              `navScrolling=${navScrolling}`,
              `note: enable logs in console too`,
            ].join("\n"),
          );
        }
      }

      // ---------- selection + movement ----------
      function clearSelection() {
        current = null;
        queueSync();
      }

      function setCurrent(el, { preventScroll = false } = {}) {
        if (!el) return;
        current = el;

        navScrolling = true;
        if (navScrollTimer) clearTimeout(navScrollTimer);
        navScrollTimer = setTimeout(
          () => (navScrolling = false),
          NAV_SCROLL_GRACE_MS,
        );

        if (!preventScroll)
          el.scrollIntoView({ block: "center", inline: "nearest" });

        queueSync();
      }

      function move(dir) {
        if (!moviesActive) return;

        const items = getItems();
        if (!items.length) return;

        const mid = middleMostVisible(items) || items[0];

        if (
          !current ||
          !document.contains(current) ||
          !visibleInViewport(current)
        ) {
          setCurrent(mid);
          return;
        }

        const idx = items.indexOf(current);
        if (idx === -1) {
          setCurrent(mid);
          return;
        }

        const nextIdx = Math.max(0, Math.min(items.length - 1, idx + dir));
        setCurrent(items[nextIdx]);
      }

      function toggleProgressForCurrent() {
        if (!current) return;
        const id = current.dataset.arcJkId || getItemId(current);
        if (!id) return;
        current.dataset.arcJkId = id;

        const saved = loadProgressId();
        if (saved === id) clearProgressId();
        else saveProgressId(id);

        queueSync();
      }

      // ---------- restore (progressive scroll, robust IDs) ----------
      function findItemBySavedId(savedId) {
        if (!savedId) return null;
        const items = getItems();
        for (const it of items) {
          const id = it.dataset.arcJkId || getItemId(it);
          if (id) it.dataset.arcJkId = id;
          if (id && id === savedId) return it;
        }
        return null;
      }

      function restoreProgressIfAny() {
        const savedId = loadProgressId();
        if (!savedId) return;
        if (!moviesActive) return;

        restoring = true;
        log("Restore start. savedId=", savedId);

        const startedAt = Date.now();
        let stuckTicks = 0;

        let lastScrollTop = -1;
        let lastScrollHeight = -1;
        let lastItemCount = -1;

        const tick = () => {
          if (!moviesActive) {
            restoring = false;
            log("Restore stop: moviesActive=false");
            return;
          }

          if (!isMoviesActiveNow()) {
            restoring = false;
            log("Restore stop: movies unselected");
            deactivateMovies();
            return;
          }

          queueSync();

          const found = findItemBySavedId(savedId);
          if (found) {
            log("Restore found item. scrolling to it.");
            setCurrent(found);
            restoring = false;
            return;
          }

          const elapsed = Date.now() - startedAt;
          if (elapsed > RESTORE_MAX_MS) {
            restoring = false;
            log("Restore stop: timeout", elapsed);
            return;
          }

          const scrollEl = getScrollEl();
          const scrollTop = scrollEl.scrollTop || 0;
          const scrollHeight = scrollEl.scrollHeight || 0;
          const clientHeight =
            scrollEl.clientHeight || window.innerHeight || 800;

          const itemCount = getItems().length;

          // Detect "stuck": not scrolling and not loading more and not gaining items
          const topDidMove = Math.abs(scrollTop - lastScrollTop) > 2;
          const heightDidGrow = scrollHeight > lastScrollHeight + 2;
          const itemsDidGrow = itemCount > lastItemCount;

          if (!topDidMove && !heightDidGrow && !itemsDidGrow) stuckTicks += 1;
          else stuckTicks = 0;

          lastScrollTop = scrollTop;
          lastScrollHeight = scrollHeight;
          lastItemCount = itemCount;

          if (stuckTicks > RESTORE_MAX_STUCK_TICKS) {
            restoring = false;
            log("Restore stop: stuck", {
              stuckTicks,
              scrollTop,
              scrollHeight,
              itemCount,
            });
            return;
          }

          navScrolling = true;
          if (navScrollTimer) clearTimeout(navScrollTimer);
          navScrollTimer = setTimeout(
            () => (navScrolling = false),
            NAV_SCROLL_GRACE_MS,
          );

          // Progressive scroll:
          const step = Math.max(
            240,
            Math.floor((window.innerHeight || 800) * RESTORE_STEP_FACTOR),
          );

          // If we're "near bottom", push closer to bottom to trigger more loading.
          const nearBottomThreshold =
            scrollHeight - clientHeight * RESTORE_BOTTOM_MARGIN_SCREENS;
          let targetTop;

          if (scrollTop >= nearBottomThreshold) {
            targetTop = Math.min(scrollHeight - clientHeight, scrollTop + step);
          } else {
            targetTop = Math.min(scrollHeight - clientHeight, scrollTop + step);
          }

          if (DEBUG) {
            log("Restore tick:", {
              elapsed,
              scrollTop: Math.round(scrollTop),
              targetTop: Math.round(targetTop),
              scrollHeight: Math.round(scrollHeight),
              clientHeight: Math.round(clientHeight),
              itemCount,
              stuckTicks,
            });
          }

          scrollEl.scrollTo({ top: targetTop, left: 0, behavior: "auto" });

          // Tiny jiggle can help some renderers update
          window.scrollBy(0, 1);
          window.scrollBy(0, -1);

          setTimeout(tick, RESTORE_TICK_MS);
        };

        setTimeout(tick, 50);
      }

      // ---------- activation ----------
      function activateMovies() {
        if (moviesActive) return;
        moviesActive = true;

        ensureHighlightBox();
        if (DEBUG) ensureDebugBox();

        // Make X think we're "typing" so its j/k shortcuts don't run
        setTimeout(() => {
          if (moviesActive) focusKeySink();
        }, 0);

        queueSync();
        setTimeout(() => {
          if (!moviesActive) return;
          queueSync();
          restoreProgressIfAny();
        }, 120);

        log("Movies activated");
      }

      function deactivateMovies() {
        if (!moviesActive) return;
        moviesActive = false;
        restoring = false;

        clearSelection();
        removeAllCheckboxes();
        removeHighlightBox();
        removeKeySink();

        if (DEBUG) updateDebugBox("debug: ON\n(movies deactivated)");

        log("Movies deactivated");
      }

      function waitForMoviesSelectedThenActivate() {
        const START = Date.now();
        const MAX_WAIT_MS = 8000;

        const poll = () => {
          if (isMoviesActiveNow()) {
            activateMovies();
            return;
          }
          if (Date.now() - START > MAX_WAIT_MS) return;
          setTimeout(poll, 60);
        };

        poll();
      }

      // ---------- key handling ----------
      function handleKey(e) {
        if (!moviesActive) return;
        if (e.type !== "keydown") return;

        const key = (e.key || "").toLowerCase();
        if (key !== "j" && key !== "k" && key !== "l") return;

        if (e.metaKey || e.ctrlKey || e.altKey) return;

        // Don't toggle progress repeatedly if key is held down
        if (key === "l" && e.repeat) return;

        const sink = document.getElementById(KEY_SINK_ID);
        if (
          isTypingTarget(document.activeElement) &&
          document.activeElement !== sink
        )
          return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();

        if (key === "j") move(+1);
        if (key === "k") move(-1);
        if (key === "l") {
          if (
            !current ||
            !document.contains(current) ||
            !visibleInViewport(current)
          ) {
            const items = getItems();
            const mid = middleMostVisible(items) || items[0];
            if (mid) setCurrent(mid);
          }
          toggleProgressForCurrent();
        }
      }

      window.addEventListener("keydown", handleKey, true);

      window.addEventListener(
        "scroll",
        () => {
          if (!moviesActive) return;
          if (!navScrolling && !restoring) clearSelection();
          queueSync();
        },
        { passive: true, capture: true },
      );

      window.addEventListener(
        "resize",
        () => {
          if (!moviesActive) return;
          queueSync();
        },
        { passive: true, capture: true },
      );

      // Activate only on Movies click; deactivate on Home click / leaving Movies
      document.addEventListener(
        "click",
        (e) => {
          if (clickedInsideMoviesTab(e)) {
            setTimeout(waitForMoviesSelectedThenActivate, 30);
            return;
          }

          if (clickedInsideHomeTab(e)) {
            deactivateMovies();
            return;
          }

          if (moviesActive && !isMoviesActiveNow()) {
            deactivateMovies();
          }
        },
        true,
      );

      // Also, if X swaps selection without a click (SPA), deactivate if Movies unselected
      const mo = new MutationObserver(() => {
        if (!moviesActive) return;
        if (!isMoviesActiveNow()) deactivateMovies();
        else queueSync();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });

      // Start disabled (Home)
      deactivateMovies();

      // Debug helper
      window.__arcJK_X = {
        isMoviesActiveNow,
        activate: () => waitForMoviesSelectedThenActivate(),
        deactivate: () => deactivateMovies(),
        forceSync: () => queueSync(),
        debug: {
          get: () => DEBUG,
          set: (v) => setDebugEnabled(!!v, { persist: true }),
          once: (v) => setDebugEnabled(!!v, { persist: false }),
        },
        progress: {
          get: () => loadProgressId(),
          clear: () => {
            clearProgressId();
            queueSync();
          },
        },
      };

      // If debug is already on, create overlay immediately
      if (DEBUG) ensureDebugBox();
    })();
  }

  // ============================================================
  // Bluesky module (J/K/L + progress + restore)
  // ============================================================
  function installBskyModule() {
    (() => {
      // Prevent double-inject (Arc Boosts can re-run on soft navigations)
      if (window.__arcJKBoostInstalled) return;
      window.__arcJKBoostInstalled = true;

      const DEBUG = false;

      const HIGHLIGHT_CLASS = "__arc_jk_selected__";
      const PROGRESS_BOX_CLASS = "__arc_jk_progress_box__";
      const ITEM_CLASS = "__arc_jk_item__";

      const MIN_ITEM_HEIGHT = 24;

      // If smooth scrolling takes longer for you, bump this to ~1200
      const NAV_SCROLL_GRACE_MS = 700;

      // LocalStorage key for your last saved progress item
      const STORAGE_KEY = "arc-jk-progress-href-v1";

      const style = document.createElement("style");
      style.textContent = `
        .${HIGHLIGHT_CLASS} {
          outline: 2px solid rgba(29, 155, 240, 0.95);
          outline-offset: 2px;
          border-radius: 8px;
          scroll-margin-top: 25vh;
          scroll-margin-bottom: 25vh;
        }

        /* Make each navigable item a positioning context for the progress checkbox */
        .${ITEM_CLASS} { position: relative; }

        /* The little hovering checkbox on the right */
        .${PROGRESS_BOX_CLASS} {
          position: absolute;
          left: -30px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          margin: 0;
          cursor: pointer;
          z-index: 999999;
          opacity: 0.25;
          transition: opacity 120ms ease;
          accent-color: rgba(29, 155, 240, 0.95);
          appearance: auto;
          pointer-events: auto !important;
        }

        /* Only show it clearly on hover or when the item is selected */
        .${ITEM_CLASS} .${PROGRESS_BOX_CLASS},
        .${HIGHLIGHT_CLASS} .${PROGRESS_BOX_CLASS} {
          opacity: 1;
        }
      `;
      document.documentElement.appendChild(style);

      let current = null;

      // When we scroll due to J/K navigation, we don't want to treat it as "manual scroll"
      let navScrolling = false;
      let navScrollTimer = null;

      // When we are restoring progress on load, we also don't want scroll to reset selection
      let restoring = false;

      function log(...args) {
        if (DEBUG) console.log("[arc-jk]", ...args);
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

      function visibleInViewport(el) {
        const r = el.getBoundingClientRect();
        if (r.height < MIN_ITEM_HEIGHT) return false;
        return r.bottom > 0 && r.top < window.innerHeight;
      }

      function ensureFocusable(el) {
        if (!el) return;
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      }

      function clearHighlight() {
        if (current) current.classList.remove(HIGHLIGHT_CLASS);
      }

      function resetSelection() {
        clearHighlight();
        current = null;
      }

      function setCurrent(el, { preventScroll = false } = {}) {
        if (!el) return;

        clearHighlight();
        current = el;
        current.classList.add(HIGHLIGHT_CLASS);

        ensureFocusable(current);
        current.focus?.({ preventScroll: true });

        // Mark scrolling as navigation-driven so scroll events don't reset selection
        navScrolling = true;
        if (navScrollTimer) clearTimeout(navScrollTimer);
        navScrollTimer = setTimeout(() => {
          navScrolling = false;
        }, NAV_SCROLL_GRACE_MS);

        if (!preventScroll) {
          current.scrollIntoView({ block: "center", inline: "nearest" });
        }

        // Keep progress UI synced with selection
        updateProgressCheckboxes();
      }

      // Your feed container XPath (up to the parent of div[n])
      const FEED_CONTAINER_XPATH =
        "/html/body/div[1]/div/div/div/div/div/main/div[2]/div/div/div/div[2]/div/div[6]/div/div[1]/div/div[2]/div";

      function evalXPathFirst(path) {
        try {
          const res = document.evaluate(
            path,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          );
          return res.singleNodeValue || null;
        } catch {
          return null;
        }
      }

      function scoreContainer(el) {
        const kids = Array.from(el.children).filter((c) => c.nodeType === 1);
        if (kids.length < 20) return -Infinity;

        const divKids = kids.filter((k) => k.tagName === "DIV");
        if (divKids.length / kids.length < 0.8) return -Infinity;

        const visibleKids = divKids.filter(visibleInViewport);
        return visibleKids.length * 100 + divKids.length;
      }

      function findFeedContainer() {
        const byXpath = evalXPathFirst(FEED_CONTAINER_XPATH);
        if (byXpath && byXpath.children && byXpath.children.length >= 10) {
          return byXpath;
        }

        const main = document.querySelector("main");
        if (!main) return null;

        const candidates = Array.from(main.querySelectorAll("div"));
        let best = null;
        let bestScore = -Infinity;

        for (const el of candidates) {
          const s = scoreContainer(el);
          if (s > bestScore) {
            bestScore = s;
            best = el;
          }
        }
        return best;
      }

      function getItems(container) {
        if (!container) return [];
        return Array.from(container.children).filter(
          (el) => el.tagName === "DIV",
        );
      }

      function middleMostVisible(items) {
        const midY = window.innerHeight / 2;
        let best = null;
        let bestDist = Infinity;

        for (const el of items) {
          if (!visibleInViewport(el)) continue;
          const r = el.getBoundingClientRect();
          const cY = r.top + r.height / 2;
          const d = Math.abs(cY - midY);
          if (d < bestDist) {
            bestDist = d;
            best = el;
          }
        }
        return best;
      }

      // --- Progress identification via permalink href (stable-ish) ---

      function normalizeHref(href) {
        if (!href) return null;
        try {
          const u = new URL(href, location.origin);
          // Path + query is usually enough; ignore hash
          return u.pathname + (u.search || "");
        } catch {
          return null;
        }
      }

      function scorePermalinkAnchor(a) {
        if (!a) return -Infinity;
        const href = a.getAttribute("href") || "";
        if (!href.includes("/post/")) return -Infinity;

        let s = 0;
        if (a.hasAttribute("aria-label")) s += 100;
        if (a.hasAttribute("data-tooltip")) s += 60;
        if ((a.getAttribute("role") || "").toLowerCase() === "link") s += 20;

        // Prefer anchors that look like timestamps / metadata (small text links)
        const txt = (a.textContent || "").trim();
        if (txt.length > 0 && txt.length <= 8) s += 10;

        // Tiny nudge toward shorter hrefs (less likely to be tracking wrappers)
        s -= Math.min(10, href.length / 50);

        return s;
      }

      function getBestPermalinkAnchor(itemEl) {
        if (!itemEl) return null;

        const anchors = Array.from(
          itemEl.querySelectorAll('a[href*="/post/"]'),
        );
        if (!anchors.length) return null;

        let best = null;
        let bestScore = -Infinity;

        for (const a of anchors) {
          const s = scorePermalinkAnchor(a);
          if (s > bestScore) {
            bestScore = s;
            best = a;
          }
        }

        return best;
      }

      function getItemId(itemEl) {
        const a = getBestPermalinkAnchor(itemEl);
        if (!a) return null;
        return normalizeHref(a.getAttribute("href"));
      }

      function loadProgressId() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw && typeof raw === "string" ? raw : null;
      }

      function saveProgressId(id) {
        if (!id) return;
        localStorage.setItem(STORAGE_KEY, id);
      }

      function clearProgressId() {
        localStorage.removeItem(STORAGE_KEY);
      }

      // --- Progress checkbox UI per item ---

      function ensureProgressUI(itemEl) {
        if (!itemEl || itemEl.nodeType !== 1) return;

        if (!itemEl.classList.contains(ITEM_CLASS))
          itemEl.classList.add(ITEM_CLASS);

        // Avoid duplicates
        if (itemEl.querySelector(`:scope > input.${PROGRESS_BOX_CLASS}`))
          return;

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = PROGRESS_BOX_CLASS;
        cb.title = "Mark progress (L)";
        cb.tabIndex = -1;

        // Stop the site from treating this as a click on the post, BUT do not preventDefault
        const stopOnly = (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation?.();
        };

        cb.addEventListener("pointerdown", stopOnly, true);
        cb.addEventListener("mousedown", stopOnly, true);
        cb.addEventListener("click", stopOnly, true);

        // This is the key: change fires AFTER the checkbox visually toggles
        cb.addEventListener(
          "change",
          (e) => {
            stopOnly(e);

            const item = cb.closest(`.${ITEM_CLASS}`) || cb.parentElement;
            if (!item) return;

            // Ensure we have an id for this item (use cached id if available)
            const id = item.dataset.arcJkId || getItemId(item);
            if (!id) {
              // Can't identify: revert the visual check so it doesn't lie
              cb.checked = false;
              return;
            }

            // Cache it so future clicks don't depend on a fresh DOM query
            item.dataset.arcJkId = id;

            if (cb.checked) {
              saveProgressId(id);
            } else if (loadProgressId() === id) {
              clearProgressId();
            }

            // Keep single-source-of-truth UI: only one checked at a time
            updateProgressCheckboxes();

            // Optional: also select/highlight the row you just clicked (no scroll jump)
            setCurrent(item, { preventScroll: true });

            cb.blur?.();
          },
          true,
        );

        itemEl.appendChild(cb);
      }

      function updateProgressCheckboxes() {
        const saved = loadProgressId();
        const container = findFeedContainer();
        const items = getItems(container);

        for (const item of items) {
          ensureProgressUI(item);

          // Cache a stable-ish id on the item so click toggles are reliable
          const id = getItemId(item) || "";
          item.dataset.arcJkId = id;

          const cb = item.querySelector(`:scope > input.${PROGRESS_BOX_CLASS}`);
          if (!cb) continue;

          // If we can't identify this item, disable/hide the checkbox to avoid confusing behavior
          if (!id) {
            cb.checked = false;
            cb.disabled = true;
            cb.style.display = "none"; // change to "" if you'd rather show disabled boxes
            continue;
          }

          cb.disabled = false;
          cb.style.display = "";
          cb.checked = !!saved && saved === id;
        }
      }

      function toggleProgressForItem(itemEl) {
        const el = itemEl || current;
        if (!el) return;

        const id = el.dataset.arcJkId || getItemId(el);
        if (!id) {
          log("No permalink href found for this item; can't toggle progress.");
          return;
        }

        const saved = loadProgressId();

        if (saved === id) {
          clearProgressId();
          updateProgressCheckboxes();
          log("Cleared progress:", id);
          return;
        }

        saveProgressId(id);
        updateProgressCheckboxes();
        log("Saved progress:", id);
      }

      // Observe new items and attach checkboxes as the feed grows / re-renders
      let feedObserver = null;

      function startObservingFeed(container) {
        if (!container) return;
        if (feedObserver) return;

        feedObserver = new MutationObserver(() => {
          // New nodes arrived; attach UI + sync checked state
          updateProgressCheckboxes();
        });

        feedObserver.observe(container, { childList: true, subtree: false });
      }

      // --- J/K movement ---

      function move(dir) {
        const container = findFeedContainer();
        if (!container) return;

        startObservingFeed(container);

        const items = getItems(container);
        if (!items.length) return;

        // Ensure UI exists on current set
        for (const el of items) ensureProgressUI(el);
        updateProgressCheckboxes();

        const mid = middleMostVisible(items) || items[0];

        // IMPORTANT: if selection is gone OR offscreen, re-anchor to center-most *and stop*
        if (
          !current ||
          !document.contains(current) ||
          !visibleInViewport(current)
        ) {
          setCurrent(mid);
          log("anchored to middle", items.indexOf(mid));
          return;
        }

        let idx = items.indexOf(current);

        // If react re-rendered and current isn't a direct child anymore, re-anchor
        if (idx === -1) {
          setCurrent(mid);
          log("re-anchored to middle", items.indexOf(mid));
          return;
        }

        const nextIdx = Math.max(0, Math.min(items.length - 1, idx + dir));
        setCurrent(items[nextIdx]);
        log("moved to", nextIdx);
      }

      // Reset selection on manual scroll / interaction (Twitter-style re-anchor)
      window.addEventListener(
        "wheel",
        () => {
          if (!navScrolling && !restoring) resetSelection();
        },
        { passive: true, capture: true },
      );

      window.addEventListener(
        "touchstart",
        () => {
          if (!navScrolling && !restoring) resetSelection();
        },
        { passive: true, capture: true },
      );

      window.addEventListener(
        "scroll",
        () => {
          if (!navScrolling && !restoring) resetSelection();
        },
        { passive: true, capture: true },
      );

      // --- Restore progress on load: scroll until saved href is found, then center it ---
      function findItemBySavedId(container, savedId) {
        if (!container || !savedId) return null;
        const items = getItems(container);

        for (const item of items) {
          // Prefer cached id (much faster), fall back if missing
          const id = item.dataset.arcJkId || getItemId(item);
          if (id && id === savedId) return item;
        }
        return null;
      }

      async function restoreProgressIfAny() {
        const savedId = loadProgressId();
        if (!savedId) return;

        restoring = true;

        let steps = 0;
        let lastScrollHeight = 0;
        let stuckCount = 0;

        const MAX_STEPS = 200; // total bottom-jumps before giving up
        const STUCK_LIMIT = 10; // if scrollHeight stops increasing, we bail
        const TICK_MS = 80; // how quickly we re-check after each jump

        const tick = () => {
          const container = findFeedContainer();
          if (!container) {
            requestAnimationFrame(tick);
            return;
          }

          startObservingFeed(container);

          // keep ids cached + checkboxes synced
          updateProgressCheckboxes();

          // did we load the target yet?
          const found = findItemBySavedId(container, savedId);
          if (found) {
            setCurrent(found); // centers it (your setCurrent does scrollIntoView center)
            restoring = false;
            log("Restored progress to:", savedId);
            return;
          }

          steps += 1;
          if (steps > MAX_STEPS) {
            restoring = false;
            log("Restore gave up (max steps):", savedId);
            return;
          }

          // Jump to bottom instantly (no smooth scrolling)
          const h =
            document.documentElement.scrollHeight || document.body.scrollHeight;

          if (h === lastScrollHeight) stuckCount += 1;
          else stuckCount = 0;

          lastScrollHeight = h;

          if (stuckCount >= STUCK_LIMIT) {
            restoring = false;
            log("Restore gave up (stuck / no more growth):", savedId);
            return;
          }

          navScrolling = true;
          if (navScrollTimer) clearTimeout(navScrollTimer);
          navScrollTimer = setTimeout(() => {
            navScrolling = false;
          }, NAV_SCROLL_GRACE_MS);

          window.scrollTo({ top: h, left: 0, behavior: "auto" });

          // tiny nudge sometimes helps “near bottom” loaders trigger
          window.scrollBy(0, -1);
          window.scrollBy(0, +1);

          setTimeout(tick, TICK_MS);
        };

        // Start quickly (no big initial delay)
        setTimeout(tick, 50);
      }

      // Capture keydown early so the site can't swallow it
      document.addEventListener(
        "keydown",
        (e) => {
          const key = (e.key || "").toLowerCase();

          // J/K navigation
          if (key === "j" || key === "k") {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (isTypingTarget(document.activeElement)) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            move(key === "j" ? +1 : -1);
            return;
          }

          // L = mark progress for the currently-selected item (or anchor to middle if none)
          if (key === "l") {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (isTypingTarget(document.activeElement)) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            // If nothing selected, pick the middle-most visible (same behavior as first J/K press)
            if (
              !current ||
              !document.contains(current) ||
              !visibleInViewport(current)
            ) {
              const container = findFeedContainer();
              const items = getItems(container);
              const mid = middleMostVisible(items) || items[0];
              if (mid) setCurrent(mid);
            }

            if (current) toggleProgressForItem(current);
          }
        },
        true,
      );

      // Optional debug helper
      window.__arcJK = {
        reset: resetSelection,
        dump() {
          const c = findFeedContainer();
          const items = getItems(c);
          return {
            hasContainer: !!c,
            itemCount: items.length,
            currentIndex: items.indexOf(current),
          };
        },
        progress: {
          get: () => loadProgressId(),
          clear: () => {
            clearProgressId();
            updateProgressCheckboxes();
          },
        },
      };

      // Kick off: attach UI + restore scroll position if saved
      updateProgressCheckboxes();
      restoreProgressIfAny();

      log("loaded");
    })();
  }
})();
