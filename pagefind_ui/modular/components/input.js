import El from "../helpers/element-builder";

const asyncSleep = async (ms = 100) => {
    return new Promise(r => setTimeout(r, ms));
};

export class Input {
    constructor(opts = {}) {
        this.inputEl = null;
        this.clearEl = null;
        this.instance = null;
        this.searchID = 0;
        this.debounceTimeoutMs = opts.debounceTimeoutMs ?? 300;

        if (opts.inputElement) {
            if (opts.containerElement) {
                console.warn(`[Pagefind Input component]: inputElement and containerElement both supplied. Ignoring the container option.`);
                return;
            }

            this.initExisting(opts.inputElement);
        } else if (opts.containerElement) {
            this.initContainer(opts.containerElement);
        } else {
            console.error(`[Pagefind Input component]: No selector supplied for containerElement or inputElement`);
            return;
        }

        this.inputEl.addEventListener("input", async (e) => {
            if (this.instance && typeof e?.target?.value === "string") {
                this.updateState(e.target.value);

                const thisSearchID = ++this.searchID;
                await asyncSleep(this.debounceTimeoutMs);

                if (thisSearchID !== this.searchID) {
                    return null;
                }

                this.instance?.triggerSearch(e.target.value);
            }
        });
        this.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                ++this.searchID;
                this.inputEl.value = "";
                this.instance?.triggerSearch("");
                this.updateState("");
            }
            if (e.key === "Enter") {
                e.preventDefault();
            }
        });
        this.inputEl.addEventListener("focus", () => {
            this.instance?.triggerLoad();
        });
    }

    initContainer(selector) {
        const container = document.querySelector(selector);
        if (!container) {
            console.error(`[Pagefind Input component]: No container found for ${selector} selector`);
            return;
        }
        if (container.tagName === "INPUT") {
            console.warn(`[Pagefind Input component]: Encountered input element for ${selector} when a container was expected`);
            console.warn(`[Pagefind Input component]: Treating containerElement option as inputElement and proceeding`);
            this.initExisting(selector);
        } else {
            container.innerHTML = "";

            let id = 0;
            while (document.querySelector(`#pfmod-input-${id}`)) {
                id += 1;
            }

            const wrapper = new El("form")
                .class("pagefind-modular-input-wrapper")
                .attrs({
                    role: "search",
                    "aria-label": "Search this site",
                    action: "javascript:void(0);"
                });

            new El("label").attrs({
                "for": `pfmod-input-${id}`,
                "data-pfmod-sr-hidden": "true"
            }).text("Search this site").addTo(wrapper)

            this.inputEl = new El("input").id(`pfmod-input-${id}`).class("pagefind-modular-input").addTo(wrapper);

            this.clearEl = new El("button")
                .class("pagefind-modular-input-clear")
                .attrs({"data-pfmod-suppressed": "true"})
                .text("Clear")
                .handle("click", () => {
                    this.inputEl.value = "";
                    this.instance.triggerSearch("");
                    this.updateState("");
                })
                .addTo(wrapper);

            wrapper.addTo(container);
        }
    }

    initExisting(selector) {
        const el = document.querySelector(selector);
        if (!el) {
            console.error(`[Pagefind Input component]: No input element found for ${selector} selector`);
            return;
        }
        if (el.tagName !== "INPUT") {
            console.error(`[Pagefind Input component]: Expected ${selector} to be an <input> element`);
            return;
        }
        this.inputEl = el;
    }

    updateState(term) {
        if (this.clearEl) {
            if (term && term?.length) {
                this.clearEl.removeAttribute("data-pfmod-suppressed");
            } else {
                this.clearEl.setAttribute("data-pfmod-suppressed", "true");
            }
        }
    }

    register(instance) {
        this.instance = instance;
        this.instance.on("search", (term, _filters) => {
            if (this.inputEl && document.activeElement !== this.inputEl) {
                this.inputEl.value = term;
                this.updateState(term);
            }
        });
    }

    focus() {
        if (this.inputEl) {
            this.inputEl.focus();
        }
    }
}