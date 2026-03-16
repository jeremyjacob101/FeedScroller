(() => {
  window.__feedScrollerShared__ = window.__feedScrollerShared__ || {};
  window.__feedScrollerSiteModules__ = window.__feedScrollerSiteModules__ || {};

  if (window.__feedScrollerShared__.shell) return;

  const shared = window.__feedScrollerShared__;
  const helpers = shared.helpers || {};

  if (
    !helpers.applyCssVars ||
    !helpers.matchesLocation ||
    !helpers.normalizeHref
  ) {
    return;
  }

  const {
    applyCssVars,
    colorChannelsMeetMinimum,
    evalXPathFirst,
    evalXPathSnapshot,
    firstNonEmpty,
    getLastElementChild,
    indicatorLooksActive,
    isClickable,
    matchesLocation,
    normalizeHref,
    snapshotToArray,
    trimmedText,
  } = helpers;

  const DEFAULT_CLASSES = {
    highlightClass: "__arc_jk_selected__",
    itemClass: "__arc_jk_item__",
    progressBoxClass: "__arc_jk_progress_box__",
  };

  const DEFAULT_IDS = {
    highlightBoxId: "__arc_jk_highlight_box__",
    keySinkId: "__arc_jk_key_sink__",
  };

  const DEFAULT_FLAGS = {
    enableArticleAncestorItems: false,
    enableAttributeItemId: false,
    enableBoundaryIdProgressTracking: false,
    enableBottomJumpRestore: false,
    enableContainerCandidateSearch: false,
    enableContainerXPathLookup: false,
    enableDirectChildItems: false,
    enableDocumentBottomRestore: false,
    enableFallbackTabSelector: false,
    enableFeedMutationObserver: false,
    enableGlobalScopeFallback: false,
    enableHistoryResync: false,
    enableInlineItemLayoutFixes: false,
    enableInlineRenderer: false,
    enableInteractionOnlyWhenRestoreAllowed: false,
    enableItemMarkerValidation: false,
    enableLoadMoreRestore: false,
    enableMutationResync: false,
    enableNormalizedHrefItemId: false,
    enableOverlayRenderer: false,
    enablePathRouteGate: false,
    enablePendingScopeWhenTabsUnavailable: false,
    enablePermalinkProximityBonus: false,
    enablePermalinkSelection: false,
    enablePermalinkValidation: false,
    enablePrimaryTabProgressBlock: false,
    enableProfileByScopeKey: false,
    enableRegexItemId: false,
    enableRestoreDelay: false,
    enableRestorePauseAfterGrowth: false,
    enableSingleFixedScope: false,
    enableTabAriaActiveState: false,
    enableTabClickResync: false,
    enableTabContainerAncestorLookup: false,
    enableTabContainerTextMatchLookup: false,
    enableTabContainerXPathLookup: false,
    enableTabbedScope: false,
    enableTabIndicatorActiveState: false,
    enableTabTextColorActiveState: false,
    enableUnknownScopeWhenActiveTabMissing: false,
    enableXPathSnapshotItems: false,
  };

  const DEFAULT_SCOPE = {
    fixed: {
      allowsPersistence: true,
      allowsRestore: true,
      key: "global",
      kind: "global",
      label: "global",
    },
    globalFallback: {
      allowsPersistence: true,
      allowsRestore: true,
      key: "global",
      label: "global",
    },
    kind: "global",
    pendingFallback: {
      allowsPersistence: false,
      allowsRestore: false,
      key: "pending",
      label: "pending",
    },
    pendingPath: null,
    unknownFallback: {
      allowsPersistence: false,
      allowsRestore: false,
      key: "unknown",
      label: "unknown",
    },
  };

  const DEFAULT_TABS = {
    activeSources: [],
    container: {
      ancestorStopSelector: "body",
      candidateSelector: null,
      labelMatchMode: "all",
      labelMatchTexts: [],
      minimumCount: 2,
      primaryTabSelector: null,
      searchRootSelector: "main",
      xpaths: [],
    },
    fallbackTabSelector: null,
    labelSources: [],
    minimumCount: 2,
    primaryTabIndex: 0,
    tabSelector: '[role="tab"]',
  };

  const DEFAULT_RENDER = {
    inlineFixes: {
      checkboxLeft: "var(--arc-jk-progress-offset)",
      checkboxPosition: "absolute",
      checkboxTop: "50%",
      checkboxTransform: "translateY(-50%)",
      itemOverflowImportant: false,
      itemOverflowValue: "visible",
      itemPosition: "relative",
    },
    mode: "inline",
    overlay: {
      viewportBottomScreens: 2,
      viewportTopScreens: 1,
    },
  };

  const DEFAULT_RESTORE = {
    buttonXPath: null,
    clickThrottleMs: 900,
    maxMs: null,
    maxSteps: 200,
    mode: null,
    postLoadDelayMs: 0,
    readinessRequiresContainer: false,
    restoreDelayMs: 0,
    scrollToBottomFirst: false,
    startDelayMs: 50,
    stopWhenStuckAtOrAbove: false,
    stuckLimit: 10,
    tickMs: 80,
  };

  const DEFAULT_OBSERVER = {
    childList: true,
    containerXPath: null,
    subtree: false,
  };

  const DEFAULT_API = {
    aliases: {},
  };

  function cleanStringArray(values = []) {
    return Array.isArray(values)
      ? values.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
  }

  function normalizePath(pathname = location.pathname) {
    return String(pathname || "/").replace(/\/+$/, "") || "/";
  }

  function matchesExactPath(pathname) {
    return !!pathname && normalizePath() === normalizePath(pathname);
  }

  function matchesPattern(value, pattern) {
    if (!pattern) return true;
    if (!value) return false;

    try {
      return new RegExp(pattern, "i").test(String(value));
    } catch {
      return false;
    }
  }

  function attributeToDatasetKey(attributeName) {
    return String(attributeName || "")
      .replace(/^data-/, "")
      .split("-")
      .filter(Boolean)
      .map((part, index) =>
        index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
      )
      .join("");
  }

  function readAttributeOrDataset(el, attributeName) {
    if (!el || !attributeName) return "";

    const attributeValue = trimmedText(el.getAttribute(attributeName));
    if (attributeValue) return attributeValue;

    if (!attributeName.startsWith("data-")) return "";

    const datasetKey = attributeToDatasetKey(attributeName);
    return trimmedText(el.dataset?.[datasetKey]);
  }

  function querySearchRoot(selector) {
    if (!selector) return document;
    try {
      return document.querySelector(selector) || document;
    } catch {
      return document;
    }
  }

  function safeQuery(root, selector) {
    if (!root || !selector) return null;

    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function safeQueryAll(root, selector) {
    if (!root || !selector) return [];

    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function hasAnyMatchingSelector(root, selectors = []) {
    if (!root) return false;

    for (const selector of cleanStringArray(selectors)) {
      try {
        if (root.querySelector(selector)) return true;
      } catch {}
    }

    return false;
  }

  function depthFromAncestor(node, ancestor) {
    let depth = 0;
    let current = node;

    while (current && current !== ancestor) {
      current = current.parentElement;
      depth += 1;
    }

    return current === ancestor ? depth : Infinity;
  }

  function mergeProfileSpec(rawProfile = {}) {
    return {
      container: {
        candidateSelector: null,
        dominantTagName: null,
        dominantTagRatio: 0.6,
        minimumChildren: 2,
        minimumMatches: 2,
        searchRootSelector: "main",
        xpaths: [],
        ...(rawProfile.container || {}),
        xpaths: cleanStringArray(rawProfile.container?.xpaths),
      },
      itemId: {
        anchorSelector: null,
        attributeName: null,
        mode: null,
        regex: null,
        ...(rawProfile.itemId || {}),
      },
      items: {
        ancestorSelector: null,
        childTagName: null,
        mode: "direct-children",
        requiredDescendantSelector: null,
        searchRootSelector: "main",
        selector: null,
        sortByTop: false,
        xpath: null,
        ...(rawProfile.items || {}),
      },
      match: {
        anySelectors: cleanStringArray(rawProfile.match?.anySelectors),
        requirePermalink: !!rawProfile.match?.requirePermalink,
      },
      permalink: {
        allowTextLengthMax: 0,
        allowTextLengthMin: 0,
        attributeBonuses: {
          ...(rawProfile.permalink?.attributeBonuses || {}),
        },
        depthPenaltyMax: 0,
        depthPenaltyMultiplier: 0,
        hrefIncludes: null,
        hrefLengthPenaltyDivisor: 0,
        hrefLengthPenaltyMax: 0,
        normalizedHrefPattern: null,
        preferredDescendantBonus: 0,
        preferredDescendantSelector: null,
        requireAnyAttributeNames: cleanStringArray(
          rawProfile.permalink?.requireAnyAttributeNames,
        ),
        roleLinkBonus: 0,
        selector: null,
        shortTextBonus: 0,
        shortTextMaxLength: 0,
        topOffsetPenaltyMax: 0,
        topOffsetPenaltyMultiplier: 0,
        ...(rawProfile.permalink || {}),
      },
    };
  }

  function mergeSiteSpec(rawSpec = {}) {
    const rawFeed = rawSpec.feed || {};
    const profiles = {};

    for (const [profileName, rawProfile] of Object.entries(
      rawFeed.profiles || {},
    )) {
      profiles[profileName] = mergeProfileSpec(rawProfile);
    }

    return {
      ...rawSpec,
      api: {
        ...DEFAULT_API,
        ...(rawSpec.api || {}),
        aliases: {
          ...(DEFAULT_API.aliases || {}),
          ...(rawSpec.api?.aliases || {}),
        },
      },
      classes: {
        ...DEFAULT_CLASSES,
        ...(rawSpec.classes || {}),
      },
      controller: {
        ...(rawSpec.controller || {}),
      },
      cssVars: {
        ...(rawSpec.cssVars || {}),
      },
      feed: {
        defaultProfile: rawFeed.defaultProfile || "default",
        profileByScopeKey: {
          ...(rawFeed.profileByScopeKey || {}),
        },
        profiles,
      },
      flags: {
        ...DEFAULT_FLAGS,
        ...(rawSpec.flags || {}),
      },
      ids: {
        ...DEFAULT_IDS,
        ...(rawSpec.ids || {}),
      },
      match: {
        ...(rawSpec.match || {}),
      },
      observer: {
        ...DEFAULT_OBSERVER,
        ...(rawSpec.observer || {}),
      },
      render: {
        ...DEFAULT_RENDER,
        ...(rawSpec.render || {}),
        inlineFixes: {
          ...DEFAULT_RENDER.inlineFixes,
          ...(rawSpec.render?.inlineFixes || {}),
        },
        overlay: {
          ...DEFAULT_RENDER.overlay,
          ...(rawSpec.render?.overlay || {}),
        },
      },
      restore: {
        ...DEFAULT_RESTORE,
        ...(rawSpec.restore || {}),
      },
      route: {
        exactPath: null,
        ...(rawSpec.route || {}),
      },
      scope: {
        ...DEFAULT_SCOPE,
        ...(rawSpec.scope || {}),
        fixed: {
          ...DEFAULT_SCOPE.fixed,
          ...(rawSpec.scope?.fixed || {}),
        },
        globalFallback: {
          ...DEFAULT_SCOPE.globalFallback,
          ...(rawSpec.scope?.globalFallback || {}),
        },
        pendingFallback: {
          ...DEFAULT_SCOPE.pendingFallback,
          ...(rawSpec.scope?.pendingFallback || {}),
        },
        unknownFallback: {
          ...DEFAULT_SCOPE.unknownFallback,
          ...(rawSpec.scope?.unknownFallback || {}),
        },
      },
      tabs: {
        ...DEFAULT_TABS,
        ...(rawSpec.tabs || {}),
        activeSources: Array.isArray(rawSpec.tabs?.activeSources)
          ? rawSpec.tabs.activeSources.slice()
          : DEFAULT_TABS.activeSources.slice(),
        container: {
          ...DEFAULT_TABS.container,
          ...(rawSpec.tabs?.container || {}),
          labelMatchTexts: cleanStringArray(
            rawSpec.tabs?.container?.labelMatchTexts,
          ),
          xpaths: cleanStringArray(rawSpec.tabs?.container?.xpaths),
        },
        labelSources: Array.isArray(rawSpec.tabs?.labelSources)
          ? rawSpec.tabs.labelSources.slice()
          : DEFAULT_TABS.labelSources.slice(),
      },
    };
  }

  function buildScopeFromShape(storageLib, spec, shape, storageKey = null) {
    return storageLib.createScope({
      ...shape,
      kind: shape.kind || spec.scope.kind || "global",
      storageKey,
    });
  }

  function collectTabSource(tab, source) {
    const node = source.selector ? safeQuery(tab, source.selector) : tab;

    if (!node) return null;

    const attributeValue = source.attribute
      ? trimmedText(node.getAttribute(source.attribute))
      : "";
    const normalizedAttributeValue =
      source.testIdPrefix && attributeValue.startsWith(source.testIdPrefix)
        ? attributeValue.slice(source.testIdPrefix.length)
        : attributeValue;

    if (
      cleanStringArray(source.rejectIncludes).some(
        (part) =>
          attributeValue.toLowerCase().includes(part.toLowerCase()) ||
          normalizedAttributeValue.toLowerCase().includes(part.toLowerCase()),
      )
    ) {
      return null;
    }

    const textValue = source.selfText
      ? trimmedText(tab.textContent)
      : source.text
        ? trimmedText(node.textContent)
        : "";

    const labelValue = firstNonEmpty([
      source.preferTestIdSuffix ? normalizedAttributeValue : "",
      textValue,
      normalizedAttributeValue,
      attributeValue,
    ]);

    return {
      key: source.key || source.selector || source.attribute || "source",
      labelValue,
      node,
      normalizedAttributeValue,
      textValue,
    };
  }

  function resolveActiveSourceNode(tab, sourceMap, activeSource) {
    if (activeSource.target === "tab") return tab;
    if (activeSource.labelSource && sourceMap[activeSource.labelSource]?.node) {
      return sourceMap[activeSource.labelSource].node;
    }
    if (activeSource.selector) return safeQuery(tab, activeSource.selector);
    return tab;
  }

  function isTabActive(tab, sourceMap, spec) {
    for (const activeSource of spec.tabs.activeSources) {
      if (
        activeSource.type === "aria-selected" &&
        !spec.flags.enableTabAriaActiveState
      ) {
        continue;
      }

      if (
        activeSource.type === "indicator-active" &&
        !spec.flags.enableTabIndicatorActiveState
      ) {
        continue;
      }

      if (
        activeSource.type === "text-color-min" &&
        !spec.flags.enableTabTextColorActiveState
      ) {
        continue;
      }

      let node = resolveActiveSourceNode(tab, sourceMap, activeSource);
      if (!node) continue;

      if (activeSource.useLastElementChild) {
        node = getLastElementChild(node);
        if (!node) continue;
      }

      if (activeSource.type === "aria-selected") {
        if (node.getAttribute("aria-selected") === "true") return true;
        continue;
      }

      if (activeSource.type === "indicator-active") {
        if (indicatorLooksActive(node)) return true;
        continue;
      }

      if (activeSource.type === "text-color-min") {
        const minChannel = activeSource.minChannel ?? 235;
        if (
          colorChannelsMeetMinimum(getComputedStyle(node).color, minChannel)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function getTabsContainer(spec) {
    const minimumCount = spec.tabs.container.minimumCount || spec.tabs.minimumCount;

    if (spec.flags.enableTabContainerXPathLookup) {
      for (const path of spec.tabs.container.xpaths) {
        const node = evalXPathFirst(path);
        if (!node) continue;

        const tabCount = safeQueryAll(node, spec.tabs.tabSelector).length;
        if (tabCount >= minimumCount) return node;
      }
    }

    if (
      spec.flags.enableTabContainerAncestorLookup &&
      spec.tabs.container.primaryTabSelector
    ) {
      const firstTab = safeQuery(document, spec.tabs.container.primaryTabSelector);

      let node = firstTab?.parentElement || null;
      while (node && node !== document.body) {
        if (safeQueryAll(node, spec.tabs.tabSelector).length >= minimumCount) {
          return node;
        }

        if (
          spec.tabs.container.ancestorStopSelector &&
          node.matches?.(spec.tabs.container.ancestorStopSelector)
        ) {
          break;
        }

        node = node.parentElement;
      }
    }

    if (spec.flags.enableTabContainerTextMatchLookup) {
      if (!spec.tabs.container.candidateSelector) return null;

      const root = querySearchRoot(spec.tabs.container.searchRootSelector);

      for (const candidate of safeQueryAll(
        root,
        spec.tabs.container.candidateSelector,
      )) {
        const tabs = safeQueryAll(candidate, spec.tabs.tabSelector);
        if (tabs.length < minimumCount) continue;

        const labels = tabs
          .map((tab) => trimmedText(tab.textContent).toLowerCase())
          .filter(Boolean);
        const targets = spec.tabs.container.labelMatchTexts.map((label) =>
          label.toLowerCase(),
        );

        const matches =
          spec.tabs.container.labelMatchMode === "any"
            ? targets.some((label) => labels.includes(label))
            : targets.every((label) => labels.includes(label));

        if (matches) return candidate;
      }
    }

    return null;
  }

  function getTabs(spec, storageLib) {
    if (!spec.flags.enableTabbedScope) return [];

    const container = getTabsContainer(spec);
    const containerTabs = container ? safeQueryAll(container, spec.tabs.tabSelector) : [];

    const primaryTabs =
      spec.flags.enableTabContainerAncestorLookup &&
      spec.tabs.container.primaryTabSelector
        ? safeQueryAll(document, spec.tabs.container.primaryTabSelector)
        : [];

    let tabNodes =
      primaryTabs.length > containerTabs.length ? primaryTabs : containerTabs;

    if (
      !tabNodes.length &&
      spec.flags.enableFallbackTabSelector &&
      container &&
      spec.tabs.fallbackTabSelector
    ) {
      tabNodes = Array.from(
        safeQueryAll(container, spec.tabs.fallbackTabSelector),
      ).filter((node) => !!trimmedText(node.textContent));
    }

    return tabNodes.map((tab, index) => {
      const sources = spec.tabs.labelSources
        .map((source) => collectTabSource(tab, source))
        .filter(Boolean);

      const sourceMap = Object.fromEntries(
        sources.map((source) => [source.key, source]),
      );

      const label = firstNonEmpty([
        ...sources.map((source) => source.labelValue),
        trimmedText(tab.textContent),
      ]);

      const keySeed = firstNonEmpty([
        ...sources.map((source) => source.normalizedAttributeValue),
        label,
        `tab-${index}`,
      ]);

      return {
        active: isTabActive(tab, sourceMap, spec),
        index,
        key: storageLib.normalizeKeyPart(keySeed),
        label: label || `Tab ${index + 1}`,
        tab,
      };
    });
  }

  function getScope(spec, storageLib) {
    if (spec.flags.enableSingleFixedScope) {
      return buildScopeFromShape(storageLib, spec, spec.scope.fixed, spec.storageKey);
    }

    if (!spec.flags.enableTabbedScope) {
      return buildScopeFromShape(
        storageLib,
        spec,
        spec.scope.globalFallback,
        spec.storageKey,
      );
    }

    const tabs = getTabs(spec, storageLib);
    if (tabs.length) {
      const activeTab = tabs.find((tab) => tab.active);

      if (!activeTab) {
        return spec.flags.enableUnknownScopeWhenActiveTabMissing
          ? buildScopeFromShape(storageLib, spec, spec.scope.unknownFallback)
          : null;
      }

      const isPrimary =
        spec.flags.enablePrimaryTabProgressBlock &&
        activeTab.index === spec.tabs.primaryTabIndex;

      return buildScopeFromShape(
        storageLib,
        spec,
        {
          allowsPersistence: !isPrimary,
          allowsRestore: !isPrimary,
          key: activeTab.key,
          label: activeTab.label,
        },
        isPrimary
          ? null
          : storageLib.buildScopedStorageKey(
              spec.storageKey,
              spec.scope.kind || "tab",
              activeTab.key,
            ),
      );
    }

    if (
      spec.flags.enablePendingScopeWhenTabsUnavailable &&
      matchesExactPath(spec.scope.pendingPath)
    ) {
      return buildScopeFromShape(storageLib, spec, spec.scope.pendingFallback);
    }

    if (spec.flags.enableGlobalScopeFallback) {
      return buildScopeFromShape(
        storageLib,
        spec,
        spec.scope.globalFallback,
        spec.storageKey,
      );
    }

    return null;
  }

  function routeAllows(spec) {
    return (
      !spec.flags.enablePathRouteGate || matchesExactPath(spec.route.exactPath)
    );
  }

  function getProfileName(spec, scope) {
    if (!spec.flags.enableProfileByScopeKey) {
      return spec.feed.defaultProfile;
    }

    return spec.feed.profileByScopeKey[scope?.key] || spec.feed.defaultProfile;
  }

  function getActiveProfile(spec, scope) {
    return spec.feed.profiles[getProfileName(spec, scope)] || null;
  }

  function isPermalinkCandidateValid(anchor, config, spec) {
    if (!anchor) return false;

    const href = anchor.getAttribute("href") || "";
    if (config.hrefIncludes && !href.includes(config.hrefIncludes)) return false;

    if (
      spec.flags.enablePermalinkValidation &&
      config.normalizedHrefPattern &&
      !matchesPattern(normalizeHref(href), config.normalizedHrefPattern)
    ) {
      return false;
    }

    if (
      spec.flags.enablePermalinkValidation &&
      (config.requireAnyAttributeNames.length ||
        (config.allowTextLengthMin > 0 && config.allowTextLengthMax > 0))
    ) {
      const hasAttribute = config.requireAnyAttributeNames.some((attributeName) =>
        anchor.hasAttribute(attributeName),
      );
      const text = trimmedText(anchor.textContent);
      const textWithinRange =
        text.length >= config.allowTextLengthMin &&
        text.length <= config.allowTextLengthMax;

      if (!hasAttribute && !textWithinRange) return false;
    }

    return true;
  }

  function scorePermalinkAnchor(anchor, itemEl, config, spec) {
    if (!anchor) return -Infinity;

    let score = 0;
    const href = anchor.getAttribute("href") || "";
    const text = trimmedText(anchor.textContent);

    for (const [attributeName, bonus] of Object.entries(
      config.attributeBonuses || {},
    )) {
      if (anchor.hasAttribute(attributeName)) score += Number(bonus) || 0;
    }

    if (
      config.preferredDescendantSelector &&
      safeQuery(anchor, config.preferredDescendantSelector)
    ) {
      score += config.preferredDescendantBonus || 1000;
    }

    if (
      config.roleLinkBonus &&
      (anchor.getAttribute("role") || "").toLowerCase() === "link"
    ) {
      score += config.roleLinkBonus;
    }

    if (
      config.shortTextMaxLength > 0 &&
      text.length > 0 &&
      text.length <= config.shortTextMaxLength
    ) {
      score += config.shortTextBonus || 0;
    }

    if (
      config.hrefLengthPenaltyDivisor > 0 &&
      config.hrefLengthPenaltyMax > 0
    ) {
      score -= Math.min(
        config.hrefLengthPenaltyMax,
        href.length / config.hrefLengthPenaltyDivisor,
      );
    }

    if (spec.flags.enablePermalinkProximityBonus && itemEl) {
      const itemRect = itemEl.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();

      if (config.topOffsetPenaltyMultiplier > 0 && config.topOffsetPenaltyMax > 0) {
        score -= Math.min(
          config.topOffsetPenaltyMax,
          Math.max(0, anchorRect.top - itemRect.top) *
            config.topOffsetPenaltyMultiplier,
        );
      }

      if (config.depthPenaltyMultiplier > 0 && config.depthPenaltyMax > 0) {
        score -= Math.min(
          config.depthPenaltyMax,
          depthFromAncestor(anchor, itemEl) * config.depthPenaltyMultiplier,
        );
      }
    }

    return score;
  }

  function getBestPermalinkAnchor(itemEl, profile, spec) {
    if (!itemEl || !profile || !spec.flags.enablePermalinkSelection) return null;

    const selector = profile.permalink.selector;
    if (!selector) return null;

    const anchors = safeQueryAll(itemEl, selector).filter((anchor) =>
      isPermalinkCandidateValid(anchor, profile.permalink, spec),
    );

    if (!anchors.length) return null;

    let bestAnchor = null;
    let bestScore = -Infinity;

    for (const anchor of anchors) {
      const score = scorePermalinkAnchor(anchor, itemEl, profile.permalink, spec);
      if (score > bestScore) {
        bestAnchor = anchor;
        bestScore = score;
      }
    }

    return bestAnchor || anchors[0];
  }

  function itemMatchesProfile(itemEl, profile, spec) {
    if (!itemEl || itemEl.nodeType !== 1) return false;

    const requiredTag = String(profile.items.childTagName || "").toUpperCase();
    if (requiredTag && itemEl.tagName !== requiredTag) return false;

    if (
      spec.flags.enableItemMarkerValidation &&
      profile.match.anySelectors.length &&
      !hasAnyMatchingSelector(itemEl, profile.match.anySelectors)
    ) {
      return false;
    }

    if (profile.match.requirePermalink) {
      return !!getBestPermalinkAnchor(itemEl, profile, spec);
    }

    return true;
  }

  function countMatchingChildren(container, profile, spec, jkl) {
    if (!container || profile.items.mode !== "direct-children") {
      return { total: 0, visible: 0 };
    }

    const children = Array.from(container.children || []).filter(
      (child) => child.nodeType === 1,
    );

    let total = 0;
    let visible = 0;

    for (const child of children) {
      if (!itemMatchesProfile(child, profile, spec)) continue;
      total += 1;
      if (jkl.visibleInViewport(child)) visible += 1;
    }

    return { total, visible };
  }

  function scoreContainerCandidate(container, profile, spec, jkl) {
    if (!container || profile.items.mode !== "direct-children") return -Infinity;

    const children = Array.from(container.children || []).filter(
      (child) => child.nodeType === 1,
    );
    if (children.length < profile.container.minimumChildren) return -Infinity;

    const dominantTagName = String(profile.container.dominantTagName || "").toUpperCase();
    const dominantChildren = dominantTagName
      ? children.filter((child) => child.tagName === dominantTagName)
      : children;

    if (
      dominantTagName &&
      dominantChildren.length / children.length < profile.container.dominantTagRatio
    ) {
      return -Infinity;
    }

    const counts = countMatchingChildren(container, profile, spec, jkl);
    if (counts.total < profile.container.minimumMatches) return -Infinity;

    return (
      counts.visible * 1000 +
      counts.total * 100 -
      Math.max(0, dominantChildren.length - counts.total)
    );
  }

  function findFeedContainer(profile, spec, jkl) {
    if (!profile) return null;

    if (spec.flags.enableContainerXPathLookup) {
      for (const path of profile.container.xpaths) {
        const node = evalXPathFirst(path);
        if (!node) continue;
        if (!spec.flags.enableContainerCandidateSearch) return node;
        if (scoreContainerCandidate(node, profile, spec, jkl) > -Infinity) {
          return node;
        }
      }
    }

    if (
      !spec.flags.enableContainerCandidateSearch ||
      !profile.container.candidateSelector
    ) {
      return null;
    }

    const root = querySearchRoot(profile.container.searchRootSelector);
    let bestNode = null;
    let bestScore = -Infinity;

    for (const candidate of safeQueryAll(root, profile.container.candidateSelector)) {
      const score = scoreContainerCandidate(candidate, profile, spec, jkl);
      if (score > bestScore) {
        bestNode = candidate;
        bestScore = score;
      }
    }

    return bestNode;
  }

  function getItemIdForProfile(itemEl, profile, spec) {
    if (!itemEl || !profile) return null;

    if (spec.flags.enableAttributeItemId && profile.itemId.mode === "attribute") {
      const value = readAttributeOrDataset(itemEl, profile.itemId.attributeName);
      return value || null;
    }

    let anchor = null;
    if (profile.itemId.anchorSelector) {
      try {
      anchor = safeQuery(itemEl, profile.itemId.anchorSelector);
      } catch {
        anchor = null;
      }
    }
    if (!anchor) {
      anchor = getBestPermalinkAnchor(itemEl, profile, spec);
    }

    if (!anchor) return null;

    if (
      spec.flags.enableNormalizedHrefItemId &&
      profile.itemId.mode === "normalized-anchor-href"
    ) {
      return normalizeHref(anchor.getAttribute("href"));
    }

    if (spec.flags.enableRegexItemId && profile.itemId.mode === "regex-from-anchor-href") {
      const href = anchor.getAttribute("href") || "";
      try {
        const match = String(href).match(
          new RegExp(profile.itemId.regex || "", "i"),
        );
        return match?.[1] || null;
      } catch {
        return null;
      }
    }

    return null;
  }

  function getItemsForProfile(profile, spec, jkl) {
    if (!profile) return [];

    if (spec.flags.enableXPathSnapshotItems && profile.items.mode === "xpath-snapshot") {
      return snapshotToArray(evalXPathSnapshot(profile.items.xpath));
    }

    if (spec.flags.enableArticleAncestorItems && profile.items.mode === "article-ancestor") {
      if (!profile.items.selector) return [];

      const root = querySearchRoot(profile.items.searchRootSelector);
      const items = [];
      const seen = new Set();

      for (const node of safeQueryAll(root, profile.items.selector)) {
      if (
        profile.items.requiredDescendantSelector &&
        !safeQuery(node, profile.items.requiredDescendantSelector)
      ) {
        continue;
      }

        const item = profile.items.ancestorSelector
          ? node.closest(profile.items.ancestorSelector) || node
          : node;

        if (!item || seen.has(item)) continue;
        seen.add(item);
        items.push(item);
      }

      if (profile.items.sortByTop) {
        items.sort(
          (left, right) =>
            left.getBoundingClientRect().top - right.getBoundingClientRect().top,
        );
      }

      return items;
    }

    if (spec.flags.enableDirectChildItems && profile.items.mode === "direct-children") {
      const root = findFeedContainer(profile, spec, jkl);
      if (!root) return [];

      return Array.from(root.children || []).filter((item) =>
        itemMatchesProfile(item, profile, spec),
      );
    }

    return [];
  }

  function getDocumentScrollEl() {
    return document.scrollingElement || document.documentElement || document.body;
  }

  function createSiteAdapter({ autoscroll, jkl, spec, storageLib }) {
    function getCurrentScope() {
      return getScope(spec, storageLib);
    }

    function getCurrentProfile(scope = getCurrentScope()) {
      return getActiveProfile(spec, scope);
    }

    function getItems(scope = getCurrentScope()) {
      return getItemsForProfile(getCurrentProfile(scope), spec, jkl);
    }

    function getItemId(itemEl, scope = getCurrentScope()) {
      return getItemIdForProfile(itemEl, getCurrentProfile(scope), spec);
    }

    function canToggleProgress(scope = getCurrentScope()) {
      return routeAllows(spec) && !!scope?.allowsPersistence;
    }

    function canRestoreScope(scope = getCurrentScope()) {
      return routeAllows(spec) && !!scope?.allowsRestore;
    }

    function isControllerEnabled(scope = getCurrentScope()) {
      if (!routeAllows(spec) || !scope) return false;
      if (spec.flags.enableInteractionOnlyWhenRestoreAllowed) {
        return !!scope.allowsRestore;
      }
      return true;
    }

    function findReadyContainer(scope = getCurrentScope()) {
      if (spec.observer.containerXPath) {
        return evalXPathFirst(spec.observer.containerXPath);
      }

      return findFeedContainer(getCurrentProfile(scope), spec, jkl);
    }

    function getCachedItemId(itemEl, scope = getCurrentScope()) {
      if (!itemEl) return "";

      const id = itemEl.dataset.arcJkId || getItemId(itemEl, scope) || "";
      if (id) itemEl.dataset.arcJkId = id;
      return id;
    }

    function getRestoreSnapshot(scope = getCurrentScope()) {
      const scrollEl = getDocumentScrollEl();
      const items = getItems(scope);
      const firstItem = items[0] || null;
      const lastItem = items[items.length - 1] || null;

      return {
        firstItemId: spec.flags.enableBoundaryIdProgressTracking
          ? getCachedItemId(firstItem, scope)
          : "",
        itemCount: items.length,
        lastItemId: spec.flags.enableBoundaryIdProgressTracking
          ? getCachedItemId(lastItem, scope)
          : "",
        scrollHeight: scrollEl.scrollHeight || 0,
        scrollTop: scrollEl.scrollTop || 0,
      };
    }

    function isRestoreProgressing({ current, previous }) {
      if (autoscroll.defaultIsScrollProgressing({ current, previous })) {
        return true;
      }

      if (!spec.flags.enableBoundaryIdProgressTracking) return false;
      if (!current || !previous) return true;

      if (current.firstItemId && current.firstItemId !== previous.firstItemId) {
        return true;
      }

      return !!current.lastItemId && current.lastItemId !== previous.lastItemId;
    }

    function shouldPauseAfterProgress({ current, previous }) {
      if (!spec.flags.enableRestorePauseAfterGrowth) return false;
      if (!current || !previous) return false;

      if ((current.itemCount || 0) > (previous.itemCount || 0)) return true;
      if ((current.scrollHeight || 0) > (previous.scrollHeight || 0) + 2) {
        return true;
      }

      if (spec.flags.enableBoundaryIdProgressTracking) {
        if (current.firstItemId && current.firstItemId !== previous.firstItemId) {
          return true;
        }

        if (current.lastItemId && current.lastItemId !== previous.lastItemId) {
          return true;
        }
      }

      return false;
    }

    function clickMatchesTab(event) {
      const tab = event.target.closest?.(spec.tabs.tabSelector);
      const container = getTabsContainer(spec);
      return !!(tab && container && container.contains(tab));
    }

    function findLoadMoreButton() {
      return spec.restore.buttonXPath
        ? evalXPathFirst(spec.restore.buttonXPath)
        : null;
    }

    function getLastItemSignature(scope = getCurrentScope()) {
      const items = getItems(scope);
      if (!items.length) return "";

      const lastItem = items[items.length - 1];
      return getItemId(lastItem, scope) || String(items.length);
    }

    return {
      canRestoreScope,
      canToggleProgress,
      clickMatchesTab,
      findLoadMoreButton,
      findReadyContainer,
      getCurrentScope,
      getCurrentTabs: () => getTabs(spec, storageLib),
      getItemId,
      getItems,
      getLastItemSignature,
      getRestoreSnapshot,
      getScrollEl: getDocumentScrollEl,
      isControllerEnabled,
      isRestoreProgressing,
      shouldPauseAfterProgress,
      routeAllows: () => routeAllows(spec),
    };
  }

  function buildRenderer(spec, jkl) {
    if (spec.flags.enableOverlayRenderer) {
      return jkl.createOverlayRenderer({
        highlightBoxId: spec.ids.highlightBoxId,
        keySinkId: spec.ids.keySinkId,
        progressBoxClass: spec.classes.progressBoxClass,
        viewportBottomScreens: spec.render.overlay.viewportBottomScreens,
        viewportTopScreens: spec.render.overlay.viewportTopScreens,
      });
    }

    return jkl.createInlineRenderer({
      highlightClass: spec.classes.highlightClass,
      itemClass: spec.classes.itemClass,
      prepareCheckbox(checkbox) {
        if (!spec.flags.enableInlineItemLayoutFixes) return;
        checkbox.style.position = spec.render.inlineFixes.checkboxPosition;
        checkbox.style.left = spec.render.inlineFixes.checkboxLeft;
        checkbox.style.top = spec.render.inlineFixes.checkboxTop;
        checkbox.style.transform = spec.render.inlineFixes.checkboxTransform;
      },
      prepareItem(itemEl) {
        if (!spec.flags.enableInlineItemLayoutFixes) return;
        itemEl.style.position = spec.render.inlineFixes.itemPosition;

        if (spec.render.inlineFixes.itemOverflowImportant) {
          itemEl.style.setProperty(
            "overflow",
            spec.render.inlineFixes.itemOverflowValue,
            "important",
          );
        } else {
          itemEl.style.overflow = spec.render.inlineFixes.itemOverflowValue;
        }
      },
      progressBoxClass: spec.classes.progressBoxClass,
    });
  }

  function buildControllerConfig(spec, adapter, renderer) {
    const isOverlay = spec.flags.enableOverlayRenderer;
    const controller = spec.controller || {};

    return {
      allowTypingTarget: (el) => el === renderer.getKeySink?.(),
      canToggleProgress: (scope) => adapter.canToggleProgress(scope),
      focusCurrent: controller.focusCurrent ?? !isOverlay,
      installResetHandlers: controller.installResetHandlers ?? true,
      installSyncHandlers: controller.installSyncHandlers ?? isOverlay,
      isEnabled: (scope) => adapter.isControllerEnabled(scope),
      renderer,
      resetHandlerOptions: {
        events: controller.resetEvents || (isOverlay ? ["scroll"] : ["wheel", "touchstart", "scroll"]),
      },
      syncHandlerOptions: {
        events: controller.syncEvents || ["scroll", "resize"],
      },
    };
  }

  function buildEvents(spec, adapter) {
    const events = {};

    if (spec.flags.enableTabClickResync) {
      events.click = {
        matches: (event) => adapter.clickMatchesTab(event),
      };
    }

    if (spec.flags.enableHistoryResync) {
      events.hashchange = true;
      events.popstate = true;
    }

    if (spec.flags.enableMutationResync) {
      events.mutation = {
        options: {
          childList: true,
          subtree: true,
        },
        target: () => document.documentElement,
      };
    }

    return events;
  }

  function buildRestoreStrategy({ adapter, autoscroll, getController, spec }) {
    if (spec.flags.enableDocumentBottomRestore) {
      return autoscroll.createDocumentBottomScrollStrategy({
        isReady() {
          return !spec.restore.readinessRequiresContainer || !!adapter.findReadyContainer();
        },
        maxMs: spec.restore.maxMs,
        maxSteps: spec.restore.maxSteps,
        startDelayMs: spec.restore.startDelayMs,
        stopWhenStuckAtOrAbove: spec.restore.stopWhenStuckAtOrAbove,
        stuckLimit: spec.restore.stuckLimit,
        tickMs: spec.restore.tickMs,
      });
    }

    if (spec.flags.enableBottomJumpRestore) {
      return autoscroll.createBottomScrollStrategy({
        delayAfterProgressMs: spec.restore.postLoadDelayMs,
        getScrollEl: () => adapter.getScrollEl(),
        getSnapshot() {
          return adapter.getRestoreSnapshot();
        },
        isProgressing(context) {
          return adapter.isRestoreProgressing(context);
        },
        isReady() {
          return !spec.restore.readinessRequiresContainer || !!adapter.findReadyContainer();
        },
        maxMs: spec.restore.maxMs,
        maxSteps: spec.restore.maxSteps,
        shouldPauseAfterProgress(context) {
          return adapter.shouldPauseAfterProgress(context);
        },
        startDelayMs: spec.restore.startDelayMs,
        stopWhenStuckAtOrAbove: true,
        stuckLimit: spec.restore.stuckLimit,
        tickMs: spec.restore.tickMs,
      });
    }

    if (spec.flags.enableLoadMoreRestore) {
      let lastClickedAt = 0;
      let lastClickedSignature = "";

      return autoscroll.createLoadMoreStrategy({
        getSignature() {
          return adapter.getLastItemSignature();
        },
        isReady() {
          return !spec.restore.readinessRequiresContainer || !!adapter.findReadyContainer();
        },
        maxSteps: spec.restore.maxSteps,
        startDelayMs: spec.restore.startDelayMs,
        stuckLimit: spec.restore.stuckLimit,
        tickMs: spec.restore.tickMs,
        tryAdvance() {
          if (spec.restore.scrollToBottomFirst) {
            const height =
              document.documentElement.scrollHeight ||
              document.body.scrollHeight ||
              0;
            getController()?.markNavScrolling();
            window.scrollTo({ top: height, left: 0, behavior: "auto" });
            window.scrollBy(0, -1);
            window.scrollBy(0, +1);
          }

          const button = adapter.findLoadMoreButton();
          if (!button || !isClickable(button)) return false;

          const signature = firstNonEmpty([
            button.getAttribute("href"),
            trimmedText(button.textContent),
            "button",
          ]);
          const now = Date.now();

          if (
            signature === lastClickedSignature &&
            now - lastClickedAt < spec.restore.clickThrottleMs
          ) {
            return true;
          }

          lastClickedSignature = signature;
          lastClickedAt = now;
          button.click();
          return true;
        },
      });
    }

    return null;
  }

  function buildPublicApi({
    adapter,
    ensureObservers,
    runtime,
    runtimeInstance,
    runtimeMode,
    spec,
  }) {
    const progress = runtime.createProgressApi({
      controller: runtimeInstance.controller,
      storage: runtimeInstance.progressStorage,
    });

    function resync(options = {}) {
      ensureObservers();

      if (runtimeMode === "single") {
        runtimeInstance.resync({
          shouldRestore: options.shouldRestore !== false,
        });
        return;
      }

      runtimeInstance.queueScopeSync({
        force: !!options.force,
        shouldRestore: options.shouldRestore !== false,
      });
    }

    const api = {
      activate() {
        resync({ force: true, shouldRestore: true });
      },
      deactivate() {
        runtimeInstance.restorer.cancel();
        runtimeInstance.controller.deactivate();
      },
      forceSync() {
        resync({ force: true, shouldRestore: false });
        runtimeInstance.controller.queueSync();
      },
      getActiveScope() {
        return runtimeInstance.progressStorage.getScope();
      },
      isActiveNow() {
        return adapter.isControllerEnabled(runtimeInstance.progressStorage.getScope());
      },
      progress,
      reset: runtimeInstance.controller.clearSelection,
      resync,
    };

    for (const [aliasName, targetName] of Object.entries(spec.api.aliases || {})) {
      if (typeof api[targetName] === "function") {
        api[aliasName] = (...args) => api[targetName](...args);
      } else if (api[targetName] != null) {
        api[aliasName] = api[targetName];
      }
    }

    return api;
  }

  function installSite(spec, { autoscroll, jkl, runtime, storageLib }) {
    const adapter = createSiteAdapter({
      autoscroll,
      jkl,
      spec,
      storageLib,
    });
    const renderer = buildRenderer(spec, jkl);
    const controllerConfig = buildControllerConfig(spec, adapter, renderer);

    let controllerRef = null;
    let observer = null;
    let observedTarget = null;

    function disconnectObserver() {
      observer?.disconnect();
      observer = null;
      observedTarget = null;
    }

    function ensureObservers() {
      if (!spec.flags.enableFeedMutationObserver) return;

      const target = adapter.findReadyContainer();
      if (!target) {
        disconnectObserver();
        return;
      }

      if (observer && observedTarget === target) return;

      disconnectObserver();

      observer = new MutationObserver(() => {
        controllerRef?.queueSync();
      });

      observer.observe(target, {
        childList: spec.observer.childList !== false,
        subtree: !!spec.observer.subtree,
      });

      observedTarget = target;
    }

    function scheduleObserverRefresh() {
      ensureObservers();
      setTimeout(ensureObservers, 80);
      setTimeout(ensureObservers, 240);
    }

    const restorerStrategy = buildRestoreStrategy({
      adapter,
      autoscroll,
      getController: () => controllerRef,
      spec,
    });

    const runtimeMode = spec.flags.enableSingleFixedScope ? "single" : "scoped";
    let runtimeInstance = null;

    if (runtimeMode === "single") {
      const storage = storageLib.createSingleScopeStorage({
        ...spec.scope.fixed,
        storageKey: spec.storageKey,
      });

      runtimeInstance = runtime.createSingleScopeSiteRuntime({
        autoscroll,
        controller: controllerConfig,
        getItemId: adapter.getItemId,
        getItems: adapter.getItems,
        initialRestore: true,
        jkl,
        onResync(context) {
          controllerRef = context.controller;
          scheduleObserverRefresh();
        },
        restorer: {
          isEnabled: (scope) => adapter.canRestoreScope(scope),
          strategy: restorerStrategy,
        },
        storage,
      });
    } else {
      runtimeInstance = runtime.createScopedSiteRuntime({
        autoscroll,
        controller: controllerConfig,
        events: buildEvents(spec, adapter),
        getItemId: adapter.getItemId,
        getItems: adapter.getItems,
        getScope: adapter.getCurrentScope,
        jkl,
        restoreDelayMs: spec.flags.enableRestoreDelay
          ? spec.restore.restoreDelayMs
          : 0,
        restorer: {
          isEnabled: (scope) => adapter.canRestoreScope(scope),
          strategy: restorerStrategy,
        },
        shouldRestoreScope: (scope) => adapter.canRestoreScope(scope),
        storageLib,
      });

      controllerRef = runtimeInstance.controller;
      scheduleObserverRefresh();
    }

    controllerRef = runtimeInstance.controller;

    const api = buildPublicApi({
      adapter,
      ensureObservers: scheduleObserverRefresh,
      runtime,
      runtimeInstance,
      runtimeMode,
      spec,
    });

    if (spec.exportName) {
      window[spec.exportName] = api;
    }

    return {
      ...runtimeInstance,
      api,
      ensureObservers: scheduleObserverRefresh,
      resync(options = {}) {
        api.resync(options);
      },
    };
  }

  function registerSite(rawSpec = {}) {
    const spec = mergeSiteSpec(rawSpec);

    window.__feedScrollerSiteModules__[spec.name] = {
      name: spec.name,
      matches() {
        return matchesLocation(spec.match);
      },
      install() {
        const runtimeHandle = window[spec.installFlag];

        applyCssVars(spec.cssVars);

        if (runtimeHandle?.resync) {
          runtimeHandle.ensureObservers?.();
          runtimeHandle.resync({ shouldRestore: true });
          return;
        }

        const storageLib = shared.storage;
        const jkl = shared.jkl;
        const autoscroll = shared.autoscroll;
        const runtime = shared.runtime;

        if (!storageLib || !jkl || !autoscroll || !runtime) return;

        try {
          window[spec.installFlag] = installSite(spec, {
            autoscroll,
            jkl,
            runtime,
            storageLib,
          });
        } catch (error) {
          delete window[spec.installFlag];
          throw error;
        }
      },
    };
  }

  window.__feedScrollerShared__.shell = {
    defaultFlags: { ...DEFAULT_FLAGS },
    registerSite,
  };
})();
