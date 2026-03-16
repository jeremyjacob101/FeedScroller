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
        if (window.__arcJKBoostInstalled_X) {
          window.__arcJK_X?.resync?.({ shouldRestore: true });
          return;
        }
        window.__arcJKBoostInstalled_X = true;

        const shared = window.__feedScrollerShared__ || {};
        const storageLib = shared.storage;
        const jkl = shared.jkl;
        const autoscroll = shared.autoscroll;
        const runtime = shared.runtime;

        if (!storageLib || !jkl || !autoscroll || !runtime) return;

        document.documentElement.style.removeProperty(
          "--arc-jk-progress-offset",
        );
        document.documentElement.style.removeProperty("--arc-jk-item-overflow");

        const BLOCK_PHRASES = ["stuns for", "bridgerton"];
        const HIGHLIGHT_BOX_ID = "__arc_jk_highlight_box__";
        const KEY_SINK_ID = "__arc_jk_key_sink__";
        const PROGRESS_BOX_CLASS = "__arc_jk_progress_box__";
        const STORAGE_KEY = "arc-jk-progress-x-status-v3";
        const TIMELINE_TABS_CONTAINER_XPATH =
          "/html/body/div[1]/div/div/div[2]/main/div/div/div/div[1]/div/div[1]/div[1]/div/nav/div/div[2]/div";

        const RESTORE_MAX_MS = 60000;
        const RESTORE_POST_LOAD_DELAY_MS = 320;
        const RESTORE_MAX_STUCK_TICKS = 140;
        const RESTORE_TICK_MS = 120;

        let controller = null;

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

        function getScrollEl() {
          return (
            document.scrollingElement ||
            document.documentElement ||
            document.body
          );
        }

        function getTimelineTabLabel(tab) {
          if (!tab) return "";
          const label =
            tab.querySelector("span")?.textContent ||
            tab.textContent ||
            tab.getAttribute("aria-label") ||
            "";
          return String(label).trim();
        }

        function findTimelineTabsContainer() {
          const byXpath = evalXPathFirst(TIMELINE_TABS_CONTAINER_XPATH);
          if (byXpath && byXpath.querySelectorAll('[role="tab"]').length) {
            return byXpath;
          }

          const main = document.querySelector("main");
          if (!main) return null;

          for (const nav of Array.from(main.querySelectorAll("nav"))) {
            const tabs = Array.from(nav.querySelectorAll('[role="tab"]'));
            if (tabs.length < 2) continue;

            const labels = tabs
              .map((tab) => getTimelineTabLabel(tab).toLowerCase())
              .filter(Boolean);

            if (labels.includes("for you") || labels.includes("following")) {
              return nav;
            }
          }

          return null;
        }

        function getTimelineTabs() {
          const container = findTimelineTabsContainer();
          if (!container) return [];

          return Array.from(container.querySelectorAll('[role="tab"]'))
            .map((tab, index) => {
              const label = getTimelineTabLabel(tab);
              return {
                active: tab.getAttribute("aria-selected") === "true",
                index,
                key: storageLib.normalizeKeyPart(label || `tab-${index}`),
                label: label || `Tab ${index + 1}`,
                tab,
              };
            })
            .filter((tab) => !!tab.label);
        }

        function getTimelineScope() {
          const tabs = getTimelineTabs();
          if (!tabs.length) {
            const normalizedPath =
              location.pathname.replace(/\/+$/, "").toLowerCase() || "/";

            if (normalizedPath === "/home") {
              return storageLib.createScope({
                allowsPersistence: false,
                allowsRestore: false,
                key: "pending",
                kind: "timeline",
                label: "pending",
              });
            }

            return null;
          }

          const activeTab = tabs.find((tab) => tab.active);
          if (!activeTab) {
            return storageLib.createScope({
              allowsPersistence: false,
              allowsRestore: false,
              key: "unknown",
              kind: "timeline",
              label: "unknown",
            });
          }

          const isPrimaryTab = activeTab.index === 0;
          return storageLib.createScope({
            allowsPersistence: !isPrimaryTab,
            allowsRestore: !isPrimaryTab,
            key: activeTab.key,
            kind: "timeline",
            label: activeTab.label,
            storageKey: isPrimaryTab
              ? null
              : storageLib.buildScopedStorageKey(
                  STORAGE_KEY,
                  "timeline",
                  activeTab.key,
                ),
          });
        }

        function clickedInsideTimelineTab(event) {
          const tab = event.target.closest?.('[role="tab"]');
          const container = findTimelineTabsContainer();
          return !!(tab && container && container.contains(tab));
        }

        function extractStatusId(href) {
          if (!href) return null;

          try {
            const url = new URL(href, location.origin);
            const match = (url.pathname || "").match(/\/status\/(\d+)/);
            return match ? match[1] : null;
          } catch {
            const match = String(href).match(/\/status\/(\d+)/);
            return match ? match[1] : null;
          }
        }

        function getPermalinkAnchor(itemEl) {
          if (!itemEl) return null;

          const anchorWithTime = itemEl
            .querySelector('a[href*="/status/"] time[datetime]')
            ?.closest('a[href*="/status/"]');
          if (anchorWithTime) return anchorWithTime;

          return itemEl.querySelector('a[href*="/status/"]');
        }

        function getItemId(itemEl) {
          const anchor = getPermalinkAnchor(itemEl);
          if (!anchor) return null;
          return extractStatusId(anchor.getAttribute("href"));
        }

        function getCachedItemId(itemEl) {
          if (!itemEl) return "";

          const id = itemEl.dataset.arcJkId || getItemId(itemEl) || "";
          if (id) itemEl.dataset.arcJkId = id;
          return id;
        }

        function normalizeTextForMatch(text) {
          return String(text || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        }

        function shouldBlockItem(itemEl) {
          if (!itemEl) return false;
          const text = normalizeTextForMatch(itemEl.innerText);
          if (!text) return false;

          for (const phrase of BLOCK_PHRASES) {
            const normalizedPhrase = normalizeTextForMatch(phrase);
            if (normalizedPhrase && text.includes(normalizedPhrase))
              return true;
          }

          return false;
        }

        function blockItem(itemEl) {
          if (!itemEl || itemEl.dataset.arcJkBlocked === "1") return;

          itemEl.dataset.arcJkBlocked = "1";
          itemEl.style.display = "none";
          itemEl.setAttribute("aria-hidden", "true");

          if (controller?.getCurrent() === itemEl) {
            controller.clearSelection();
          }
        }

        function itemFromArticle(article) {
          return article.closest('div[data-testid="cellInnerDiv"]') || article;
        }

        function getItems() {
          const main = document.querySelector("main");
          if (!main) return [];

          const articles = Array.from(main.querySelectorAll("article")).filter(
            (article) => !!article.querySelector('a[href*="/status/"]'),
          );

          const items = [];
          const seen = new Set();

          for (const article of articles) {
            const item = itemFromArticle(article);
            if (!item || seen.has(item)) continue;
            seen.add(item);

            if (shouldBlockItem(item)) {
              blockItem(item);
              continue;
            }

            items.push(item);
          }

          items.sort(
            (left, right) =>
              left.getBoundingClientRect().top -
              right.getBoundingClientRect().top,
          );

          return items;
        }

        function getRestoreSnapshot() {
          const scrollEl = getScrollEl();
          const items = getItems();
          const firstItem = items[0] || null;
          const lastItem = items[items.length - 1] || null;

          return {
            firstItemId: getCachedItemId(firstItem),
            itemCount: items.length,
            lastItemId: getCachedItemId(lastItem),
            scrollHeight: scrollEl.scrollHeight || 0,
            scrollTop: scrollEl.scrollTop || 0,
          };
        }

        function isRestoreProgressing({ current, previous }) {
          if (autoscroll.defaultIsScrollProgressing({ current, previous })) {
            return true;
          }

          if (!current || !previous) return true;
          if (current.firstItemId && current.firstItemId !== previous.firstItemId) {
            return true;
          }

          return !!current.lastItemId && current.lastItemId !== previous.lastItemId;
        }

        function shouldPauseAfterRestoreProgress({ current, previous }) {
          if (!current || !previous) return false;

          if ((current.itemCount || 0) > (previous.itemCount || 0)) {
            return true;
          }

          if (
            (current.scrollHeight || 0) > (previous.scrollHeight || 0) + 2
          ) {
            return true;
          }

          if (current.firstItemId && current.firstItemId !== previous.firstItemId) {
            return true;
          }

          return !!current.lastItemId && current.lastItemId !== previous.lastItemId;
        }

        const renderer = jkl.createOverlayRenderer({
          highlightBoxId: HIGHLIGHT_BOX_ID,
          keySinkId: KEY_SINK_ID,
          progressBoxClass: PROGRESS_BOX_CLASS,
          viewportBottomScreens: 2,
          viewportTopScreens: 1,
        });

        const runtimeInstance = runtime.createScopedSiteRuntime({
          autoscroll,
          controller: {
            allowTypingTarget: (el) => el === renderer.getKeySink?.(),
            canToggleProgress: (scope) => !!scope?.allowsPersistence,
            focusCurrent: false,
            installResetHandlers: true,
            installSyncHandlers: true,
            isEnabled: (scope) => !!scope?.allowsRestore,
            renderer,
            resetHandlerOptions: { events: ["scroll"] },
            syncHandlerOptions: { events: ["scroll", "resize"] },
          },
          events: {
            click: {
              matches: clickedInsideTimelineTab,
            },
            hashchange: true,
            mutation: {
              target: () => document.documentElement,
              options: {
                childList: true,
                subtree: true,
              },
            },
            popstate: true,
          },
          exportApi({ controller, progressStorage, queueScopeSync, restorer }) {
            return {
              activate: () =>
                queueScopeSync({ force: true, shouldRestore: true }),
              deactivate: () => {
                restorer.cancel();
                controller.deactivate();
              },
              forceSync: () => {
                queueScopeSync({ force: true });
                controller.queueSync();
              },
              getActiveScope: () => progressStorage.getScope(),
              isMoviesActiveNow() {
                return !!getTimelineScope()?.allowsRestore;
              },
              progress: runtime.createProgressApi({
                controller,
                storage: progressStorage,
              }),
              resync: (options = {}) => {
                queueScopeSync({
                  force: !!options.force,
                  shouldRestore: options.shouldRestore !== false,
                });
              },
            };
          },
          exportName: "__arcJK_X",
          getItemId,
          getItems,
          getScope: getTimelineScope,
          jkl,
          restoreDelayMs: 120,
          restorer: {
            isEnabled: (scope) => !!scope?.allowsRestore,
            strategy: autoscroll.createBottomScrollStrategy({
              delayAfterProgressMs: RESTORE_POST_LOAD_DELAY_MS,
              getScrollEl,
              getSnapshot: getRestoreSnapshot,
              isProgressing: isRestoreProgressing,
              maxMs: RESTORE_MAX_MS,
              maxSteps: null,
              shouldPauseAfterProgress: shouldPauseAfterRestoreProgress,
              startDelayMs: 50,
              stopWhenStuckAtOrAbove: true,
              stuckLimit: RESTORE_MAX_STUCK_TICKS,
              tickMs: RESTORE_TICK_MS,
            }),
          },
          storageLib,
        });

        controller = runtimeInstance.controller;
      })();
    },
  };
})();
