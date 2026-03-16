(() => {
  window.__feedScrollerShared__ = window.__feedScrollerShared__ || {};

  if (window.__feedScrollerShared__.storage) return;

  function withLocalStorage(action, fallback = null) {
    try {
      return action(window.localStorage);
    } catch {
      return fallback;
    }
  }

  function normalizeKeyPart(value) {
    return (
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "unknown"
    );
  }

  function buildScopedStorageKey(baseKey, kind, key) {
    if (!baseKey) return null;
    if (!kind || !key) return baseKey;
    return `${baseKey}::${kind}::${key}`;
  }

  function createScope({
    kind = "global",
    key = "global",
    label = "global",
    allowsPersistence = true,
    allowsRestore = true,
    storageKey = null,
  } = {}) {
    return {
      allowsPersistence: !!allowsPersistence,
      allowsRestore: !!allowsRestore,
      key: String(key || "global"),
      kind: String(kind || "global"),
      label: String(label || key || kind || "global"),
      storageKey: storageKey || null,
    };
  }

  function createStorage({ getScope } = {}) {
    let currentScope = null;

    function readScope() {
      if (typeof getScope !== "function") return null;
      return getScope() || null;
    }

    function getActiveScope() {
      if (!currentScope) currentScope = readScope();
      return currentScope;
    }

    return {
      buildScopedStorageKey,
      createScope,
      normalizeKeyPart,
      clear(scope = getActiveScope()) {
        if (!scope?.storageKey) return false;
        withLocalStorage((storage) => storage.removeItem(scope.storageKey));
        return true;
      },
      getScope() {
        return getActiveScope();
      },
      getScopeToken(scope = getActiveScope()) {
        if (!scope) return "none";
        return [
          scope.kind || "global",
          scope.key || "global",
          scope.allowsPersistence ? "1" : "0",
          scope.allowsRestore ? "1" : "0",
        ].join(":");
      },
      load(scope = getActiveScope()) {
        if (!scope?.storageKey) return null;
        return withLocalStorage((storage) => {
          const raw = storage.getItem(scope.storageKey);
          return raw && typeof raw === "string" ? raw : null;
        });
      },
      refreshScope() {
        currentScope = readScope();
        return currentScope;
      },
      save(id, scope = getActiveScope()) {
        if (!id || !scope?.allowsPersistence || !scope.storageKey) return false;
        withLocalStorage((storage) =>
          storage.setItem(scope.storageKey, String(id)),
        );
        return true;
      },
      setScope(scope) {
        currentScope = scope || null;
        return currentScope;
      },
    };
  }

  function createSingleScopeStorage(options = {}) {
    return createStorage({
      getScope: () => createScope(options),
    });
  }

  window.__feedScrollerShared__.storage = {
    buildScopedStorageKey,
    createScope,
    createSingleScopeStorage,
    createStorage,
    normalizeKeyPart,
  };
})();
