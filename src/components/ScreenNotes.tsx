import { lazy, memo, Suspense, useCallback, useMemo, useState } from "react";
import { ArrowLeft, ListChecks, PenLine, Plus, Search, Trash2, X } from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Note } from "../types";
import {
  useNotes,
  useAddNote,
  useUpdateNote,
  useDeleteNote,
} from "../stores/useAppStore";
import { summarizeNote } from "../utils/noteContent";
import { LoadingFallback } from "../utils/loader";

// The rich-text editor (TipTap) is only downloaded when a note is opened.
const NoteEditor = lazy(() => import("./NoteEditor"));

const isEmptyNote = (note: Note) => !note.title.trim() && !summarizeNote(note.content).text.trim();

const YEAR_2000 = 946_684_800_000;

const formatUpdatedAt = (timestamp: number) => {
  if (!timestamp || timestamp < YEAR_2000) return "";
  const date = new Date(timestamp);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/** Strip Vietnamese accents so "ghi chu" finds "Ghi chú". */
const normalize = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Colour by completion: just started → amber, in progress → sky, done → emerald. */
const progressTone = (percent: number) =>
  percent >= 100
    ? { bar: "bg-emerald-400", text: "text-emerald-300", chip: "bg-emerald-400/15 text-emerald-200" }
    : percent >= 34
      ? { bar: "bg-sky-400", text: "text-sky-300", chip: "bg-sky-400/15 text-sky-200" }
      : { bar: "bg-amber-400", text: "text-amber-300", chip: "bg-amber-400/15 text-amber-200" };

const percentOf = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

/** Compact chip: "11/16 · 69%". */
function TaskProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const percent = percentOf(done, total);
  const tone = progressTone(percent);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tone.chip}`}
      title={`${done}/${total} việc đã xong`}
    >
      <ListChecks size={13} />
      {done}/{total} · {percent}%
    </span>
  );
}

/** Full-width bar with the percentage next to it. */
function TaskProgressBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const percent = percentOf(done, total);
  const tone = progressTone(percent);
  return (
    <div className="mt-3 flex items-center gap-2.5">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Tiến độ checklist"
        className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${tone.bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={`w-24 shrink-0 text-right text-xs font-semibold tabular-nums ${tone.text}`}>
        {done}/{total} · {percent}%
      </span>
    </div>
  );
}

interface NoteItemProps {
  note: Note;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Memoized: editing one note does not re-render the rest of the list. */
const NoteItem = memo(function NoteItem({ note, onOpen, onDelete }: NoteItemProps) {
  const summary = summarizeNote(note.content);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(note.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(note.id))}
      className="group relative rounded-xl border border-white/5 bg-white/5 p-4 cursor-pointer transition-all hover:border-white/10 hover:bg-white/10 focus:outline-none focus-visible:border-white/40"
    >
      <div className="mb-1 flex items-baseline gap-2 pr-6">
        <h4 className="min-w-0 flex-1 truncate text-base font-semibold">
          {note.title || "Ghi chú không tên"}
        </h4>
        <span className="shrink-0 text-xs text-white/35">{formatUpdatedAt(note.updatedAt)}</span>
      </div>
      <p className="truncate text-sm text-white/60">{summary.preview || "Chưa có nội dung"}</p>
      <TaskProgressBar done={summary.tasksDone} total={summary.tasksTotal} />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(note.id);
        }}
        aria-label={`Xóa ${note.title || "ghi chú"}`}
        className="absolute right-3 top-4 text-white/25 opacity-0 touch-show transition-all hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
});

export default function NotesScreen() {
  // Get state from Zustand store (each action syncs one note to the server)
  const notes = useNotes();
  const addNote = useAddNote();
  const updateNote = useUpdateNote();
  const removeNote = useDeleteNote();

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const activeNote = activeNoteId ? notes.find((n) => n.id === activeNoteId) : undefined;
  const activeSummary = activeNote ? summarizeNote(activeNote.content) : null;

  const visibleNotes = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return notes;
    return notes.filter((note) =>
      normalize(`${note.title}\n${summarizeNote(note.content).text}`).includes(q)
    );
  }, [notes, query]);

  const createNote = () => {
    const newNote: Note = {
      id: uuid(),
      title: "",
      content: "",
      updatedAt: Date.now(),
    };
    addNote(newNote);
    setQuery("");
    setActiveNoteId(newNote.id);
  };

  // Leaving a note that was never written in removes it instead of keeping an
  // empty "untitled" note around.
  const closeNote = () => {
    if (activeNote && isEmptyNote(activeNote)) removeNote(activeNote.id);
    setActiveNoteId(null);
  };

  // Stable references so memoized NoteItems are not re-rendered needlessly.
  const deleteNote = useCallback(
    (id: string) => {
      removeNote(id);
      setActiveNoteId((current) => (current === id ? null : current));
    },
    [removeNote]
  );

  const handleContentChange = useCallback(
    (content: string) => {
      if (activeNoteId) updateNote(activeNoteId, { content });
    },
    [activeNoteId, updateNote]
  );

  if (activeNote) {
    return (
      <div className="flex h-full flex-col text-white">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={closeNote}
            className="flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft size={16} /> Quay lại
          </button>
          <div className="flex items-center gap-2">
            <TaskProgress done={activeSummary!.tasksDone} total={activeSummary!.tasksTotal} />
            <span className="text-xs text-white/30">{formatUpdatedAt(activeNote.updatedAt)}</span>
          </div>
        </div>

        <input
          type="text"
          value={activeNote.title}
          onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
          placeholder="Tiêu đề"
          maxLength={255}
          autoFocus={!activeNote.title && !activeNote.content}
          className="mb-3 w-full bg-transparent text-2xl font-bold placeholder-white/30 focus:outline-none"
        />

        <Suspense fallback={LoadingFallback}>
          <NoteEditor
            key={activeNote.id}
            initialContent={activeNote.content}
            onChange={handleContentChange}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-white">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <PenLine size={20} /> Notes
        </h3>
        <button
          onClick={createNote}
          aria-label="Tạo ghi chú"
          title="Tạo ghi chú"
          className="rounded-lg bg-white p-1.5 text-black transition-colors hover:bg-white/90"
        >
          <Plus size={18} />
        </button>
      </div>

      {notes.length > 0 && (
        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm ghi chú…"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-8 text-base outline-none transition-colors placeholder:text-white/30 focus:border-white/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Xóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto pr-2">
        {notes.length === 0 && (
          <div className="py-8 text-center text-base text-white/30">
            Ghi lại suy nghĩ, checklist việc cần làm…
          </div>
        )}
        {notes.length > 0 && visibleNotes.length === 0 && (
          <div className="py-8 text-center text-base text-white/30">Không tìm thấy ghi chú nào.</div>
        )}
        {visibleNotes.map((note) => (
          <NoteItem key={note.id} note={note} onOpen={setActiveNoteId} onDelete={deleteNote} />
        ))}
      </div>
    </div>
  );
}
