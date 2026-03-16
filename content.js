(() => {
  if (window.__feedScrollerRouterInstalled__) return;
  window.__feedScrollerRouterInstalled__ = true;

  const getModules = () =>
    Object.values(window.__feedScrollerSiteModules__ || {}).filter(
      (module) => module && typeof module.install === "function",
    );

  function dispatchByRoute() {
    for (const module of getModules()) {
      let matches = false;

      try {
        matches =
          typeof module.matches === "function" ? !!module.matches() : true;
      } catch {
        continue;
      }

      if (!matches) continue;

      try {
        module.install();
      } catch {}
    }
  }

  let lastHref = location.href;

  function onUrlMaybeChanged() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    setTimeout(dispatchByRoute, 50);
  }

  try {
    const pushState = history.pushState;
    const replaceState = history.replaceState;

    history.pushState = function (...args) {
      const ret = pushState.apply(this, args);
      onUrlMaybeChanged();
      return ret;
    };

    history.replaceState = function (...args) {
      const ret = replaceState.apply(this, args);
      onUrlMaybeChanged();
      return ret;
    };
  } catch {}

  window.addEventListener("popstate", onUrlMaybeChanged, true);
  window.addEventListener("hashchange", onUrlMaybeChanged, true);

  const routerObserver = new MutationObserver(() => {
    onUrlMaybeChanged();
    dispatchByRoute();
  });

  routerObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  dispatchByRoute();
})();
