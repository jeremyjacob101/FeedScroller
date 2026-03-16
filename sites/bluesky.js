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
        if (window.__arcJKBoostInstalled) {
          window.__arcJK?.resync?.({ shouldRestore: true });
          return;
        }
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
        let currentScope = null;
        let syncQueued = false;
        let syncRestoreRequested = false;
        let syncForceRequested = false;
        let activeRestoreRun = 0;

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
        const FOLLOWING_FEED_CONTAINER_XPATH =
          "/html/body/div[1]/div/div/div/div/div/main/div[2]/div/div/div/div[2]/div/div[5]/div/div[1]/div/div[2]/div";
        const HOME_FEED_TABS_CONTAINER_XPATH =
          "/html/body/div[1]/div/div/div/div/div/main/div[2]/div/div/div/div[2]/div/div[3]/div/div[1]/div";

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

        function normalizeKeyPart(value) {
          return (
            String(value || "")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "") || "unknown"
          );
        }

        function parseRgb(color) {
          const match = String(color || "").match(/rgba?\(([^)]+)\)/i);
          if (!match) return null;

          const channels = match[1]
            .split(",")
            .slice(0, 3)
            .map((value) => Number.parseFloat(value.trim()));

          return channels.some((value) => Number.isNaN(value))
            ? null
            : channels;
        }

        function colorLooksActive(color) {
          const rgb = parseRgb(color);
          if (!rgb) return false;
          return rgb.every((channel) => channel >= 235);
        }

        function indicatorLooksActive(el) {
          if (!el) return false;
          const style = getComputedStyle(el);
          const rgb = parseRgb(style.backgroundColor);
          const opacity = Number.parseFloat(style.opacity || "1");
          return !!rgb && opacity > 0.05 && rgb.some((channel) => channel > 0);
        }

        function findHomeFeedTabsContainer() {
          const byXpath = evalXPathFirst(HOME_FEED_TABS_CONTAINER_XPATH);
          if (byXpath) {
            const roleTabCount = byXpath.querySelectorAll('[role="tab"]').length;
            if (roleTabCount >= 2) return byXpath;
          }

          const firstTab = document.querySelector(
            '[role="tab"][data-testid^="homeScreenFeedTabs-selector-"]',
          );
          let node = firstTab?.parentElement || null;

          while (node && node !== document.body) {
            if (node.querySelectorAll('[role="tab"]').length >= 2) return node;
            node = node.parentElement;
          }

          return byXpath;
        }

        function getHomeFeedTabs() {
          const selectorTabs = Array.from(
            document.querySelectorAll(
              '[role="tab"][data-testid^="homeScreenFeedTabs-selector-"]',
            ),
          );
          const container = findHomeFeedTabsContainer();
          const containerTabs = container
            ? Array.from(container.querySelectorAll('[role="tab"]'))
            : [];

          let tabs =
            containerTabs.length > selectorTabs.length ? containerTabs : selectorTabs;

          if (!tabs.length && container) {
            tabs = Array.from(container.querySelectorAll('[tabindex]')).filter(
              (el) => {
                const text = (el.textContent || "").trim();
                return !!text;
              },
            );
          }

          return tabs.map((tab, index) => {
            const labelEl =
              Array.from(
                tab.querySelectorAll('[data-testid^="homeScreenFeedTabs-"]'),
              ).find((node) => {
                const testId = node.getAttribute("data-testid") || "";
                return !testId.includes("selector-");
              }) || tab.querySelector('[dir="auto"]');

            const testId = labelEl?.getAttribute("data-testid") || "";
            const labelFromTestId = testId.startsWith("homeScreenFeedTabs-")
              ? testId.replace("homeScreenFeedTabs-", "")
              : "";
            const label = String(
              labelFromTestId || labelEl?.textContent || tab.textContent || "",
            ).trim();
            const children = labelEl ? Array.from(labelEl.children) : [];
            const indicator =
              children.length > 0 ? children[children.length - 1] : null;

            return {
              active:
                tab.getAttribute("aria-selected") === "true" ||
                labelEl?.getAttribute("aria-selected") === "true" ||
                indicatorLooksActive(indicator) ||
                colorLooksActive(getComputedStyle(labelEl || tab).color),
              index,
              key: normalizeKeyPart(labelFromTestId || label || `tab-${index}`),
              label: label || `Tab ${index + 1}`,
              tab,
            };
          });
        }

        function getProgressScope() {
          const homeTabs = getHomeFeedTabs();
          if (homeTabs.length) {
            const activeTab = homeTabs.find((tab) => tab.active);
            if (!activeTab) {
              return {
                allowsPersistence: false,
                allowsRestore: false,
                kind: "home-tab",
                key: "unknown",
                label: "unknown",
                storageKey: null,
              };
            }

            const isPrimaryHomeTab = activeTab.index === 0;
            return {
              allowsPersistence: !isPrimaryHomeTab,
              allowsRestore: !isPrimaryHomeTab,
              kind: "home-tab",
              key: activeTab.key,
              label: activeTab.label,
              storageKey: isPrimaryHomeTab
                ? null
                : `${STORAGE_KEY}::home-tab::${activeTab.key}`,
            };
          }

          const normalizedPath =
            location.pathname.replace(/\/+$/, "").toLowerCase() || "/";
          if (normalizedPath === "/") {
            return {
              allowsPersistence: false,
              allowsRestore: false,
              kind: "home-tab",
              key: "pending",
              label: "pending",
              storageKey: null,
            };
          }

          return {
            allowsPersistence: true,
            allowsRestore: true,
            kind: "global",
            key: "global",
            label: "global",
            storageKey: STORAGE_KEY,
          };
        }

        function getScopeToken(scope) {
          if (!scope) return "none";
          return `${scope.kind}:${scope.key}:${scope.allowsPersistence ? "1" : "0"}`;
        }

        function getActiveScope() {
          if (!currentScope) currentScope = getProgressScope();
          return currentScope;
        }

        function cancelRestore() {
          activeRestoreRun += 1;
          restoring = false;
        }

        function isLikelyPostPermalinkAnchor(anchor) {
          if (!anchor) return false;
          const href = normalizeHref(anchor.getAttribute("href"));
          if (!href || !/^\/profile\/[^/]+\/post\/[^/?#]+/i.test(href)) {
            return false;
          }

          return (
            anchor.hasAttribute("data-tooltip") ||
            anchor.hasAttribute("aria-label") ||
            ((anchor.textContent || "").trim().length > 0 &&
              (anchor.textContent || "").trim().length <= 12)
          );
        }

        function hasPostContentOrControls(node) {
          if (!node) return false;

          const hasContent =
            !!node.querySelector?.('[data-testid="contentHider-post"]') ||
            !!node.querySelector?.('[data-testid="postText"]');
          const hasControls =
            !!node.querySelector?.('[data-testid="replyBtn"]') ||
            !!node.querySelector?.('[data-testid="likeBtn"]') ||
            !!node.querySelector?.('[data-testid="postShareBtn"]') ||
            !!node.querySelector?.('[data-testid="postDropdownBtn"]') ||
            !!node.querySelector?.('[data-testid="postBookmarkBtn"]');

          return hasContent || hasControls;
        }

        function shouldUseFollowingItemStrategy(scope = getActiveScope()) {
          return scope?.kind === "home-tab" && scope.key === "following";
        }

        function isFeedItemElement(el) {
          return !!getBestPermalinkAnchor(el);
        }

        function isFollowingOuterItemElement(el) {
          if (!el || el.nodeType !== 1 || el.tagName !== "DIV") return false;
          if (!hasPostContentOrControls(el)) return false;
          return !!getBestFollowingPermalinkAnchor(el);
        }

        function countLegacyPostChildren(container) {
          if (!container) return { total: 0, visible: 0 };

          let total = 0;
          let visible = 0;

          for (const child of Array.from(container.children || [])) {
            if (child.nodeType !== 1 || child.tagName !== "DIV") continue;
            if (!isFeedItemElement(child)) continue;
            total += 1;
            if (visibleInViewport(child)) visible += 1;
          }

          return { total, visible };
        }

        function scoreLegacyContainer(el) {
          const kids = Array.from(el.children).filter((c) => c.nodeType === 1);
          if (kids.length < 2) return -Infinity;

          const divKids = kids.filter((k) => k.tagName === "DIV");
          if (divKids.length / kids.length < 0.6) return -Infinity;

          const postChildren = countLegacyPostChildren(el);
          if (postChildren.total < 2) return -Infinity;

          return (
            postChildren.visible * 1000 +
            postChildren.total * 100 -
            Math.max(0, divKids.length - postChildren.total)
          );
        }

        function findLegacyFeedContainer() {
          const byXpath = evalXPathFirst(FEED_CONTAINER_XPATH);
          if (byXpath && countLegacyPostChildren(byXpath).total >= 2) {
            return byXpath;
          }

          const main = document.querySelector("main");
          if (!main) return null;

          const candidates = Array.from(main.querySelectorAll("div"));
          let best = null;
          let bestScore = -Infinity;

          for (const el of candidates) {
            const s = scoreLegacyContainer(el);
            if (s > bestScore) {
              bestScore = s;
              best = el;
            }
          }

          return best;
        }

        function countFollowingPostChildren(container) {
          if (!container) return { total: 0, visible: 0 };

          let total = 0;
          let visible = 0;

          for (const child of Array.from(container.children || [])) {
            if (!isFollowingOuterItemElement(child)) continue;
            total += 1;
            if (visibleInViewport(child)) visible += 1;
          }

          return { total, visible };
        }

        function scoreFollowingContainer(el) {
          const kids = Array.from(el.children).filter((c) => c.nodeType === 1);
          if (kids.length < 2) return -Infinity;

          const divKids = kids.filter((k) => k.tagName === "DIV");
          if (divKids.length / kids.length < 0.6) return -Infinity;

          const postChildren = countFollowingPostChildren(el);
          if (postChildren.total < 2) return -Infinity;

          return (
            postChildren.visible * 1000 +
            postChildren.total * 100 -
            Math.max(0, divKids.length - postChildren.total)
          );
        }

        function findFollowingFeedContainer() {
          const byFollowingXpath = evalXPathFirst(FOLLOWING_FEED_CONTAINER_XPATH);
          if (byFollowingXpath && countFollowingPostChildren(byFollowingXpath).total >= 2) {
            return byFollowingXpath;
          }

          const byGenericXpath = evalXPathFirst(FEED_CONTAINER_XPATH);
          if (byGenericXpath && countFollowingPostChildren(byGenericXpath).total >= 2) {
            return byGenericXpath;
          }

          const main = document.querySelector("main");
          if (!main) return null;

          const candidates = Array.from(main.querySelectorAll("div"));
          let best = null;
          let bestScore = -Infinity;

          for (const el of candidates) {
            const s = scoreFollowingContainer(el);
            if (s > bestScore) {
              bestScore = s;
              best = el;
            }
          }

          return best;
        }

        function getFollowingItems(root) {
          if (!root) return [];

          const items = [];

          for (const child of Array.from(root.children || [])) {
            if (!isFollowingOuterItemElement(child)) continue;
            child.dataset.arcJkId = getItemId(child) || "";
            items.push(child);
          }

          return items;
        }

        function countPostChildren(container) {
          const items = getItems(container);
          return {
            total: items.length,
            visible: items.filter(visibleInViewport).length,
          };
        }

        function scoreContainer(el) {
          return scoreLegacyContainer(el);
        }

        function findFeedContainer(scope = getActiveScope()) {
          if (shouldUseFollowingItemStrategy(scope)) {
            return findFollowingFeedContainer();
          }

          return findLegacyFeedContainer();
        }

        function getItems(container, scope = getActiveScope()) {
          if (shouldUseFollowingItemStrategy(scope)) {
            const root = container || findFeedContainer(scope);
            return root ? getFollowingItems(root) : [];
          }

          const root = container || findFeedContainer(scope);
          if (!root) return [];

          return Array.from(root.children || []).filter(
            (el) => el.tagName === "DIV" && isFeedItemElement(el),
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

        function depthFromAncestor(node, ancestor) {
          let depth = 0;
          let currentNode = node;

          while (currentNode && currentNode !== ancestor) {
            currentNode = currentNode.parentElement;
            depth += 1;
          }

          return currentNode === ancestor ? depth : Infinity;
        }

        function getBestFollowingPermalinkAnchor(itemEl) {
          if (!itemEl) return null;

          const itemRect = itemEl.getBoundingClientRect();
          const anchors = Array.from(
            itemEl.querySelectorAll('a[href*="/post/"]'),
          ).filter(isLikelyPostPermalinkAnchor);

          let best = null;
          let bestScore = -Infinity;

          for (const anchor of anchors) {
            const anchorRect = anchor.getBoundingClientRect();
            const depth = depthFromAncestor(anchor, itemEl);
            let score = scorePermalinkAnchor(anchor);

            score -= Math.min(160, Math.max(0, anchorRect.top - itemRect.top));
            score -= Math.min(60, depth * 4);

            if (score > bestScore) {
              bestScore = score;
              best = anchor;
            }
          }

          return best;
        }

        function getItemId(itemEl, scope = getActiveScope()) {
          const a = shouldUseFollowingItemStrategy(scope)
            ? getBestFollowingPermalinkAnchor(itemEl)
            : getBestPermalinkAnchor(itemEl);
          if (!a) return null;
          return normalizeHref(a.getAttribute("href"));
        }

        function loadProgressId(scope = getActiveScope()) {
          if (!scope?.storageKey) return null;
          const raw = localStorage.getItem(scope.storageKey);
          return raw && typeof raw === "string" ? raw : null;
        }

        function saveProgressId(id, scope = getActiveScope()) {
          if (!id || !scope?.allowsPersistence || !scope.storageKey) return false;
          localStorage.setItem(scope.storageKey, id);
          return true;
        }

        function clearProgressId(scope = getActiveScope()) {
          if (!scope?.storageKey) return false;
          localStorage.removeItem(scope.storageKey);
          return true;
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

              const scope = getActiveScope();
              if (!scope.allowsPersistence) {
                cb.checked = false;
                setCurrent(item, { preventScroll: true });
                cb.blur?.();
                return;
              }

              const id = item.dataset.arcJkId || getItemId(item);
              if (!id) {
                cb.checked = false;
                return;
              }

              item.dataset.arcJkId = id;

              if (cb.checked) {
                saveProgressId(id, scope);
              } else if (loadProgressId(scope) === id) {
                clearProgressId(scope);
              }

              updateProgressCheckboxes({ scope });
              setCurrent(item, { preventScroll: true });

              cb.blur?.();
            },
            true,
          );

          itemEl.appendChild(cb);
        }

        function updateProgressCheckboxes({
          scope = getActiveScope(),
          container = findFeedContainer(),
        } = {}) {
          const saved = scope.allowsPersistence ? loadProgressId(scope) : null;
          const items = getItems(container);

          for (const item of items) {
            ensureProgressUI(item);

            const id = getItemId(item) || "";
            item.dataset.arcJkId = id;

            const cb = item.querySelector(
              `:scope > input.${PROGRESS_BOX_CLASS}`,
            );
            if (!cb) continue;

            if (!id || !scope.allowsPersistence) {
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

          const scope = getActiveScope();
          if (!scope.allowsPersistence) {
            log("Progress disabled for current Bluesky tab:", scope.label);
            updateProgressCheckboxes({ scope });
            return;
          }

          const id = el.dataset.arcJkId || getItemId(el);
          if (!id) {
            log(
              "No permalink href found for this item; can't toggle progress.",
            );
            return;
          }

          const saved = loadProgressId(scope);

          if (saved === id) {
            clearProgressId(scope);
            updateProgressCheckboxes({ scope });
            log("Cleared progress:", id);
            return;
          }

          saveProgressId(id, scope);
          updateProgressCheckboxes({ scope });
          log("Saved progress:", id);
        }

        function move(dir) {
          const container = findFeedContainer();
          if (!container) return;

          const items = getItems(container);
          if (!items.length) return;

          for (const el of items) ensureProgressUI(el);
          updateProgressCheckboxes({ container });

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

        function syncCurrentView({ shouldRestore = false, force = false } = {}) {
          const nextScope = getProgressScope();
          const scopeChanged =
            force || getScopeToken(currentScope) !== getScopeToken(nextScope);

          if (scopeChanged) {
            cancelRestore();
            resetSelection();
          }

          currentScope = nextScope;

          const container = findFeedContainer();
          updateProgressCheckboxes({ container, scope: currentScope });

          if (scopeChanged) {
            log("Bluesky scope:", currentScope.label, currentScope);
          }

          if (shouldRestore && scopeChanged && currentScope.allowsRestore) {
            restoreProgressIfAny({ scope: currentScope });
          }
        }

        function queueViewSync({ shouldRestore = false, force = false } = {}) {
          if (shouldRestore) syncRestoreRequested = true;
          if (force) syncForceRequested = true;
          if (syncQueued) return;

          syncQueued = true;
          requestAnimationFrame(() => {
            syncQueued = false;

            const restoreRequested = syncRestoreRequested;
            const forceRequested = syncForceRequested;

            syncRestoreRequested = false;
            syncForceRequested = false;

            syncCurrentView({
              force: forceRequested,
              shouldRestore: restoreRequested,
            });
          });
        }

        function restoreProgressIfAny({ scope = getActiveScope() } = {}) {
          const savedId = loadProgressId(scope);
          if (!savedId || !scope.allowsRestore) return;

          const restoreRun = ++activeRestoreRun;
          const scopeToken = getScopeToken(scope);
          restoring = true;

          let steps = 0;
          let lastScrollHeight = 0;
          let stuckCount = 0;

          const MAX_STEPS = 200;
          const STUCK_LIMIT = 10;
          const TICK_MS = 80;

          const tick = () => {
            if (restoreRun !== activeRestoreRun) return;
            if (getScopeToken(currentScope) !== scopeToken) {
              restoring = false;
              return;
            }

            const container = findFeedContainer();
            if (!container) {
              requestAnimationFrame(tick);
              return;
            }

            updateProgressCheckboxes({ container, scope });

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

        document.addEventListener(
          "click",
          (e) => {
            const container = findHomeFeedTabsContainer();
            const tab = e.target.closest?.('[role="tab"]');
            if (!container || !tab || !container.contains(tab)) return;
            setTimeout(() => {
              queueViewSync({ shouldRestore: true });
            }, 30);
          },
          true,
        );

        window.addEventListener(
          "popstate",
          () => {
            queueViewSync({ shouldRestore: true });
          },
          true,
        );

        window.addEventListener(
          "hashchange",
          () => {
            queueViewSync({ shouldRestore: true });
          },
          true,
        );

        window.__arcJK = {
          reset: resetSelection,
          resync: (options = {}) => {
            queueViewSync({
              force: !!options.force,
              shouldRestore: options.shouldRestore !== false,
            });
          },
          dump() {
            const c = findFeedContainer();
            const items = getItems(c);
            return {
              activeScope: getActiveScope(),
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

        queueViewSync({ shouldRestore: true, force: true });

        log("loaded");
      })();
    },
  };
})();
