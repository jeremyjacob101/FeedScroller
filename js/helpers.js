(() => {
  window.__feedScrollerShared__ = window.__feedScrollerShared__ || {};

  if (window.__feedScrollerShared__.helpers) return;

  function applyCssVars(cssVars = {}) {
    const root = document.documentElement;

    for (const [propertyName, propertyValue] of Object.entries(cssVars)) {
      if (propertyValue == null || propertyValue === "") {
        root.style.removeProperty(propertyName);
      } else {
        root.style.setProperty(propertyName, propertyValue);
      }
    }
  }

  function normalizeHostname(hostname, { stripWww = false } = {}) {
    let next = String(hostname || "").trim().toLowerCase();
    if (stripWww) next = next.replace(/^www\./i, "");
    return next;
  }

  function matchesLocation(match) {
    if (typeof match === "function") return !!match(location);

    const normalizedHost = normalizeHostname(location.hostname, match);
    const domains = Array.isArray(match?.domains) ? match.domains : [];
    const allowSubdomains = match?.allowSubdomains !== false;

    for (const domain of domains) {
      const normalizedDomain = normalizeHostname(domain, match);
      if (!normalizedDomain) continue;
      if (normalizedHost === normalizedDomain) return true;
      if (allowSubdomains && normalizedHost.endsWith(`.${normalizedDomain}`)) {
        return true;
      }
    }

    return false;
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

  function snapshotToArray(snapshot) {
    if (!snapshot) return [];

    const items = [];
    for (let index = 0; index < snapshot.snapshotLength; index += 1) {
      const node = snapshot.snapshotItem(index);
      if (node && node.nodeType === 1) items.push(node);
    }
    return items;
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

  function parseRgb(color) {
    const match = String(color || "").match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;

    const channels = match[1]
      .split(",")
      .slice(0, 3)
      .map((value) => Number.parseFloat(value.trim()));

    return channels.some((value) => Number.isNaN(value)) ? null : channels;
  }

  function colorChannelsMeetMinimum(color, minChannel = 235) {
    const rgb = parseRgb(color);
    if (!rgb) return false;
    return rgb.every((channel) => channel >= minChannel);
  }

  function indicatorLooksActive(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rgb = parseRgb(style.backgroundColor);
    const opacity = Number.parseFloat(style.opacity || "1");
    return !!rgb && opacity > 0.05 && rgb.some((channel) => channel > 0);
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

  function trimmedText(value) {
    return String(value || "").trim();
  }

  function firstNonEmpty(values = []) {
    for (const value of values) {
      if (trimmedText(value)) return trimmedText(value);
    }
    return "";
  }

  function getLastElementChild(el) {
    if (!el) return null;
    const children = Array.from(el.children || []);
    return children.length ? children[children.length - 1] : null;
  }

  window.__feedScrollerShared__.helpers = {
    applyCssVars,
    colorChannelsMeetMinimum,
    evalXPathFirst,
    evalXPathSnapshot,
    firstNonEmpty,
    getLastElementChild,
    indicatorLooksActive,
    isClickable,
    matchesLocation,
    normalizeHostname,
    normalizeHref,
    parseRgb,
    snapshotToArray,
    trimmedText,
  };
})();
