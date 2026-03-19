(() => {
  window.__feedScrollerShared__ = window.__feedScrollerShared__ || {};

  if (window.__feedScrollerShared__.autoscroll) return;

  function createRestorer({
    controller,
    findItemBySavedId,
    isEnabled = () => true,
    storage,
    strategy,
    sync = null,
  }) {
    let activeRestoreRun = 0;

    function cancel() {
      activeRestoreRun += 1;
      controller.setRestoring(false);
    }

    function shouldStop(restoreRun, scopeToken) {
      if (restoreRun !== activeRestoreRun) return true;
      if (!isEnabled(storage.getScope())) return true;
      return storage.getScopeToken(storage.getScope()) !== scopeToken;
    }

    function restore({ scope = storage.getScope() } = {}) {
      const savedId = storage.load(scope);
      if (!savedId || !scope || !isEnabled(scope)) return false;

      const restoreRun = ++activeRestoreRun;
      const scopeToken = storage.getScopeToken(scope);
      controller.setRestoring(true);

      const context = {
        controller,
        savedId,
        scope,
        sync() {
          sync?.({ savedId, scope });
        },
      };

      if (strategy?.type === "scroll-step") {
        runScrollStepRestore({
          context,
          findItemBySavedId,
          restoreRun,
          scopeToken,
          shouldStop,
          strategy,
        });
        return true;
      }

      if (strategy?.type === "load-more") {
        runLoadMoreRestore({
          context,
          findItemBySavedId,
          restoreRun,
          scopeToken,
          shouldStop,
          strategy,
        });
        return true;
      }

      controller.setRestoring(false);
      return false;
    }

    return {
      cancel,
      restore,
    };
  }

  function getDocumentScrollHeight() {
    return document.documentElement.scrollHeight || document.body.scrollHeight || 0;
  }

  function getDocumentScrollEl() {
    return document.scrollingElement || document.documentElement || document.body;
  }

  function nudgeWindowScroll() {
    window.scrollBy(0, -1);
    window.scrollBy(0, +1);
  }

  function createBottomScrollStrategy({
    delayAfterProgressMs = 0,
    getScrollEl = () => getDocumentScrollEl(),
    getSnapshot = null,
    isProgressing = defaultIsScrollProgressing,
    isReady = () => true,
    maxMs = null,
    maxSteps = 200,
    onMissingItem = null,
    shouldPauseAfterProgress = null,
    startDelayMs = 50,
    stopWhenStuckAtOrAbove = false,
    stuckLimit = 10,
    tickMs = 80,
  } = {}) {
    return {
      delayAfterProgressMs,
      getSnapshot(context) {
        if (typeof getSnapshot === "function") {
          return getSnapshot(context);
        }

        const scrollEl = getScrollEl(context);
        return {
          scrollHeight: scrollEl?.scrollHeight || 0,
          scrollTop: scrollEl?.scrollTop || 0,
        };
      },
      isProgressing,
      isReady,
      maxMs,
      maxSteps,
      onMissingItem,
      shouldPauseAfterProgress,
      scroll(context, snapshot) {
        const scrollEl = getScrollEl(context);
        if (!scrollEl) return;

        const scrollHeight = snapshot?.scrollHeight || scrollEl.scrollHeight || 0;
        scrollEl.scrollTo({ top: scrollHeight, left: 0, behavior: "auto" });
        nudgeWindowScroll();
      },
      startDelayMs,
      stopWhenStuckAtOrAbove,
      stuckLimit,
      tickMs,
      type: "scroll-step",
    };
  }

  function createDocumentBottomScrollStrategy({
    isReady = () => true,
    maxMs = null,
    maxSteps = 200,
    onMissingItem = null,
    startDelayMs = 50,
    stopWhenStuckAtOrAbove = false,
    stuckLimit = 10,
    tickMs = 80,
  } = {}) {
    return createBottomScrollStrategy({
      isReady,
      maxMs,
      maxSteps,
      onMissingItem,
      getSnapshot() {
        return {
          scrollHeight: getDocumentScrollHeight(),
        };
      },
      startDelayMs,
      stopWhenStuckAtOrAbove,
      stuckLimit,
      tickMs,
    });
  }

  function createLoadMoreStrategy({
    getSignature = () => "",
    isReady = () => true,
    maxSteps = 200,
    onMissingItem = null,
    startDelayMs = 50,
    stuckLimit = 10,
    tickMs = 120,
    tryAdvance,
  } = {}) {
    return {
      getSignature,
      isReady,
      maxSteps,
      onMissingItem,
      startDelayMs,
      stuckLimit,
      tickMs,
      tryAdvance,
      type: "load-more",
    };
  }

  function runScrollStepRestore({
    context,
    findItemBySavedId,
    restoreRun,
    scopeToken,
    shouldStop,
    strategy,
  }) {
    const {
      delayAfterProgressMs = 0,
      isReady = () => true,
      getSnapshot = () => null,
      isProgressing = defaultIsScrollProgressing,
      maxMs = null,
      maxSteps = null,
      onMissingItem = null,
      shouldPauseAfterProgress = null,
      startDelayMs = 50,
      stopWhenStuckAtOrAbove = false,
      stuckLimit = 10,
      tickMs = 120,
    } = strategy;

    const startedAt = Date.now();
    let lastSnapshot = null;
    let steps = 0;
    let stuckTicks = 0;

    const stop = () => {
      context.controller.setRestoring(false);
    };

    const tick = () => {
      if (shouldStop(restoreRun, scopeToken)) {
        context.controller.setRestoring(false);
        return;
      }

      context.sync();

      if (!isReady(context)) {
        setTimeout(tick, tickMs);
        return;
      }

      const found = findItemBySavedId(context.savedId, context.scope);
      if (found) {
        context.controller.setCurrent(found);
        context.controller.setRestoring(false);
        return;
      }

      if (typeof onMissingItem === "function") {
        const handled = !!onMissingItem({
          ...context,
          steps,
        });
        if (handled) {
          stop();
          return;
        }
      }

      steps += 1;
      if (maxSteps != null && steps > maxSteps) {
        stop();
        return;
      }

      if (maxMs != null && Date.now() - startedAt > maxMs) {
        stop();
        return;
      }

      const snapshot = getSnapshot(context);
      const progressed =
        lastSnapshot &&
        isProgressing({
          current: snapshot,
          previous: lastSnapshot,
          steps,
        });

      if (lastSnapshot && !progressed) {
        stuckTicks += 1;
      } else {
        stuckTicks = 0;
      }

      const shouldPause =
        !!lastSnapshot &&
        !!progressed &&
        delayAfterProgressMs > 0 &&
        (typeof shouldPauseAfterProgress === "function"
          ? shouldPauseAfterProgress({
              current: snapshot,
              previous: lastSnapshot,
              steps,
            })
          : true);

      lastSnapshot = snapshot;

      const isStuck = stopWhenStuckAtOrAbove
        ? stuckTicks >= stuckLimit
        : stuckTicks > stuckLimit;

      if (isStuck) {
        stop();
        return;
      }

      if (shouldPause) {
        setTimeout(tick, delayAfterProgressMs);
        return;
      }

      context.controller.markNavScrolling();
      strategy.scroll(context, snapshot);
      setTimeout(tick, tickMs);
    };

    setTimeout(tick, startDelayMs);
  }

  function runLoadMoreRestore({
    context,
    findItemBySavedId,
    restoreRun,
    scopeToken,
    shouldStop,
    strategy,
  }) {
    const {
      isReady = () => true,
      getSignature = () => "",
      maxSteps = 200,
      onMissingItem = null,
      startDelayMs = 50,
      stuckLimit = 10,
      tickMs = 120,
      tryAdvance,
    } = strategy;

    let lastSignature = "";
    let steps = 0;
    let stuckCount = 0;

    const stop = () => {
      context.controller.setRestoring(false);
    };

    const tick = () => {
      if (shouldStop(restoreRun, scopeToken)) {
        context.controller.setRestoring(false);
        return;
      }

      context.sync();

      if (!isReady(context)) {
        setTimeout(tick, tickMs);
        return;
      }

      const found = findItemBySavedId(context.savedId, context.scope);
      if (found) {
        context.controller.setCurrent(found);
        context.controller.setRestoring(false);
        return;
      }

      if (typeof onMissingItem === "function") {
        const handled = !!onMissingItem({
          ...context,
          steps,
        });
        if (handled) {
          stop();
          return;
        }
      }

      steps += 1;
      if (steps > maxSteps) {
        stop();
        return;
      }

      const signature = getSignature(context);
      if (signature && signature === lastSignature) stuckCount += 1;
      else stuckCount = 0;
      lastSignature = signature;

      const advanced = !!tryAdvance(context);
      if (!advanced && stuckCount >= stuckLimit) {
        stop();
        return;
      }

      setTimeout(tick, tickMs);
    };

    setTimeout(tick, startDelayMs);
  }

  function defaultIsScrollProgressing({ current, previous }) {
    if (!current || !previous) return true;

    if (
      typeof current.scrollTop === "number" &&
      typeof previous.scrollTop === "number" &&
      Math.abs(current.scrollTop - previous.scrollTop) > 2
    ) {
      return true;
    }

    if (
      typeof current.scrollHeight === "number" &&
      typeof previous.scrollHeight === "number" &&
      current.scrollHeight > previous.scrollHeight + 2
    ) {
      return true;
    }

    if (
      typeof current.itemCount === "number" &&
      typeof previous.itemCount === "number" &&
      current.itemCount > previous.itemCount
    ) {
      return true;
    }

    return false;
  }

  window.__feedScrollerShared__.autoscroll = {
    createBottomScrollStrategy,
    createDocumentBottomScrollStrategy,
    createLoadMoreStrategy,
    createRestorer,
    defaultIsScrollProgressing,
  };
})();
