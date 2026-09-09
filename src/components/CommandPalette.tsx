import {
  BookOpen,
  CalendarDays,
  Flame,
  Hourglass,
  Inbox,
  LayoutGrid,
  ListTodo,
  Palette,
  Plus,
  Search,
  StickyNote,
  Timer,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { THEMES, VIEW_TITLES } from "../catalog";
import { dueLabel, todayKey } from "../lib/time";
import { useOverlayInteraction } from "../lib/overlayStack";
import { useAppStore } from "../store/useAppStore";
import type { ViewKey } from "../types";

const VIEW_ICONS: Partial<Record<ViewKey, typeof Inbox>> = {
  today: CalendarDays,
  inbox: Inbox,
  tools: LayoutGrid,
  kaoyan: BookOpen,
  settings: UserRound,
  tasks: ListTodo,
  habits: Flame,
  notes: StickyNote,
  countdowns: Hourglass,
  focus: Timer,
};

interface PaletteItem {
  key: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  const dialogRef = useOverlayInteraction(open, onClose);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!open) return [];
    const store = useAppStore.getState();
    const keyword = query.trim().toLowerCase();
    const match = (text: string) => !keyword || text.toLowerCase().includes(keyword);
    const today = todayKey();
    const result: PaletteItem[] = [];

    if (keyword) {
      result.push({
        key: "create-task",
        icon: <Plus size={16} />,
        label: `新建任务「${query.trim()}」`,
        hint: "添加到今天",
        run: () => {
          store.addTask(query.trim(), today);
          store.setView("tasks");
        },
      });
    }

    (Object.keys(VIEW_TITLES) as ViewKey[]).forEach((view) => {
      if (!match(VIEW_TITLES[view])) return;
      const Icon = VIEW_ICONS[view] ?? LayoutGrid;
      result.push({
        key: `view-${view}`,
        icon: <Icon size={16} />,
        label: `前往 · ${VIEW_TITLES[view]}`,
        run: () => store.setView(view),
      });
    });

    THEMES.forEach((theme) => {
      if (!match(theme.name) && !match("主题")) return;
      result.push({
        key: `theme-${theme.key}`,
        icon: <Palette size={16} />,
        label: `切换主题 · ${theme.name}`,
        hint: theme.dark ? "深色" : "浅色",
        run: () => store.setTheme(theme.key),
      });
    });

    store.tasks.forEach((task) => {
      if (!match(task.title)) return;
      const due = dueLabel(task.due, today);
      result.push({
        key: `task-${task.id}`,
        icon: <ListTodo size={16} />,
        label: task.title,
        hint: `任务 · ${due.text}${task.done ? " · 已完成" : ""}`,
        run: () => {
          store.setView("tasks");
        },
      });
    });

    store.habits.forEach((habit) => {
      if (!match(habit.title)) return;
      result.push({
        key: `habit-${habit.id}`,
        icon: <Flame size={16} />,
        label: habit.title,
        hint: `习惯 · 今日${habit.checkedDates.includes(today) ? "已打卡" : "未打卡"}`,
        run: () => {
          store.toggleHabitToday(habit.id);
          store.setView("habits");
        },
      });
    });

    store.notes.forEach((note) => {
      if (!match(note.body)) return;
      result.push({
        key: `note-${note.id}`,
        icon: <StickyNote size={16} />,
        label: note.body.length > 24 ? `${note.body.slice(0, 24)}…` : note.body,
        hint: "笔记",
        run: () => store.setView("notes"),
      });
    });

    store.countdowns.forEach((item) => {
      if (!match(item.title)) return;
      result.push({
        key: `countdown-${item.id}`,
        icon: <Hourglass size={16} />,
        label: item.title,
        hint: "倒计时",
        run: () => store.setView("countdowns"),
      });
    });

    store.inbox.forEach((item) => {
      if (!match(item.text)) return;
      result.push({
        key: `inbox-${item.id}`,
        icon: <Inbox size={16} />,
        label: item.text,
        hint: "收集箱 · 转为今天的任务",
        run: () => {
          store.convertInboxToTask(item.id);
          store.setView("tasks");
        },
      });
    });

    store.subjects.forEach((subject) => {
      if (!match(subject.title)) return;
      result.push({
        key: `subject-${subject.id}`,
        icon: <BookOpen size={16} />,
        label: subject.title,
        hint: "考研科目",
        run: () => store.setView("kaoyan"),
      });
    });

    return result.slice(0, 14);
  }, [open, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 键盘高亮项始终滚动进可视区域。
  useEffect(() => {
    activeItemRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, items.length]);

  if (!open) return null;

  function runItem(item: PaletteItem) {
    item.run();
    onClose();
  }

  // 挂在整个浮层上（事件冒泡），焦点移出输入框后方向键 / 回车仍然可用；
  // Escape 由全局浮层栈统一派发给栈顶浮层处理。
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) runItem(item);
    }
  }

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="card palette-card"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-input-row">
          <Search size={17} color="var(--text-3)" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            placeholder="搜索任务、习惯、笔记… 或直接创建"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </div>
        {items.length === 0 ? (
          <p className="empty" style={{ padding: "22px 8px" }}>没有匹配的结果</p>
        ) : (
          <ul className="palette-list" role="listbox">
            {items.map((item, index) => (
              <li key={item.key}>
                <button
                  ref={index === activeIndex ? activeItemRef : undefined}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "palette-item active" : "palette-item"}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runItem(item)}
                >
                  <span className="palette-item-icon">{item.icon}</span>
                  <span className="palette-item-label">{item.label}</span>
                  {item.hint && <span className="palette-item-hint">{item.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="palette-foot">
          <span><kbd className="palette-kbd">↑</kbd><kbd className="palette-kbd">↓</kbd> 选择</span>
          <span><kbd className="palette-kbd">Enter</kbd> 执行</span>
          <span className="muted">BEID 命令面板</span>
        </p>
      </section>
    </div>
  );
}
