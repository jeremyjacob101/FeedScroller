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

        const shared = window.__feedScrollerShared__ || {};
        const storageLib = shared.storage;
        const jkl = shared.jkl;
        const autoscroll = shared.autoscroll;
        const runtime = shared.runtime;

        if (!storageLib || !jkl || !autoscroll || !runtime) return;

        document.documentElement.style.setProperty(
          "--arc-jk-progress-offset",
          "-30px",
        );
        document.documentElement.style.removeProperty("--arc-jk-item-overflow");

        const HIGHLIGHT_CLASS = "__arc_jk_selected__";
        const ITEM_CLASS = "__arc_jk_item__";
        const PROGRESS_BOX_CLASS = "__arc_jk_progress_box__";
        const STORAGE_KEY = "arc-jk-progress-href-v1";

        const FEED_CONTAINER_XPATH =
          "/html/body/div[1]/div/div/div/div/div/main/div[2]/div/div/div/div[2]/div/div[6]/div/div[1]/div/div[2]/div";
        const FOLLOWING_FEED_CONTAINER_XPATH =
          "/html/body/div[1]/div/div/div/div/div/main/div[2]/div/div/div/div[2]/div/div[5]/div/div[1]/div/div[2]/div";
        const HOME_FEED_TABS_CONTAINER_XPATH =
          "/html/body/div[1]/div/div/div/div/div/main/div[2]/div/div/div/div[2]/div/div[3]/div/div[1]/div";

        function evalXPathFirst(path) {
          try {
            const result = document.evaluate(
              path,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            );
            return result.singleNodeValue || null;
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
            const tabCount = byXpath.querySelectorAll('[role="tab"]').length;
            if (tabCount >= 2) return byXpath;
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
            containerTabs.length > selectorTabs.length
              ? containerTabs
              : selectorTabs;

          if (!tabs.length && container) {
            tabs = Array.from(container.querySelectorAll("[tabindex]")).filter(
              (el) => !!String(el.textContent || "").trim(),
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
              key: storageLib.normalizeKeyPart(
                labelFromTestId || label || `tab-${index}`,
              ),
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
              return storageLib.createScope({
                allowsPersistence: false,
                allowsRestore: false,
                key: "unknown",
                kind: "home-tab",
                label: "unknown",
              });
            }

            const isPrimaryHomeTab = activeTab.index === 0;
            return storageLib.createScope({
              allowsPersistence: !isPrimaryHomeTab,
              allowsRestore: !isPrimaryHomeTab,
              key: activeTab.key,
              kind: "home-tab",
              label: activeTab.label,
              storageKey: isPrimaryHomeTab
                ? null
                : storageLib.buildScopedStorageKey(
                    STORAGE_KEY,
                    "home-tab",
                    activeTab.key,
                  ),
            });
          }

          const normalizedPath =
            location.pathname.replace(/\/+$/, "").toLowerCase() || "/";
          if (normalizedPath === "/") {
            return storageLib.createScope({
              allowsPersistence: false,
              allowsRestore: false,
              key: "pending",
              kind: "home-tab",
              label: "pending",
            });
          }

          return storageLib.createScope({
            allowsPersistence: true,
            allowsRestore: true,
            key: "global",
            kind: "global",
            label: "global",
            storageKey: STORAGE_KEY,
          });
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

        function scorePermalinkAnchor(anchor) {
          if (!anchor) return -Infinity;

          const href = anchor.getAttribute("href") || "";
          if (!href.includes("/post/")) return -Infinity;

          let score = 0;
          if (anchor.hasAttribute("aria-label")) score += 100;
          if (anchor.hasAttribute("data-tooltip")) score += 60;
          if ((anchor.getAttribute("role") || "").toLowerCase() === "link") {
            score += 20;
          }

          const text = (anchor.textContent || "").trim();
          if (text.length > 0 && text.length <= 8) score += 10;

          score -= Math.min(10, href.length / 50);
          return score;
        }

        function getBestPermalinkAnchor(itemEl) {
          if (!itemEl) return null;

          const anchors = Array.from(
            itemEl.querySelectorAll('a[href*="/post/"]'),
          );
          if (!anchors.length) return null;

          let best = null;
          let bestScore = -Infinity;

          for (const anchor of anchors) {
            const score = scorePermalinkAnchor(anchor);
            if (score > bestScore) {
              best = anchor;
              bestScore = score;
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
              best = anchor;
              bestScore = score;
            }
          }

          return best;
        }

        function shouldUseFollowingItemStrategy(scope = getProgressScope()) {
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
            if (jkl.visibleInViewport(child)) visible += 1;
          }

          return { total, visible };
        }

        function scoreLegacyContainer(el) {
          const children = Array.from(el.children).filter(
            (child) => child.nodeType === 1,
          );
          if (children.length < 2) return -Infinity;

          const divChildren = children.filter(
            (child) => child.tagName === "DIV",
          );
          if (divChildren.length / children.length < 0.6) return -Infinity;

          const postChildren = countLegacyPostChildren(el);
          if (postChildren.total < 2) return -Infinity;

          return (
            postChildren.visible * 1000 +
            postChildren.total * 100 -
            Math.max(0, divChildren.length - postChildren.total)
          );
        }

        function findLegacyFeedContainer() {
          const byXpath = evalXPathFirst(FEED_CONTAINER_XPATH);
          if (byXpath && countLegacyPostChildren(byXpath).total >= 2) {
            return byXpath;
          }

          const main = document.querySelector("main");
          if (!main) return null;

          let best = null;
          let bestScore = -Infinity;

          for (const el of Array.from(main.querySelectorAll("div"))) {
            const score = scoreLegacyContainer(el);
            if (score > bestScore) {
              best = el;
              bestScore = score;
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
            if (jkl.visibleInViewport(child)) visible += 1;
          }

          return { total, visible };
        }

        function scoreFollowingContainer(el) {
          const children = Array.from(el.children).filter(
            (child) => child.nodeType === 1,
          );
          if (children.length < 2) return -Infinity;

          const divChildren = children.filter(
            (child) => child.tagName === "DIV",
          );
          if (divChildren.length / children.length < 0.6) return -Infinity;

          const postChildren = countFollowingPostChildren(el);
          if (postChildren.total < 2) return -Infinity;

          return (
            postChildren.visible * 1000 +
            postChildren.total * 100 -
            Math.max(0, divChildren.length - postChildren.total)
          );
        }

        function findFollowingFeedContainer() {
          const byFollowingXpath = evalXPathFirst(
            FOLLOWING_FEED_CONTAINER_XPATH,
          );
          if (
            byFollowingXpath &&
            countFollowingPostChildren(byFollowingXpath).total >= 2
          ) {
            return byFollowingXpath;
          }

          const byGenericXpath = evalXPathFirst(FEED_CONTAINER_XPATH);
          if (
            byGenericXpath &&
            countFollowingPostChildren(byGenericXpath).total >= 2
          ) {
            return byGenericXpath;
          }

          const main = document.querySelector("main");
          if (!main) return null;

          let best = null;
          let bestScore = -Infinity;

          for (const el of Array.from(main.querySelectorAll("div"))) {
            const score = scoreFollowingContainer(el);
            if (score > bestScore) {
              best = el;
              bestScore = score;
            }
          }

          return best;
        }

        function findFeedContainer(scope = getProgressScope()) {
          if (shouldUseFollowingItemStrategy(scope)) {
            return findFollowingFeedContainer();
          }
          return findLegacyFeedContainer();
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

        function getItems(scope = getProgressScope()) {
          const root = findFeedContainer(scope);
          if (!root) return [];

          if (shouldUseFollowingItemStrategy(scope)) {
            return getFollowingItems(root);
          }

          return Array.from(root.children || []).filter(
            (el) => el.tagName === "DIV" && isFeedItemElement(el),
          );
        }

        function getItemId(itemEl, scope = getProgressScope()) {
          const anchor = shouldUseFollowingItemStrategy(scope)
            ? getBestFollowingPermalinkAnchor(itemEl)
            : getBestPermalinkAnchor(itemEl);
          if (!anchor) return null;
          return normalizeHref(anchor.getAttribute("href"));
        }
        runtime.createScopedSiteRuntime({
          autoscroll,
          controller: {
            canToggleProgress: (scope) => !!scope?.allowsPersistence,
            focusCurrent: true,
            isEnabled: () => true,
            renderer: jkl.createInlineRenderer({
              highlightClass: HIGHLIGHT_CLASS,
              itemClass: ITEM_CLASS,
              progressBoxClass: PROGRESS_BOX_CLASS,
            }),
          },
          events: {
            click: {
              matches(event) {
                const container = findHomeFeedTabsContainer();
                const tab = event.target.closest?.('[role="tab"]');
                return !!(container && tab && container.contains(tab));
              },
            },
            hashchange: true,
            popstate: true,
          },
          exportName: "__arcJK",
          getItemId,
          getItems,
          getScope: getProgressScope,
          jkl,
          restorer: {
            isEnabled: (scope) => !!scope,
            strategy: autoscroll.createDocumentBottomScrollStrategy({
              isReady() {
                return !!findFeedContainer(getProgressScope());
              },
              maxSteps: 200,
              startDelayMs: 50,
              stopWhenStuckAtOrAbove: true,
              stuckLimit: 10,
              tickMs: 80,
            }),
          },
          storageLib,
        });
      })();
    },
  };
})();
