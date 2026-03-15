(() => {
  window.__feedScrollerSiteModules__ = window.__feedScrollerSiteModules__ || {};

  window.__feedScrollerSiteModules__.bluesky = {
    name: "bluesky",
    matches() {
      return /^bsky\.app$/i.test(
        location.hostname.replace(/^www\./i, "").toLowerCase(),
      );
    },
    install() {
      (() => {
        if (window.__arcJKBoostInstalled) return;
        window.__arcJKBoostInstalled = true;

        const DEBUG = false;

        const HIGHLIGHT_CLASS = "__arc_jk_selected__";
        const PROGRESS_BOX_CLASS = "__arc_jk_progress_box__";
        const ITEM_CLASS = "__arc_jk_item__";

        const MIN_ITEM_HEIGHT = 24;
        const NAV_SCROLL_GRACE_MS = 700;
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

          .${ITEM_CLASS} { position: relative; }

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

          .${ITEM_CLASS} .${PROGRESS_BOX_CLASS},
          .${HIGHLIGHT_CLASS} .${PROGRESS_BOX_CLASS} {
            opacity: 1;
          }
        `;
        document.documentElement.appendChild(style);

        let current = null;

        let navScrolling = false;
        let navScrollTimer = null;

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

        function normalizeHref(href) {
          if (!href) return null;
          try {
            const u = new URL(href, location.origin);
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

          const txt = (a.textContent || "").trim();
          if (txt.length > 0 && txt.length <= 8) s += 10;

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

              if (cb.checked) {
                saveProgressId(id);
              } else if (loadProgressId() === id) {
                clearProgressId();
              }

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
          const container = findFeedContainer();
          const items = getItems(container);

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
          if (!id) {
            log(
              "No permalink href found for this item; can't toggle progress.",
            );
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

        let feedObserver = null;

        function startObservingFeed(container) {
          if (!container) return;
          if (feedObserver) return;

          feedObserver = new MutationObserver(() => {
            updateProgressCheckboxes();
          });

          feedObserver.observe(container, { childList: true, subtree: false });
        }

        function move(dir) {
          const container = findFeedContainer();
          if (!container) return;

          startObservingFeed(container);

          const items = getItems(container);
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
            log("anchored to middle", items.indexOf(mid));
            return;
          }

          let idx = items.indexOf(current);

          if (idx === -1) {
            setCurrent(mid);
            log("re-anchored to middle", items.indexOf(mid));
            return;
          }

          const nextIdx = Math.max(0, Math.min(items.length - 1, idx + dir));
          setCurrent(items[nextIdx]);
          log("moved to", nextIdx);
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

        function findItemBySavedId(container, savedId) {
          if (!container || !savedId) return null;
          const items = getItems(container);

          for (const item of items) {
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

          const MAX_STEPS = 200;
          const STUCK_LIMIT = 10;
          const TICK_MS = 80;

          const tick = () => {
            const container = findFeedContainer();
            if (!container) {
              requestAnimationFrame(tick);
              return;
            }

            startObservingFeed(container);

            updateProgressCheckboxes();

            const found = findItemBySavedId(container, savedId);
            if (found) {
              setCurrent(found);
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

            const h =
              document.documentElement.scrollHeight ||
              document.body.scrollHeight;

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

            window.scrollBy(0, -1);
            window.scrollBy(0, +1);

            setTimeout(tick, TICK_MS);
          };

          setTimeout(tick, 50);
        }

        document.addEventListener(
          "keydown",
          (e) => {
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

        updateProgressCheckboxes();
        restoreProgressIfAny();

        log("loaded");
      })();
    },
  };
})();
