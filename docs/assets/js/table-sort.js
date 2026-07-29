/**
 * Click-to-sort for standings tables. Progressive enhancement only.
 *
 * The server emits every table already in its correct default order, so with
 * scripting off the page is complete and correctly ordered (NFR-7). This file
 * reorders what is already there; it never fetches, and it never changes what
 * the build produced (§13.3 — client sorting is a view toggle).
 *
 * Sorting always restarts from the server's original row order, so ties fall
 * back to that default rather than to whatever the previous sort happened to
 * leave behind.
 */
/** Reads the raw value the server attached, not the formatted text. */
function valueOf(row, index) {
    const cell = row.cells[index];
    const raw = cell?.getAttribute("data-sort-value");
    if (raw === null || raw === undefined)
        return Number.NEGATIVE_INFINITY;
    const value = Number(raw);
    return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}
function enhance(table) {
    const head = table.tHead?.rows[0];
    const tbody = table.tBodies[0];
    if (!head || !tbody)
        return;
    // Re-bound after the guard so the non-null type survives into the closures
    // below; narrowing alone does not reach them.
    const body = tbody;
    const columns = [];
    for (const th of Array.from(head.cells)) {
        const key = th.getAttribute("data-sort");
        if (key === null)
            continue;
        columns.push({ key, label: th.textContent?.trim() ?? key, index: th.cellIndex, th });
    }
    if (columns.length === 0)
        return;
    // The server's order. Every sort starts from this, so it is also what
    // "restore default" returns to.
    const original = Array.from(body.rows);
    let activeKey = null;
    let direction = "descending";
    const buttons = new Map();
    function apply(column, dir) {
        const sorted = Array.from(original).sort((a, b) => {
            const diff = valueOf(a, column.index) - valueOf(b, column.index);
            return dir === "descending" ? -diff : diff;
        });
        // Re-appending a node moves it, so this reorders without rebuilding rows
        // and without touching any cell contents.
        for (const row of sorted)
            body.appendChild(row);
        activeKey = column.key;
        direction = dir;
        for (const other of columns) {
            other.th.setAttribute("aria-sort", other.key === column.key ? dir : "none");
        }
        for (const [key, list] of buttons) {
            for (const button of list) {
                const isActive = key === column.key;
                button.setAttribute("aria-pressed", String(isActive));
                button.classList.toggle("is-active", isActive);
                button.dataset["direction"] = isActive ? dir : "";
            }
        }
    }
    function toggle(column) {
        // First click on a column shows the biggest numbers first, which is what
        // a reader wants from a stats table; clicking again reverses it.
        const next = activeKey === column.key && direction === "descending" ? "ascending" : "descending";
        apply(column, next);
    }
    function register(key, button) {
        const list = buttons.get(key);
        if (list)
            list.push(button);
        else
            buttons.set(key, [button]);
    }
    // Desktop: the header cell itself becomes the control. Built here rather than
    // server-side so no inert button exists when scripting is off.
    for (const column of columns) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sort-btn";
        button.textContent = column.label;
        button.addEventListener("click", () => toggle(column));
        column.th.textContent = "";
        column.th.appendChild(button);
        column.th.setAttribute("aria-sort", "none");
        register(column.key, button);
    }
    // Mobile: the header row is hidden in the card layout, so the same controls
    // are offered as a bar above the table. CSS shows it only below 600px.
    const bar = document.createElement("div");
    bar.className = "sort-bar";
    const barLabel = document.createElement("span");
    barLabel.className = "sort-bar-label";
    barLabel.textContent = "Sort";
    bar.appendChild(barLabel);
    for (const column of columns) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sort-chip";
        button.textContent = column.label;
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => toggle(column));
        bar.appendChild(button);
        register(column.key, button);
    }
    table.parentNode?.insertBefore(bar, table);
}
export function initTableSort() {
    for (const table of Array.from(document.querySelectorAll("table[data-sortable]"))) {
        enhance(table);
    }
}
