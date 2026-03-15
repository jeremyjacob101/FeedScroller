(() => {
  window.__feedScrollerSiteModules__ = window.__feedScrollerSiteModules__ || {};

  window.__feedScrollerSiteModules__.letterboxd = {
    name: "letterboxd",
    matches() {
      return /(^|\.)letterboxd\.com$/i.test(location.hostname);
    },
    install() {
      (() => {
        const DEBUG = false;

        const hostIsLetterboxd = () =>
          /(^|\.)letterboxd\.com$/i.test(location.hostname);
        const normalizedPath = () => location.pathname.replace(/\/+$/, "");
        const isActivityRoute = () =>
          hostIsLetterboxd() && normalizedPath() === "/activity";

        const dlog = (...args) => {
          if (DEBUG) console.log("[arc-boost]", ...args);
        };

        if (!isActivityRoute()) return;

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
            itemEl.getAttribute("data-activity-id") ||
            itemEl.dataset.activityId;
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

            const cb = item.querySelector(
              `:scope > input.${PROGRESS_BOX_CLASS}`,
            );
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
    },
  };
})();
