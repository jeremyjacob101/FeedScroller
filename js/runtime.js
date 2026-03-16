(() => {
  window.__feedScrollerShared__ = window.__feedScrollerShared__ || {};

  if (window.__feedScrollerShared__.runtime) return;

  function createProgressApi({ controller, storage }) {
    return {
      clear() {
        storage.clear(storage.getScope());
        controller.queueSync();
      },
      get() {
        return storage.load(storage.getScope());
      },
    };
  }

  function createFindItemBySavedId({
    getItems,
    getItemId,
    getScope = () => undefined,
  }) {
    return function findItemBySavedId(savedId, scope = getScope()) {
      if (!savedId) return null;

      for (const item of getItems(scope)) {
        const id = item.dataset.arcJkId || getItemId(item, scope);
        if (!id) continue;

        item.dataset.arcJkId = id;
        if (id === savedId) return item;
      }

      return null;
    };
  }

  function createQueuedSync(syncNow) {
    let forceRequested = false;
    let queued = false;
    let restoreRequested = false;

    return function queueSync({ shouldRestore = false, force = false } = {}) {
      if (shouldRestore) restoreRequested = true;
      if (force) forceRequested = true;
      if (queued) return;

      queued = true;
      requestAnimationFrame(() => {
        queued = false;

        const nextRestore = restoreRequested;
        const nextForce = forceRequested;

        restoreRequested = false;
        forceRequested = false;

        syncNow({
          force: nextForce,
          shouldRestore: nextRestore,
        });
      });
    };
  }

  function installWindowResyncEvents(
    queueSync,
    {
      click = null,
      hashchange = false,
      mutation = null,
      popstate = false,
    } = {},
  ) {
    const cleanups = [];

    if (click?.matches) {
      const clickTarget = click.target || document;
      const clickDelayMs = click.delayMs ?? 30;
      const listener = (event) => {
        if (!click.matches(event)) return;

        setTimeout(() => {
          queueSync({ shouldRestore: true });
        }, clickDelayMs);
      };

      clickTarget.addEventListener("click", listener, true);
      cleanups.push(() =>
        clickTarget.removeEventListener("click", listener, true),
      );
    }

    if (mutation) {
      const target = mutation.target?.() || document.documentElement;
      if (target) {
        const observer = new MutationObserver(() => {
          queueSync({ shouldRestore: true });
        });

        observer.observe(target, mutation.options || {
          childList: true,
          subtree: true,
        });

        cleanups.push(() => observer.disconnect());
      }
    }

    if (popstate) {
      const listener = () => {
        queueSync({ shouldRestore: true });
      };

      window.addEventListener("popstate", listener, true);
      cleanups.push(() => window.removeEventListener("popstate", listener, true));
    }

    if (hashchange) {
      const listener = () => {
        queueSync({ shouldRestore: true });
      };

      window.addEventListener("hashchange", listener, true);
      cleanups.push(() =>
        window.removeEventListener("hashchange", listener, true),
      );
    }

    return () => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
  }

  function createScopedSiteRuntime({
    autoscroll,
    controller: controllerOptions,
    events = {},
    exportApi = null,
    exportName = null,
    findItemBySavedId = null,
    getItemId,
    getItems,
    getScope,
    initialSync = { force: true, shouldRestore: true },
    jkl,
    restoreDelayMs = 0,
    restorer: restorerOptions,
    shouldRestoreScope = (scope) => !!scope?.allowsRestore,
    storageLib,
  }) {
    const {
      installKeyHandler = true,
      keyHandlerOptions = {},
      installResetHandlers = true,
      resetHandlerOptions = {},
      installSyncHandlers = false,
      syncHandlerOptions = {},
      ...controllerConfig
    } = controllerOptions;

    const { sync: restorerSync, ...restorerConfig } = restorerOptions;

    const progressStorage = storageLib.createStorage({ getScope });
    progressStorage.setScope(getScope());

    const resolvedFindItemBySavedId =
      findItemBySavedId ||
      createFindItemBySavedId({
        getItemId,
        getItems,
        getScope: () => progressStorage.getScope(),
      });

    const controller = jkl.createController({
      ...controllerConfig,
      getItemId,
      getItems,
      storage: progressStorage,
    });

    if (installKeyHandler) {
      controller.installKeyHandler(keyHandlerOptions);
    }

    if (installResetHandlers) {
      controller.installResetHandlers(resetHandlerOptions);
    }

    if (installSyncHandlers) {
      controller.installSyncHandlers(syncHandlerOptions);
    }

    const restorer = autoscroll.createRestorer({
      ...restorerConfig,
      controller,
      findItemBySavedId: resolvedFindItemBySavedId,
      storage: progressStorage,
      sync(context) {
        if (typeof restorerSync === "function") {
          return restorerSync({
            ...context,
            controller,
            progressStorage,
            restorer,
          });
        }

        controller.queueSync();
      },
    });

    function syncScope({ shouldRestore = false, force = false } = {}) {
      const previousScope = progressStorage.getScope();
      const nextScope = getScope();
      const scopeChanged =
        force ||
        progressStorage.getScopeToken(previousScope) !==
          progressStorage.getScopeToken(nextScope);

      if (scopeChanged) {
        restorer.cancel();
        controller.clearSelection();
      }

      progressStorage.setScope(nextScope);
      controller.queueSync();

      if (!shouldRestore || !scopeChanged || !shouldRestoreScope(nextScope)) {
        return;
      }

      const runRestore = () => {
        const activeScope = progressStorage.getScope();
        if (
          progressStorage.getScopeToken(activeScope) !==
          progressStorage.getScopeToken(nextScope)
        ) {
          return;
        }

        controller.queueSync();
        restorer.restore({ scope: nextScope });
      };

      if (restoreDelayMs > 0) {
        setTimeout(runRestore, restoreDelayMs);
        return;
      }

      runRestore();
    }

    const queueScopeSync = createQueuedSync(syncScope);
    const removeResyncEvents = installWindowResyncEvents(queueScopeSync, events);

    const apiContext = {
      controller,
      progressStorage,
      queueScopeSync,
      removeResyncEvents,
      restorer,
    };

    const api =
      typeof exportApi === "function"
        ? exportApi(apiContext)
        : {
            progress: createProgressApi({
              controller,
              storage: progressStorage,
            }),
            reset: controller.clearSelection,
            resync: (options = {}) => {
              queueScopeSync({
                force: !!options.force,
                shouldRestore: options.shouldRestore !== false,
              });
            },
          };

    if (exportName) {
      window[exportName] = api;
    }

    queueScopeSync(initialSync);

    return {
      ...apiContext,
      api,
    };
  }

  function createSingleScopeSiteRuntime({
    autoscroll,
    controller: controllerOptions,
    exportApi = null,
    exportName = null,
    findItemBySavedId = null,
    getItemId,
    getItems,
    initialRestore = true,
    jkl,
    onResync = null,
    restorer: restorerOptions,
    storage,
  }) {
    const {
      installKeyHandler = true,
      keyHandlerOptions = {},
      installResetHandlers = true,
      resetHandlerOptions = {},
      installSyncHandlers = false,
      syncHandlerOptions = {},
      ...controllerConfig
    } = controllerOptions;

    const { sync: restorerSync, ...restorerConfig } = restorerOptions;

    const resolvedFindItemBySavedId =
      findItemBySavedId ||
      createFindItemBySavedId({
        getItemId,
        getItems,
        getScope: () => storage.getScope(),
      });

    const controller = jkl.createController({
      ...controllerConfig,
      getItemId,
      getItems,
      storage,
    });

    if (installKeyHandler) {
      controller.installKeyHandler(keyHandlerOptions);
    }

    if (installResetHandlers) {
      controller.installResetHandlers(resetHandlerOptions);
    }

    if (installSyncHandlers) {
      controller.installSyncHandlers(syncHandlerOptions);
    }

    const restorer = autoscroll.createRestorer({
      ...restorerConfig,
      controller,
      findItemBySavedId: resolvedFindItemBySavedId,
      storage,
      sync(context) {
        if (typeof restorerSync === "function") {
          return restorerSync({
            ...context,
            controller,
            progressStorage: storage,
            restorer,
          });
        }

        controller.queueSync();
      },
    });

    function resync({ shouldRestore = false } = {}) {
      storage.refreshScope?.();
      onResync?.({ controller, progressStorage: storage, restorer });
      controller.queueSync();

      if (shouldRestore) {
        restorer.restore({ scope: storage.getScope() });
      } else {
        restorer.cancel();
      }
    }

    const apiContext = {
      controller,
      progressStorage: storage,
      restorer,
      resync,
    };

    const api =
      typeof exportApi === "function"
        ? exportApi(apiContext)
        : {
            progress: createProgressApi({
              controller,
              storage,
            }),
            resync,
          };

    if (exportName) {
      window[exportName] = api;
    }

    resync({ shouldRestore: initialRestore });

    return {
      ...apiContext,
      api,
    };
  }

  window.__feedScrollerShared__.runtime = {
    createFindItemBySavedId,
    createProgressApi,
    createQueuedSync,
    createScopedSiteRuntime,
    createSingleScopeSiteRuntime,
    installWindowResyncEvents,
  };
})();
