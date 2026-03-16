(() => {
  window.__feedScrollerSiteModules__ = window.__feedScrollerSiteModules__ || {};

  window.__feedScrollerSiteModules__.letterboxd = {
    name: "letterboxd",
    matches() {
      return /(^|\.)letterboxd\.com$/i.test(location.hostname);
    },
    install() {
      (() => {
        if (window.__arcJKLetterboxdInstalled) {
          window.__arcJKLetterboxd?.resync?.({ shouldRestore: true });
          return;
        }
        window.__arcJKLetterboxdInstalled = true;

        const shared = window.__feedScrollerShared__ || {};
        const storageLib = shared.storage;
        const jkl = shared.jkl;
        const autoscroll = shared.autoscroll;
        const runtime = shared.runtime;

        if (!storageLib || !jkl || !autoscroll || !runtime) return;

        document.documentElement.style.setProperty(
          "--arc-jk-progress-offset",
          "-24px",
        );
        document.documentElement.style.setProperty(
          "--arc-jk-item-overflow",
          "visible",
        );

        const HIGHLIGHT_CLASS = "__arc_jk_selected__";
        const ITEM_CLASS = "__arc_jk_item__";
        const PROGRESS_BOX_CLASS = "__arc_jk_progress_box__";
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

        let controller = null;

        function normalizedPath() {
          return location.pathname.replace(/\/+$/, "");
        }

        function isActivityRoute() {
          return (
            /(^|\.)letterboxd\.com$/i.test(location.hostname) &&
            normalizedPath() === "/activity"
          );
        }

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

        function findPostsContainer() {
          return evalXPathFirst(POSTS_CONTAINER_XPATH);
        }

        function getItems() {
          const snapshot = evalXPathSnapshot(POSTS_XPATH_BASE);
          if (!snapshot) return [];

          const items = [];
          for (let index = 0; index < snapshot.snapshotLength; index += 1) {
            const node = snapshot.snapshotItem(index);
            if (node && node.nodeType === 1) items.push(node);
          }

          return items;
        }

        function getItemId(itemEl) {
          if (!itemEl) return null;
          const id =
            itemEl.getAttribute("data-activity-id") ||
            itemEl.dataset.activityId;
          return id ? String(id) : null;
        }

        function findLoadMoreButton() {
          return evalXPathFirst(LOAD_MORE_BTN_XPATH);
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

        function scrollToBottomInstant() {
          const height =
            document.documentElement.scrollHeight || document.body.scrollHeight;

          controller?.markNavScrolling();
          window.scrollTo({ top: height, left: 0, behavior: "auto" });
          window.scrollBy(0, -1);
          window.scrollBy(0, +1);
        }

        let lastClickedSignature = "";
        let lastClickedAt = 0;

        function tryLoadMore() {
          scrollToBottomInstant();

          const button = findLoadMoreButton();
          if (!button || !isClickable(button)) return false;

          const signature =
            button.getAttribute("href") || button.textContent || "btn";
          const now = Date.now();

          if (signature === lastClickedSignature && now - lastClickedAt < 900) {
            return true;
          }

          lastClickedSignature = signature;
          lastClickedAt = now;
          button.click();
          return true;
        }

        function getLastItemSignature() {
          const items = getItems();
          if (!items.length) return "";

          const lastItem = items[items.length - 1];
          return getItemId(lastItem) || String(items.length);
        }

        const progressStorage = storageLib.createSingleScopeStorage({
          allowsPersistence: true,
          allowsRestore: true,
          key: "activity",
          kind: "activity-tab",
          label: "Activity",
          storageKey: STORAGE_KEY,
        });

        let feedObserver = null;

        function startObservingFeed() {
          const container = findPostsContainer();
          if (!container || feedObserver) return;

          feedObserver = new MutationObserver(() => {
            controller?.queueSync();
          });

          feedObserver.observe(container, { childList: true, subtree: false });
        }

        const runtimeInstance = runtime.createSingleScopeSiteRuntime({
          autoscroll,
          controller: {
            canToggleProgress: () => true,
            focusCurrent: true,
            isEnabled: () => isActivityRoute(),
            renderer: jkl.createInlineRenderer({
              highlightClass: HIGHLIGHT_CLASS,
              itemClass: ITEM_CLASS,
              prepareCheckbox(checkbox) {
                checkbox.style.position = "absolute";
                checkbox.style.left = "var(--arc-jk-progress-offset)";
                checkbox.style.top = "50%";
                checkbox.style.transform = "translateY(-50%)";
              },
              prepareItem(itemEl) {
                itemEl.style.position = "relative";
                itemEl.style.setProperty("overflow", "visible", "important");
              },
              progressBoxClass: PROGRESS_BOX_CLASS,
            }),
          },
          exportName: "__arcJKLetterboxd",
          getItemId,
          getItems,
          initialRestore: true,
          jkl,
          onResync(context) {
            controller = context.controller;
            startObservingFeed();
          },
          restorer: {
            isEnabled: () => isActivityRoute(),
            strategy: autoscroll.createLoadMoreStrategy({
              getSignature: () => getLastItemSignature(),
              isReady: () => isActivityRoute() && !!findPostsContainer(),
              maxSteps: RESTORE_MAX_STEPS,
              startDelayMs: 60,
              stuckLimit: STUCK_LIMIT,
              tickMs: RESTORE_TICK_MS,
              tryAdvance: () => tryLoadMore(),
            }),
          },
          storage: progressStorage,
        });

        controller = runtimeInstance.controller;
      })();
    },
  };
})();
