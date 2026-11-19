import React, { memo, useState } from "react";
import { Trash2, CheckCircle, Circle, Clock } from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Task } from "../types";
import {
  useTasks,
  useAddTask,
  useToggleTask,
  useDeleteTask,
} from "../stores/useAppStore";

const MIN_POMOS = 1;
const MAX_POMOS = 10;

/** Clamp the estimate; an emptied number input gives NaN, which the API rejects. */
const clampPomos = (value: number) =>
  Number.isFinite(value)
    ? Math.min(MAX_POMOS, Math.max(MIN_POMOS, Math.round(value)))
    : MIN_POMOS;

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Memoized: toggling or adding one task does not re-render the others. */
const TaskItem = memo(function TaskItem({ task, onToggle, onDelete }: TaskItemProps) {
  return (
    <div
      className={`group flex items-start gap-3 p-3 rounded-xl border border-transparent transition-all ${
        task.completed
          ? "bg-white/5 opacity-60"
          : "bg-white/10 hover:border-white/20"
      }`}
    >
      <button
        onClick={() => onToggle(task.id)}
        aria-label={task.completed ? "Đánh dấu chưa xong" : "Đánh dấu đã xong"}
        className="mt-0.5 text-white/50 hover:text-white transition-colors"
      >
        {task.completed ? <CheckCircle size={20} /> : <Circle size={20} />}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm truncate ${
            task.completed ? "line-through text-white/50" : "text-white"
          }`}
          title={task.text}
        >
          {task.text}
        </p>
        <div className="flex items-center gap-1 mt-1 text-xs text-white/40">
          <Clock size={10} />
          <span>{task.estimatedPomodoros} pomodoros</span>
        </div>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        aria-label={`Xóa ${task.text}`}
        className="text-white/20 hover:text-red-400 opacity-0 touch-show group-hover:opacity-100 transition-all"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
});

export default function TasksScreen() {
  // Get state from Zustand store (each action syncs one task to the server)
  const tasks = useTasks();
  const saveNewTask = useAddTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();

  const [newTaskText, setNewTaskText] = useState("");
  // Kept as text so the field can be cleared while typing; clamped on submit.
  const [estPomos, setEstPomos] = useState(String(MIN_POMOS));

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTaskText.trim();
    if (!text) return;

    saveNewTask({
      id: uuid(),
      text,
      completed: false,
      estimatedPomodoros: clampPomos(Number(estPomos)),
    });
    setNewTaskText("");
    setEstPomos(String(MIN_POMOS));
  };

  return (
    <div className="flex flex-col h-full text-white">
      <form onSubmit={addTask} className="mb-6">
        <input
          type="text"
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          placeholder="Add a new task..."
          maxLength={5000}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/50 transition-colors mb-2"
        />
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1">
            <Clock size={14} className="text-white/50" />
            <input
              type="number"
              min={MIN_POMOS}
              max={MAX_POMOS}
              value={estPomos}
              onChange={(e) => setEstPomos(e.target.value)}
              onBlur={() => setEstPomos(String(clampPomos(Number(estPomos))))}
              className="w-8 bg-transparent text-center text-sm focus:outline-none"
            />
            <span className="text-xs text-white/50">est.</span>
          </div>
          <button
            type="submit"
            disabled={!newTaskText.trim()}
            className="bg-white text-black px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </form>

      <div className="flex-1 overflow-y-auto  space-y-2 pr-2">
        {tasks.length === 0 && (
          <div className="text-center text-white/30 py-8 text-sm">
            No tasks yet. Stay focused!
          </div>
        )}
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
        ))}
      </div>
    </div>
  );
}
