import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
    Bold,
    Code,
    Heading1,
    Heading2,
    Italic,
    List,
    ListChecks,
    ListOrdered,
    Quote,
    Redo2,
    Strikethrough,
    Underline,
    Undo2,
    type LucideIcon,
} from "lucide-react";
import { toEditorHtml } from "../utils/noteContent";

interface NoteEditorProps {
    /** Stored content (HTML, or legacy plain text). Only read on mount. */
    initialContent: string;
    onChange: (html: string) => void;
}

interface ToolbarButton {
    icon: LucideIcon;
    label: string;
    shortcut?: string;
    isActive?: (editor: Editor) => boolean;
    run: (editor: Editor) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

/** Groups are separated by a divider in the toolbar. */
const TOOLBAR: ToolbarButton[][] = [
    [
        {
            icon: Heading1,
            label: "Tiêu đề lớn",
            shortcut: "# ",
            isActive: (e) => e.isActive("heading", { level: 1 }),
            run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
        },
        {
            icon: Heading2,
            label: "Tiêu đề nhỏ",
            shortcut: "## ",
            isActive: (e) => e.isActive("heading", { level: 2 }),
            run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
        },
    ],
    [
        {
            icon: Bold,
            label: "In đậm",
            shortcut: `${mod}+B`,
            isActive: (e) => e.isActive("bold"),
            run: (e) => e.chain().focus().toggleBold().run(),
        },
        {
            icon: Italic,
            label: "In nghiêng",
            shortcut: `${mod}+I`,
            isActive: (e) => e.isActive("italic"),
            run: (e) => e.chain().focus().toggleItalic().run(),
        },
        {
            icon: Underline,
            label: "Gạch chân",
            shortcut: `${mod}+U`,
            isActive: (e) => e.isActive("underline"),
            run: (e) => e.chain().focus().toggleUnderline().run(),
        },
        {
            icon: Strikethrough,
            label: "Gạch ngang",
            shortcut: `${mod}+Shift+S`,
            isActive: (e) => e.isActive("strike"),
            run: (e) => e.chain().focus().toggleStrike().run(),
        },
    ],
    [
        {
            icon: ListChecks,
            label: "Danh sách tích",
            shortcut: "[] ",
            isActive: (e) => e.isActive("taskList"),
            run: (e) => e.chain().focus().toggleTaskList().run(),
        },
        {
            icon: List,
            label: "Gạch đầu dòng",
            shortcut: "- ",
            isActive: (e) => e.isActive("bulletList"),
            run: (e) => e.chain().focus().toggleBulletList().run(),
        },
        {
            icon: ListOrdered,
            label: "Danh sách số thứ tự",
            shortcut: "1. ",
            isActive: (e) => e.isActive("orderedList"),
            run: (e) => e.chain().focus().toggleOrderedList().run(),
        },
    ],
    [
        {
            icon: Quote,
            label: "Trích dẫn",
            shortcut: "> ",
            isActive: (e) => e.isActive("blockquote"),
            run: (e) => e.chain().focus().toggleBlockquote().run(),
        },
        {
            icon: Code,
            label: "Khối code",
            shortcut: "``` ",
            isActive: (e) => e.isActive("codeBlock"),
            run: (e) => e.chain().focus().toggleCodeBlock().run(),
        },
    ],
];
// Horizontal rule has no button (keeps the toolbar on one line): type "---".

const ALL_BUTTONS = TOOLBAR.flat();

function Toolbar({ editor }: { editor: Editor }) {
    // Re-render the toolbar only when the active marks / undo state change,
    // not on every keystroke.
    const state = useEditorState({
        editor,
        selector: ({ editor: e }) => ({
            active: ALL_BUTTONS.map((button) => button.isActive?.(e) ?? false),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
        }),
    });

    const buttonClass = (active: boolean) =>
        `shrink-0 rounded-md p-1 transition-colors ${
            active ? "bg-white text-black" : "text-white/60 hover:bg-white/10 hover:text-white"
        } disabled:pointer-events-none disabled:opacity-30`;

    let index = 0;
    return (
        <div
            role="toolbar"
            aria-label="Định dạng ghi chú"
            // One row; scrolls sideways instead of wrapping on very narrow panels.
            className="mb-3 flex items-center overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            // Keep the editor's selection when clicking toolbar buttons.
            onMouseDown={(event) => event.preventDefault()}
        >
            {TOOLBAR.map((group, groupIndex) => (
                <div key={groupIndex} className="flex items-center">
                    {groupIndex > 0 && <span className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />}
                    {group.map((button) => {
                        const active = state.active[index++];
                        const Icon = button.icon;
                        const title = button.shortcut ? `${button.label} (${button.shortcut})` : button.label;
                        return (
                            <button
                                key={button.label}
                                type="button"
                                title={title}
                                aria-label={button.label}
                                aria-pressed={button.isActive ? active : undefined}
                                onClick={() => button.run(editor)}
                                className={buttonClass(active)}
                            >
                                <Icon size={15} />
                            </button>
                        );
                    })}
                </div>
            ))}
            <div className="ml-auto flex shrink-0 items-center pl-0.5">
                <button
                    type="button"
                    title={`Hoàn tác (${mod}+Z)`}
                    aria-label="Hoàn tác"
                    disabled={!state.canUndo}
                    onClick={() => editor.chain().focus().undo().run()}
                    className={buttonClass(false)}
                >
                    <Undo2 size={15} />
                </button>
                <button
                    type="button"
                    title={`Làm lại (${mod}+Shift+Z)`}
                    aria-label="Làm lại"
                    disabled={!state.canRedo}
                    onClick={() => editor.chain().focus().redo().run()}
                    className={buttonClass(false)}
                >
                    <Redo2 size={15} />
                </button>
            </div>
        </div>
    );
}

/**
 * Rich-text note editor (TipTap): checklists, numbered / bulleted lists,
 * headings, quotes, code and markdown shortcuts ("- ", "1. ", "[] ", "# ").
 * Mount it with `key={note.id}` so switching notes reloads the content.
 */
export default function NoteEditor({ initialContent, onChange }: NoteEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                link: { openOnClick: false, autolink: true },
            }),
            TaskList,
            TaskItem.configure({ nested: true }),
            Placeholder.configure({
                placeholder: "Viết gì đó… Gõ “[] ” để tạo checklist, “1. ” để đánh số, “- ” để gạch đầu dòng",
            }),
        ],
        content: toEditorHtml(initialContent),
        editorProps: {
            attributes: {
                class: "note-editor min-h-full text-base leading-relaxed text-white/90 focus:outline-none",
                "aria-label": "Nội dung ghi chú",
            },
        },
        onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
    });

    if (!editor) return null;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <Toolbar editor={editor} />
            <EditorContent
                editor={editor}
                className="min-h-0 flex-1 cursor-text overflow-y-auto pr-1"
                onClick={(event) => {
                    // Clicking the empty area below the text focuses the end.
                    if (event.target === event.currentTarget) editor.chain().focus("end").run();
                }}
            />
        </div>
    );
}
