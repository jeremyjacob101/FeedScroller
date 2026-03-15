(() => {
  window.__feedScrollerSiteModules__ = window.__feedScrollerSiteModules__ || {};

  window.__feedScrollerSiteModules__.x = {
    name: "x",
    matches() {
      return (
        /(^|\.)x\.com$/i.test(location.hostname) ||
        /(^|\.)twitter\.com$/i.test(location.hostname)
      );
    },
    install() {
      (() => {
        if (window.__arcJKBoostInstalled_X) return;
        window.__arcJKBoostInstalled_X = true;

        const KEY_SINK_ID = "__arc_jk_key_sink__";
        const STORAGE_KEY = "arc-jk-progress-x-status-v3";
        const DEBUG_STORAGE_KEY = "arc-jk-debug-x-enabled-v1";

        const BLOCK_PHRASES = ["stuns for", "bridgerton"];

        const HOME_TAB_XPATH =
          "/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/nav/div/div[2]/div/div[1]";
        const MOVIES_TAB_XPATH =
          "/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/nav/div/div[2]/div/div[4]";

        const MOVIES_TAB_SELECTED_XPATH =
          "/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/nav/div/div[2]/div/div[4]/div";

        const HIGHLIGHT_BOX_ID = "__arc_jk_highlight_box__";
        const PROGRESS_BOX_CLASS = "__arc_jk_progress_box__";

        const DEBUG_BOX_ID = "__arc_jk_debug_box__";
        const MIN_ITEM_HEIGHT = 24;
        const NAV_SCROLL_GRACE_MS = 700;

        const RESTORE_MAX_MS = 60000;
        const RESTORE_TICK_MS = 120;
        const RESTORE_MAX_STUCK_TICKS = 140;
        const RESTORE_STEP_FACTOR = 0.9;
        const RESTORE_BOTTOM_MARGIN_SCREENS = 2.0;

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
            document.scrollingElement ||
            document.documentElement ||
            document.body
          );
        }

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

        function extractStatusId(href) {
          if (!href) return null;
          try {
            const u = new URL(href, location.origin);
            const path = u.pathname || "";
            const m = path.match(/\/status\/(\d+)/);
            return m ? m[1] : null;
          } catch {
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

          if (!isMoviesActiveNow()) {
            deactivateMovies();
            return;
          }

          ensureHighlightBox();
          if (DEBUG) ensureDebugBox();

          const items = getItems();
          const saved = loadProgressId();

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

            const step = Math.max(
              240,
              Math.floor((window.innerHeight || 800) * RESTORE_STEP_FACTOR),
            );

            const nearBottomThreshold =
              scrollHeight - clientHeight * RESTORE_BOTTOM_MARGIN_SCREENS;
            let targetTop;

            if (scrollTop >= nearBottomThreshold) {
              targetTop = Math.min(
                scrollHeight - clientHeight,
                scrollTop + step,
              );
            } else {
              targetTop = Math.min(
                scrollHeight - clientHeight,
                scrollTop + step,
              );
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

            window.scrollBy(0, 1);
            window.scrollBy(0, -1);

            setTimeout(tick, RESTORE_TICK_MS);
          };

          setTimeout(tick, 50);
        }

        function activateMovies() {
          if (moviesActive) return;
          moviesActive = true;

          ensureHighlightBox();
          if (DEBUG) ensureDebugBox();

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

        function handleKey(e) {
          if (!moviesActive) return;
          if (e.type !== "keydown") return;

          const key = (e.key || "").toLowerCase();
          if (key !== "j" && key !== "k" && key !== "l") return;

          if (e.metaKey || e.ctrlKey || e.altKey) return;

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

        const mo = new MutationObserver(() => {
          if (!moviesActive) return;
          if (!isMoviesActiveNow()) deactivateMovies();
          else queueSync();
        });
        mo.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });

        deactivateMovies();

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

        if (DEBUG) ensureDebugBox();
      })();
    },
  };
})();
