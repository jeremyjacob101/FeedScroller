(() => {
  if (window.__feedScrollerRouterInstalled__) return;
  window.__feedScrollerRouterInstalled__ = true;

  const ROUTER_DEBUG = false;

  const rlog = (...args) => {
    if (ROUTER_DEBUG) console.log("[feedscroller-router]", ...args);
  };

  const getModules = () =>
    Object.values(window.__feedScrollerSiteModules__ || {}).filter(
      (module) => module && typeof module.install === "function",
    );

  function dispatchByRoute() {
    const modules = getModules();
    rlog("dispatch", {
      href: location.href,
      moduleNames: modules.map((module) => module.name || "unknown"),
    });

    for (const module of modules) {
      let matches = false;

      try {
        matches =
          typeof module.matches === "function" ? !!module.matches() : true;
      } catch (error) {
        console.error(
          "[feedscroller-router] failed to evaluate module match",
          module?.name || "unknown",
          error,
        );
        continue;
      }

      if (!matches) continue;

      try {
        module.install();
      } catch (error) {
        console.error(
          "[feedscroller-router] failed to install module",
          module?.name || "unknown",
          error,
        );
      }
    }
  }

  let lastHref = location.href;

  function onUrlMaybeChanged() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    rlog("url changed", location.href);
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
