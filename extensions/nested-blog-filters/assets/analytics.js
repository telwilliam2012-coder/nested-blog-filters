(() => {
  if (window.__nbfAnalyticsInstalled || window.Shopify?.designMode) return;
  window.__nbfAnalyticsInstalled = true;
  const documents = new Map();
  const blocks = () =>
    document.querySelectorAll(
      "nested-blog-filters[data-blog-id][data-proxy-url]",
    );
  const allowed = () => {
    try {
      return (
        window.Shopify?.customerPrivacy?.analyticsProcessingAllowed() === true
      );
    } catch {
      return false;
    }
  };
  const context = (block) => {
    if (
      !block ||
      block.dataset.designMode === "true" ||
      !window.crypto?.randomUUID
    )
      return;
    try {
      const path = block.dataset.proxyUrl;
      if (!path?.startsWith("/") || path.startsWith("//")) return;
      const url = new URL(path, location.origin);
      if (url.origin !== location.origin || url.search || url.hash) return;
      url.pathname = url.pathname.replace(/\/$/, "") + "/events";
      const blogId = block.dataset.blogId;
      if (!/^gid:\/\/shopify\/Blog\/[1-9]\d*$/.test(blogId)) return;
      const key = url.href + "|" + blogId;
      if (!documents.has(key))
        documents.set(key, {
          pageId: crypto.randomUUID(),
          views: false,
          count: 0,
        });
      return { state: documents.get(key), url, blogId };
    } catch {
      return;
    }
  };
  const send = (block, event, filterId) => {
    if (!allowed()) return;
    const entry = context(block);
    if (
      !entry ||
      entry.state.count >= 100 ||
      (event === "view" && entry.state.views)
    )
      return;
    if (event === "view") entry.state.views = true;
    entry.state.count++;
    // Random tokens live only in this document. No cookie, storage, URL or query text.
    void fetch(entry.url, {
      method: "POST",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blogId: entry.blogId,
        pageId: entry.state.pageId,
        eventId: crypto.randomUUID(),
        event,
        consent: true,
        ...(event === "filter" && filterId ? { filterId } : {}),
      }),
    }).catch(() => {});
  };
  const pageViews = () => {
    if (allowed()) blocks().forEach((block) => send(block, "view"));
  };
  const start = () => {
    document.addEventListener("visitorConsentCollected", pageViews);
    document.addEventListener("change", (event) => {
      if (
        event.target instanceof HTMLInputElement &&
        event.target.dataset.filterId
      )
        send(
          event.target.closest("nested-blog-filters"),
          "filter",
          event.target.dataset.filterId,
        );
    });
    document.addEventListener(
      "click",
      (event) => {
        const button =
          event.target instanceof Element &&
          event.target.closest("[data-remove], [data-clear]");
        if (button && !button.disabled)
          send(
            button.closest("nested-blog-filters"),
            "filter",
            button.matches("[data-remove]")
              ? button.dataset.filterId
              : undefined,
          );
      },
      // The filter widget may disable its clear button in the target handler.
      true,
    );
    document.addEventListener("submit", (event) => {
      if (
        event.target instanceof HTMLFormElement &&
        event.target.matches("[data-search-form]")
      )
        send(event.target.closest("nested-blog-filters"), "search");
    });
    pageViews();
    if (!window.Shopify?.customerPrivacy && window.Shopify?.loadFeatures) {
      try {
        window.Shopify.loadFeatures(
          [{ name: "consent-tracking-api", version: "0.2" }],
          (error) => {
            if (!error) pageViews();
          },
        );
      } catch {
        // Analytics is optional and remains disabled if privacy loading fails.
      }
    }
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
