if (!customElements.get("nested-blog-filters")) {
	const node = (tag, text, className) => {
		const element = document.createElement(tag);
		if (text !== undefined) element.textContent = text;
		if (className) element.className = className;
		return element;
	};
	class NestedBlogFiltersElement extends HTMLElement {
		connectedCallback() {
			this.events?.abort();
			this.events = new AbortController();
			const start = () => {
				if (this.isConnected) this.initialize();
			};
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", start, {
					once: true,
					signal: this.events.signal,
				});
			} else {
				start();
			}
		}

		disconnectedCallback() {
			this.events?.abort();
			this.request?.abort();
			this.version = (this.version ?? 0) + 1;
		}

		initialize() {
			const find = (name) => this.querySelector(`[data-${name}]`);
			this.controls = find("filters");
			this.region = find("results-container");
			this.blogLink = find("blog-link");
			for (const key of [
				"toolbar",
				"status",
				"results",
				"pagination",
				"previous",
				"next",
				"clear",
				"retry",
				"active",
			]) {
				this[key] = find(key);
			}
			if (!this.controls || !this.results || !this.status) return;
			this.fallback ??= this.results.cloneNode(true);
			this.selected = new Map();
			this.page = 1;
			this.totalPages = 0;
			this.ready = false;
			try {
				const path = this.dataset.proxyUrl;
				if (!path?.startsWith("/") || path.startsWith("//")) throw new Error();
				this.endpoint = new URL(path, location.origin);
				this.blogUrl = new URL(this.dataset.blogUrl, location.origin);
				if (
					this.endpoint.origin !== location.origin ||
					this.blogUrl.origin !== location.origin ||
					this.endpoint.search ||
					this.endpoint.hash
				)
					throw new Error();
				this.numbers = new Intl.NumberFormat(this.dataset.locale);
				this.dates = new Intl.DateTimeFormat(this.dataset.locale, {
					dateStyle: "medium",
				});
			} catch {
				this.showError();
				return;
			}
			const on = (target, event, handler) => target.addEventListener(event, handler, { signal: this.events.signal });
			on(this, "change", (event) => {
				const input = event.target;
				if (!(input instanceof HTMLInputElement) || !input.dataset.filterId) return;
				this.select(input.dataset.filterId, input.value, input.checked);
			});
			on(this, "click", (event) => {
				const chip = event.target.closest("[data-remove]");
				if (chip) this.select(chip.dataset.filterId, chip.value, false);
			});
			on(document, "pointerdown", (event) => {
				if (!this.controls.contains(event.target)) this.closeMenus();
			});
			on(this, "keydown", (event) => {
				if (event.key === "Escape") {
					const open = this.controls.querySelector("details[open]");
					this.closeMenus();
					open?.querySelector("summary").focus();
				}
			});
			on(this.clear, "click", () => {
				this.closeMenus();
				this.selected.clear();
				this.controls.querySelectorAll("input").forEach((input) => {
					input.checked = false;
				});
				this.load(1);
			});
			on(this.previous, "click", () => this.load(this.page - 1));
			on(this.next, "click", () => this.load(this.page + 1));
			on(this.retry, "click", () => this.load(this.targetPage ?? 1));
			this.load(1);
		}

		closeMenus() {
			this.controls.querySelectorAll("details[open]").forEach((details) => {
				details.open = false;
			});
		}

		select(filterId, value, checked) {
			const selected = this.selected.get(filterId) ?? new Set();
			if (checked) selected.add(value);
			else selected.delete(value);
			if (selected.size) this.selected.set(filterId, selected);
			else this.selected.delete(filterId);
			const changed = new Set([filterId]);
			for (const filter of this.filters ?? []) {
				if (changed.has(filter.parentFilterId)) {
					changed.add(filter.id);
					this.selected.delete(filter.id);
				}
			}
			this.load(1);
		}

		async load(page) {
			this.request?.abort();
			this.request = new AbortController();
			const version = (this.version = (this.version ?? 0) + 1);
			const url = new URL(this.endpoint);
			url.searchParams.set("blogId", this.dataset.blogId);
			url.searchParams.set("page", String(page));
			url.searchParams.set("pageSize", this.dataset.pageSize || "12");
			for (const [filterId, optionIds] of this.selected) {
				for (const optionId of optionIds) url.searchParams.append(`option.${filterId}`, optionId);
			}
			this.targetPage = page;
			this.setBusy(true);
			this.status.textContent = this.dataset.loading;
			this.retry.hidden = true;
			const timeout = setTimeout(() => this.version === version && this.request.abort(), 15000);
			try {
				const response = await fetch(url, {
					signal: this.request.signal,
					credentials: "same-origin",
					headers: { Accept: "application/json" },
				});
				if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
					throw new Error();
				}
				const result = await response.json();
				if (this.version !== version || !this.isConnected) return;
				if (result.status === "unconfigured") {
					this.ready = false;
					if (this.blogLink) this.blogLink.hidden = false;
					this.selected.clear();
					this.toolbar.hidden = true;
					this.active?.replaceChildren();
					this.pagination.hidden = true;
					this.region.hidden = false;
					this.results.replaceChildren(...this.fallback.cloneNode(true).childNodes);
					this.status.textContent = this.dataset.designMode === "true" ? this.dataset.unconfigured : "";
					return;
				}
				if (result.status !== "ready" || !Array.isArray(result.filters) || !Array.isArray(result.articles)) {
					throw new Error();
				}
				this.ready = true;
				if (this.blogLink) this.blogLink.hidden = true;
				this.page = result.page;
				this.totalPages = result.totalPages;
				this.renderFilters(result.filters);
				this.renderArticles(result.articles);
				this.region.hidden = false;
				this.status.textContent = this.dataset.resultsLabel.replace("[count]", this.numbers.format(result.total));
				this.querySelector("[data-page]").textContent = this.dataset.pageLabel
					.replace("[current]", this.numbers.format(result.page))
					.replace("[total]", this.numbers.format(result.totalPages));
				this.pagination.hidden = result.totalPages <= 1;
			} catch {
				if (this.version === version && this.isConnected) this.showError();
			} finally {
				clearTimeout(timeout);
				if (this.version === version && this.isConnected) this.setBusy(false);
			}
		}

		setBusy(busy) {
			this.region.setAttribute("aria-busy", String(busy));
			this.toolbar.setAttribute("aria-busy", String(busy));
			this.previous.disabled = busy || this.page <= 1;
			this.next.disabled = busy || this.page >= this.totalPages;
			this.clear.disabled = this.selected.size === 0;
		}

		showError() {
			if (this.blogLink) this.blogLink.hidden = false;
			this.status.textContent = this.dataset.error;
			this.retry.hidden = false;
			this.region.hidden = Boolean(this.ready);
			this.pagination.hidden = true;
		}

		renderFilters(filters) {
			this.filters = filters;
			const open = new Set([...this.controls.querySelectorAll("details[open]")].map((node) => node.dataset.filterId));
			const focused = this.contains(document.activeElement) ? document.activeElement : null;
			const focusFilter = focused?.dataset.filterId;
			const focusOption = focused?.value;
			const fragment = document.createDocumentFragment();
			const chips = document.createDocumentFragment();
			const targets = new Map();
			this.selected.clear();
			for (const filter of filters) {
				if (filter.visible === false) continue;
				const details = node("details", undefined, "nbf__filter");
				details.name = this.id;
				details.dataset.filterId = filter.id;
				details.open = open.has(filter.id);
				const summary = node("summary");
				const labels = filter.options.filter((option) => option.selected).map((option) => option.label);
				const value = labels.length ? labels.join(", ") : this.dataset.chooseLabel;
				summary.append(
					node("span", `${fragment.childElementCount + 1}. ${filter.label}`, "nbf__filter-label"),
					node("span", value, "nbf__filter-value"),
				);
				summary.title = `${filter.label}: ${value}`;
				details.classList.toggle("nbf__filter--selected", labels.length > 0);
				summary.dataset.filterId = filter.id;
				targets.set(filter.id, summary);
				const fieldset = node("fieldset");
				fieldset.append(node("legend", filter.label, "nbf__sr-only"));
				const selected = new Set();
				for (const option of filter.options) {
					if (filter.parentFilterId && !option.available && !option.selected) continue;
					const label = node("label", undefined, "nbf__option");
					const input = node("input");
					input.type = "checkbox";
					input.name = `option.${filter.id}`;
					input.value = option.id;
					input.dataset.filterId = filter.id;
					input.checked = option.selected;
					input.disabled = !option.available && !option.selected;
					if (option.selected) selected.add(option.id);
					if (option.selected) {
						const chip = node("button", option.label, "nbf__chip");
						chip.type = "button";
						chip.value = option.id;
						chip.dataset.filterId = filter.id;
						chip.dataset.remove = "";
						chip.setAttribute("aria-label", (this.dataset.removeLabel ?? "[value]").replace("[value]", option.label));
						chip.append(node("span", "×"));
						chips.append(chip);
					}
					label.append(
						input,
						node("span", option.label, "nbf__option-label"),
						node("span", `(${this.numbers.format(option.count)})`, "nbf__count"),
					);
					fieldset.append(label);
					targets.set(`${filter.id}:${option.id}`, input);
				}
				if (selected.size) {
					this.selected.set(filter.id, selected);
				}
				details.append(summary, fieldset);
				fragment.append(details);
			}
			this.controls.replaceChildren(fragment);
			if (this.active) {
				this.active.hidden = !chips.childElementCount;
				this.active.replaceChildren(chips);
			}
			this.toolbar.hidden = !filters.some((filter) => filter.visible !== false);
			if (focusFilter) {
				const input = targets.get(`${focusFilter}:${focusOption}`);
				const target = input && !input.disabled && input.closest("details").open ? input : targets.get(focusFilter);
				target?.focus({ preventScroll: true });
			}
		}

		renderArticles(articles) {
			const fragment = document.createDocumentFragment();
			if (!articles.length) {
				const empty = node("li", undefined, "nbf__empty");
				empty.append(node("h3", this.dataset.emptyTitle), node("p", this.dataset.empty));
				fragment.append(empty);
			}
			for (const article of articles) {
				const item = node("li", undefined, "nbf__card");
				const body = node("div", undefined, "nbf__card-body");
				const title = node("h3");
				const link = node("a", article.title);
				const url = new URL(this.blogUrl);
				url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(article.handle)}`;
				link.href = url.toString();
				if (article.image?.url) {
					const source = new URL(article.image.url, location.origin);
					if (["https:", "http:"].includes(source.protocol)) {
						const photo = node("a");
						photo.href = link.href;
						const img = node("img", undefined, "nbf__image");
						img.src = source.href;
						img.alt = article.image.alt || article.title;
						img.loading = "lazy";
						img.width = 600;
						img.height = 600;
						photo.append(img);
						item.append(photo);
					}
				}
				title.append(link);
				body.append(title);
				const date = new Date(article.publishedAt);
				if (article.publishedAt && Number.isFinite(date.getTime())) {
					const time = node("time", this.dates.format(date));
					time.dateTime = date.toISOString();
					body.append(time);
				}
				const read = node("a", this.dataset.readLabel, "nbf__read");
				read.href = link.href;
				read.setAttribute("aria-label", `${this.dataset.readLabel}: ${article.title}`);
				body.append(read);
				item.append(body);
				fragment.append(item);
			}
			this.results.replaceChildren(fragment);
		}
	}
	customElements.define("nested-blog-filters", NestedBlogFiltersElement);
}
