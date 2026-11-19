/**
 * Note content is stored as HTML produced by the TipTap editor. Older notes
 * were plain text; they are converted when opened (markdown-like lines such
 * as "- [ ] task", "- item" and "1. item" become real lists).
 *
 * Note HTML is only ever rendered through TipTap's schema (which drops
 * anything it does not know) or read as text via DOMParser — never injected
 * with innerHTML.
 */

const HTML_START = /^\s*<(p|h[1-6]|ul|ol|li|blockquote|pre|hr|div)[\s>/]/i;

export const isHtmlContent = (content: string) => HTML_START.test(content);

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Block =
    | { kind: "task"; items: { checked: boolean; text: string }[] }
    | { kind: "bullet"; items: string[] }
    | { kind: "ordered"; items: string[] }
    | { kind: "paragraph"; text: string };

/** Convert a legacy plain-text note into editor HTML. */
export const plainTextToHtml = (text: string): string => {
    const blocks: Block[] = [];
    const last = () => blocks[blocks.length - 1];

    for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
        const task = line.match(/^\s*[-*]?\s*\[( |x|X)?\]\s?(.*)$/);
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);

        if (task) {
            const item = { checked: (task[1] ?? "").toLowerCase() === "x", text: task[2] };
            const prev = last();
            if (prev?.kind === "task") prev.items.push(item);
            else blocks.push({ kind: "task", items: [item] });
        } else if (bullet) {
            const prev = last();
            if (prev?.kind === "bullet") prev.items.push(bullet[1]);
            else blocks.push({ kind: "bullet", items: [bullet[1]] });
        } else if (ordered) {
            const prev = last();
            if (prev?.kind === "ordered") prev.items.push(ordered[1]);
            else blocks.push({ kind: "ordered", items: [ordered[1]] });
        } else {
            blocks.push({ kind: "paragraph", text: line });
        }
    }

    return blocks
        .map((block) => {
            switch (block.kind) {
                case "task":
                    return `<ul data-type="taskList">${block.items
                        .map(
                            (item) =>
                                `<li data-type="taskItem" data-checked="${item.checked}"><p>${escapeHtml(item.text)}</p></li>`
                        )
                        .join("")}</ul>`;
                case "bullet":
                    return `<ul>${block.items.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join("")}</ul>`;
                case "ordered":
                    return `<ol>${block.items.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join("")}</ol>`;
                default:
                    return `<p>${escapeHtml(block.text)}</p>`;
            }
        })
        .join("");
};

/** Content ready to load into the editor. */
export const toEditorHtml = (content: string) =>
    !content ? "" : isHtmlContent(content) ? content : plainTextToHtml(content);

export interface NoteSummary {
    /** All text, for search. */
    text: string;
    /** First non-empty line, shortened. */
    preview: string;
    tasksTotal: number;
    tasksDone: number;
}

const PREVIEW_LENGTH = 120;
const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, pre";
// Matches task items both in saved HTML and in the live editor DOM (TipTap v3
// renders them without data-type="taskItem").
const TASK_ITEM = 'ul[data-type="taskList"] > li';

const summaryCache = new Map<string, NoteSummary>();

/** Plain-text summary of a note (cached by content). */
export const summarizeNote = (content: string): NoteSummary => {
    const cached = summaryCache.get(content);
    if (cached) return cached;

    // Legacy plain text goes through the same conversion as in the editor, so
    // its checklist progress shows in the list before the note is ever opened.
    // DOMParser builds an inert document: no scripts run, nothing loads.
    const doc = new DOMParser().parseFromString(toEditorHtml(content), "text/html");
    const tasksTotal = doc.querySelectorAll(TASK_ITEM).length;
    const tasksDone = doc.querySelectorAll(`${TASK_ITEM}[data-checked="true"]`).length;
    const lines = Array.from(doc.body.querySelectorAll(BLOCK_SELECTOR)).map((el) => {
        const text = (el.textContent ?? "").trim();
        const task = el.closest(TASK_ITEM);
        if (!task || !text) return text;
        return `${task.getAttribute("data-checked") === "true" ? "✓" : "○"} ${text}`;
    });

    const first = lines.find((line) => line !== "") ?? "";
    const summary: NoteSummary = {
        text: lines.join("\n"),
        preview: first.length > PREVIEW_LENGTH ? `${first.slice(0, PREVIEW_LENGTH)}…` : first,
        tasksTotal,
        tasksDone,
    };

    if (summaryCache.size > 500) summaryCache.clear();
    summaryCache.set(content, summary);
    return summary;
};
