/*
 * One-time, read-only rescue tool for the currently deployed React Router app.
 * Run manually in the app iframe on /app/filters. It downloads saved filter
 * configuration only; it never exports sessions, tokens, articles or customers.
 * This version is intentionally bound to the owner's authorized test store.
 */
(async () => {
  const EXPECTED_ORIGIN = "https://nested-blog-filters.onrender.com";
  const EXPECTED_API_KEY = "eb3913f8d3e7dafd2231e5c920b97eb5";
  const EXPECTED_SHOP = "test-blog-store-weyqozsk.myshopify.com";
  const MAX_SETS = 100;
  const MAX_BYTES = 16 * 1024 * 1024;
  const REQUEST_TIMEOUT_MS = 20_000;
  const TOTAL_TIMEOUT_MS = 180_000;
  const lock = Symbol.for("NestedBlogFilters.configurationExport");
  const knownCodes = new Set();
  const fail = (code) => {
    knownCodes.add(code);
    throw Object.assign(new Error("Configuration export stopped."), { code });
  };
  const text = (value, max) => {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > max ||
      // eslint-disable-next-line no-control-regex -- Reject control characters in exported text.
      /[\x00-\x1f\x7f]/.test(value)
    )
      fail("INVALID_SAVED_CONFIGURATION");
    return value;
  };
  const id = (value) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
      fail("INVALID_SAVED_CONFIGURATION");
    return value;
  };
  const integer = (value) => {
    if (!Number.isSafeInteger(value) || value < 0)
      fail("INVALID_SAVED_CONFIGURATION");
    return value;
  };
  const compareId = (left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  const comparePosition = (left, right) =>
    left.position - right.position || compareId(left, right);
  const unique = (values) => {
    if (new Set(values).size !== values.length)
      fail("DUPLICATE_SAVED_IDENTIFIERS");
  };
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      );
    return value;
  };
  const stringify = (value) => JSON.stringify(canonical(value));
  const dates = (source) => {
    const result = {};
    for (const key of ["createdAt", "updatedAt"]) {
      if (source[key] === undefined) continue;
      const value = source[key];
      const iso =
        Object.prototype.toString.call(value) === "[object Date]"
          ? Date.prototype.toISOString.call(value)
          : value;
      if (
        typeof iso !== "string" ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(iso) ||
        new Date(iso).toISOString() !== iso
      )
        fail("INVALID_SAVED_CONFIGURATION");
      result[key] = iso;
    }
    return result;
  };
  const key = (value) => {
    if (typeof value !== "string" || !/^[a-z][a-z0-9_]{1,39}$/.test(value))
      fail("INVALID_SAVED_CONFIGURATION");
    return value;
  };
  const normalizeSet = (source, expectedId) => {
    if (!source || typeof source !== "object" || source.id !== expectedId)
      fail("WRONG_CONFIGURATION_RESPONSE");
    if (source.shop !== EXPECTED_SHOP) fail("WRONG_SHOP");
    if (source.sync) fail("IMPORT_IN_PROGRESS");
    if (!/^gid:\/\/shopify\/Blog\/[1-9]\d*$/.test(source.blogId || ""))
      fail("INVALID_SAVED_CONFIGURATION");
    if (
      !Array.isArray(source.filters) ||
      source.filters.length < 1 ||
      source.filters.length > 10
    )
      fail("INVALID_SAVED_CONFIGURATION");
    const filters = source.filters.map((filter) => {
      if (!filter || typeof filter !== "object")
        fail("INVALID_SAVED_CONFIGURATION");
      if (!["tag", "metafield"].includes(filter.source))
        fail("INVALID_SAVED_CONFIGURATION");
      let parentValues = filter.parentValues;
      if (typeof parentValues === "string") {
        if (parentValues.length > 100_000) fail("INVALID_SAVED_CONFIGURATION");
        try {
          parentValues = JSON.parse(parentValues);
        } catch {
          fail("INVALID_SAVED_CONFIGURATION");
        }
      }
      if (!Array.isArray(parentValues) || parentValues.length > 200)
        fail("INVALID_SAVED_CONFIGURATION");
      parentValues = parentValues.map((value) => text(value, 255));
      unique(parentValues);
      if (!Array.isArray(filter.options) || filter.options.length > 200)
        fail("INVALID_SAVED_CONFIGURATION");
      const options = filter.options
        .map((option) => {
          if (!option || typeof option !== "object")
            fail("INVALID_SAVED_CONFIGURATION");
          return {
            id: id(option.id),
            value: text(option.value, 255),
            label: text(option.label, 100),
            position: integer(option.position),
            ...dates(option),
          };
        })
        .sort(comparePosition);
      unique(options.map((option) => option.id));
      unique(options.map((option) => option.value));
      return {
        id: id(filter.id),
        key: key(filter.key),
        label: text(filter.label, 100),
        position: integer(filter.position),
        source: filter.source,
        parentKey: filter.parentKey === null ? null : key(filter.parentKey),
        parentValues,
        ...dates(filter),
        options,
      };
    });
    filters.sort(comparePosition);
    unique(filters.map((filter) => filter.id));
    unique(filters.map((filter) => filter.key));
    return {
      id: id(source.id),
      blogId: source.blogId,
      name: text(source.name, 100),
      revision: integer(source.revision),
      ...dates(source),
      filters,
    };
  };

  let router;
  let ownedLock = false;
  let totalTimer;
  const fetcherKeys = new Set();
  try {
    if (window.location.origin !== EXPECTED_ORIGIN)
      fail("SELECT_THE_APP_IFRAME");
    if (!/^\/app\/filters\/?$/.test(window.location.pathname))
      fail("OPEN_THE_FILTER_LIST");
    router = window.__reactRouterDataRouter;
    if (
      !router ||
      ![
        "fetch",
        "getFetcher",
        "subscribe",
        "resetFetcher",
        "deleteFetcher",
      ].every((method) => typeof router[method] === "function")
    )
      fail("UNSUPPORTED_ROUTER");
    const app = router.state?.loaderData?.["routes/app"];
    if (app?.apiKey !== EXPECTED_API_KEY) fail("WRONG_APP");
    if (app.shop !== EXPECTED_SHOP) fail("WRONG_SHOP");
    const metaKey = document.querySelector('meta[name="shopify-api-key"]');
    if (metaKey && metaKey.content !== EXPECTED_API_KEY) fail("WRONG_APP");
    if (window[lock]) fail("EXPORT_ALREADY_RUNNING");
    window[lock] = true;
    ownedLock = true;
    const locationKey = router.state.location.key;
    const startPath = window.location.pathname;
    const startSearch = window.location.search;
    const sourceRouteId = router.state.matches.at(-1)?.route.id;
    if (sourceRouteId !== "routes/app.filters") fail("OPEN_THE_FILTER_LIST");
    const query = new URLSearchParams(startSearch);
    if (query.has("shop") && query.get("shop") !== EXPECTED_SHOP)
      fail("WRONG_SHOP");
    const context = new URLSearchParams({ shop: EXPECTED_SHOP });
    for (const parameter of ["host", "embedded"]) {
      const value = query.get(parameter);
      if (value !== null) {
        // eslint-disable-next-line no-control-regex -- Reject control characters in the navigation context.
        if (value.length > 2048 || /[\x00-\x1f\x7f]/.test(value))
          fail("INVALID_APP_CONTEXT");
        context.set(parameter, value);
      }
    }
    const assertStable = () => {
      if (
        router.state.navigation.state !== "idle" ||
        router.state.revalidation !== "idle" ||
        router.state.errors ||
        router.state.location.key !== locationKey ||
        window.location.pathname !== startPath ||
        window.location.search !== startSearch ||
        router.state.loaderData["routes/app"]?.shop !== EXPECTED_SHOP ||
        router.state.loaderData["routes/app"]?.apiKey !== EXPECTED_API_KEY
      )
        fail("APP_CHANGED_OR_REQUIRES_LOGIN");
    };
    assertStable();
    const cleanupFetcher = (fetcherKey) => {
      router.resetFetcher(fetcherKey);
      router.deleteFetcher(fetcherKey);
      fetcherKeys.delete(fetcherKey);
    };
    const timeout = new Promise((_, reject) => {
      totalTimer = setTimeout(() => {
        knownCodes.add("EXPORT_TIMEOUT");
        reject(Object.assign(new Error(), { code: "EXPORT_TIMEOUT" }));
      }, TOTAL_TIMEOUT_MS);
    });
    const load = async (pathname, index = false) => {
      assertStable();
      const href = new URL(pathname, EXPECTED_ORIGIN);
      href.search = context.toString();
      if (index) href.searchParams.set("index", "");
      const fetcherKey = `nbf-config-export-${crypto.randomUUID()}`;
      fetcherKeys.add(fetcherKey);
      // Retain exactly one router reference until its result has been read.
      router.getFetcher(fetcherKey);
      let received;
      // React Router removes completed fetchers from state after notifying its
      // subscribers. Capture this key's data during that notification, as the
      // framework does for useFetcher, without reading unrelated route data.
      const unsubscribe = router.subscribe((state) => {
        const fetcher = state.fetchers.get(fetcherKey);
        if (fetcher?.state === "idle" && fetcher.data !== undefined)
          received = { data: fetcher.data };
      });
      let requestTimer;
      try {
        await Promise.race([
          // No form method, form data, submissions or route navigation.
          router.fetch(fetcherKey, sourceRouteId, href.pathname + href.search, {
            preventScrollReset: true,
          }),
          new Promise((_, reject) => {
            requestTimer = setTimeout(() => {
              knownCodes.add("REQUEST_TIMEOUT");
              reject(Object.assign(new Error(), { code: "REQUEST_TIMEOUT" }));
            }, REQUEST_TIMEOUT_MS);
          }),
          timeout,
        ]);
        assertStable();
        if (!received || !received.data) fail("INCOMPLETE_LOADER_RESPONSE");
        return received.data;
      } finally {
        clearTimeout(requestTimer);
        unsubscribe();
        cleanupFetcher(fetcherKey);
      }
    };
    const run = async () => {
      // A fresh authenticated identity is required even for an empty list.
      if ((await load("/app", true)).shop !== EXPECTED_SHOP) fail("WRONG_SHOP");
      const list = async () => {
        const data = await load("/app/filters");
        if (!Array.isArray(data.sets)) fail("INCOMPLETE_LOADER_RESPONSE");
        if (data.sets.length > MAX_SETS) fail("TOO_MANY_CONFIGURATIONS");
        const ids = data.sets.map((set) => id(set?.id)).sort();
        unique(ids);
        return ids;
      };
      const expectedSetIds = await list();
      const filterSets = [];
      let bytes = 0;
      for (const setId of expectedSetIds) {
        const data = await load(`/app/filters/${encodeURIComponent(setId)}`);
        const set = normalizeSet(data.set, setId);
        if (data.blog?.id !== set.blogId) fail("WRONG_CONFIGURATION_RESPONSE");
        bytes += new TextEncoder().encode(stringify(set)).length;
        if (bytes > MAX_BYTES) fail("EXPORT_TOO_LARGE");
        filterSets.push(set);
      }
      if (stringify(await list()) !== stringify(expectedSetIds))
        fail("CONFIGURATIONS_CHANGED");
      // Re-read saved revisions/content before labeling the snapshot complete.
      for (const set of filterSets) {
        const data = await load(`/app/filters/${encodeURIComponent(set.id)}`);
        if (
          data.blog?.id !== set.blogId ||
          stringify(normalizeSet(data.set, set.id)) !== stringify(set)
        )
          fail("CONFIGURATIONS_CHANGED");
      }
      if (stringify(await list()) !== stringify(expectedSetIds))
        fail("CONFIGURATIONS_CHANGED");
      const payload = { version: 1, shop: EXPECTED_SHOP, filterSets };
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(stringify(payload)),
      );
      const checksum = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return {
        format: "nested-blog-filters.configuration",
        ...payload,
        checksum,
        exportedAt: new Date().toISOString(),
        sourceOrigin: EXPECTED_ORIGIN,
        exportProof: { expectedSetIds, complete: true },
      };
    };
    const snapshot = await Promise.race([run(), timeout]);
    assertStable();
    const serialized = JSON.stringify(snapshot, null, 2) + "\n";
    if (new TextEncoder().encode(serialized).length > MAX_BYTES)
      fail("EXPORT_TOO_LARGE");
    const url = URL.createObjectURL(
      new Blob([serialized], { type: "application/json;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nested-blog-filters-config-${EXPECTED_SHOP.replace(".myshopify.com", "")}-${snapshot.exportedAt.replace(/[:.]/g, "-")}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.info(
      "Configuration export complete. Keep the JSON file private. It is not a full database backup.",
      { filterSets: snapshot.filterSets.length, checksum: snapshot.checksum },
    );
    return {
      ok: true,
      filterSets: snapshot.filterSets.length,
      checksum: snapshot.checksum,
    };
  } catch (error) {
    const code = knownCodes.has(error?.code) ? error.code : "EXPORT_FAILED";
    console.error("No configuration backup was downloaded.", { code });
    return { ok: false, code };
  } finally {
    clearTimeout(totalTimer);
    for (const fetcherKey of fetcherKeys) {
      try {
        router.resetFetcher(fetcherKey);
        router.deleteFetcher(fetcherKey);
      } catch {
        // Never render an SDK response or authentication details in the console.
      }
    }
    if (ownedLock) delete window[lock];
  }
})();
