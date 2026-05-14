import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "yuki-task-manager-data";
const ACTIVE_VIEW_KEY = "yuki-task-manager-active-view";

type TaskType = "やるべきこと" | "やりたいこと" | "思いつき";
type TaskStatus = "今日やる" | "近いうち" | "いつかやる" | "連絡待ち" | "保留" | "完了";
type ActiveTaskCategory = "生活" | "仕事" | "お金" | "人・連絡" | "趣味" | "開発" | "SNS" | "その他";
type TaskCategory = ActiveTaskCategory | string;
type TaskPlace = "PC" | "スマホ" | "家" | "外" | "Codexに頼む" | "未設定";
type RecurringKind = "楽しみ" | "習慣" | "確認" | "振り返り";
type RepeatType = "weekly" | "monthly";
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type Task = {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  category: TaskCategory;
  memo: string;
  place: TaskPlace;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type AppData = {
  version: number;
  exportedAt?: string;
  tasks: Task[];
  recurringTasks: RecurringTask[];
  recurringCompletions: RecurringCompletion[];
  settings: {
    categories: TaskCategory[];
    types: TaskType[];
    statuses: TaskStatus[];
    places: TaskPlace[];
  };
};

type Tab = "今日" | "ストック" | "完了" | "設定";
type StoredView = "today" | "stock" | "done" | "settings";
type FilterValue = "すべて" | string;

type TaskDraft = {
  title: string;
  type: TaskType;
  status: TaskStatus;
  category: TaskCategory;
  place: TaskPlace;
  dueDate: string;
  memo: string;
};

type RecurringTask = {
  id: string;
  title: string;
  memo: string;
  category: ActiveTaskCategory;
  kind: RecurringKind;
  repeatType: RepeatType;
  weekday: Weekday | null;
  monthDay: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type RecurringCompletion = {
  id: string;
  recurringTaskId: string;
  targetDate: string;
  completedAt: string;
  titleSnapshot: string;
  categorySnapshot: ActiveTaskCategory;
  kindSnapshot: RecurringKind;
};

type RecurringDraft = {
  title: string;
  memo: string;
  category: ActiveTaskCategory;
  kind: RecurringKind;
  repeatType: RepeatType;
  weekday: string;
  monthDay: string;
  isActive: boolean;
};

type VisibleRecurringTask = {
  task: RecurringTask;
  targetDate: string;
};

const TASK_TYPES: TaskType[] = ["やるべきこと", "やりたいこと", "思いつき"];
const TASK_STATUSES: TaskStatus[] = ["今日やる", "近いうち", "いつかやる", "連絡待ち", "保留", "完了"];
const ACTIVE_TASK_CATEGORIES: ActiveTaskCategory[] = ["生活", "仕事", "お金", "人・連絡", "趣味", "開発", "SNS", "その他"];
const TASK_PLACES: TaskPlace[] = ["PC", "スマホ", "家", "外", "Codexに頼む", "未設定"];
const RECURRING_KINDS: RecurringKind[] = ["楽しみ", "習慣", "確認", "振り返り"];
const REPEAT_TYPES: RepeatType[] = ["weekly", "monthly"];
const WEEKDAYS = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"] as const;
const TAB_TO_STORED_VIEW: Record<Tab, StoredView> = {
  今日: "today",
  ストック: "stock",
  完了: "done",
  設定: "settings",
};
const STORED_VIEW_TO_TAB: Record<StoredView, Tab> = {
  today: "今日",
  stock: "ストック",
  done: "完了",
  settings: "設定",
};

const emptyData = (): AppData => ({
  version: 1,
  tasks: [],
  recurringTasks: [],
  recurringCompletions: [],
  settings: {
    categories: ACTIVE_TASK_CATEGORIES,
    types: TASK_TYPES,
    statuses: TASK_STATUSES,
    places: TASK_PLACES,
  },
});

const newRecurringDraft = (): RecurringDraft => ({
  title: "",
  memo: "",
  category: "生活",
  kind: "楽しみ",
  repeatType: "weekly",
  weekday: "0",
  monthDay: "1",
  isActive: true,
});

const newDraft = (status: TaskStatus): TaskDraft => ({
  title: "",
  type: "思いつき",
  status,
  category: "生活",
  place: "未設定",
  dueDate: "",
  memo: "",
});

const toDateKey = (value: string | null) => value ? value.slice(0, 10) : "";
const todayKey = () => dateKeyFromDate(new Date());
const nowIso = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
  return `${dateKeyFromDate(now)}T${hours}:${minutes}:${seconds}.${milliseconds}`;
};
const byCreatedDesc = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);
const byCompletedDesc = (a: Task, b: Task) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
const byUpdatedThenCreatedDesc = (a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt) || byCreatedDesc(a, b);
const byDueThenUpdatedDesc = (a: Task, b: Task) => {
  const aHasDue = Boolean(a.dueDate);
  const bHasDue = Boolean(b.dueDate);
  if (aHasDue && bHasDue) return (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || byUpdatedThenCreatedDesc(a, b);
  if (aHasDue) return -1;
  if (bHasDue) return 1;
  return byUpdatedThenCreatedDesc(a, b);
};
const repeatTypeLabel = (repeatType: RepeatType) => repeatType === "weekly" ? "毎週" : "毎月";
const recurringInfo = (task: RecurringTask) => task.repeatType === "weekly" ? `毎週 ${WEEKDAYS[task.weekday ?? 0]}` : `毎月 ${task.monthDay}日`;

function isOneOf<T extends string>(value: unknown, list: readonly T[]): value is T {
  return typeof value === "string" && list.includes(value as T);
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isMonthDay(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31;
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<Task>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    isOneOf(task.type, TASK_TYPES) &&
    isOneOf(task.status, TASK_STATUSES) &&
    typeof task.category === "string" &&
    typeof task.memo === "string" &&
    isOneOf(task.place, TASK_PLACES) &&
    (typeof task.dueDate === "string" || task.dueDate === null) &&
    typeof task.createdAt === "string" &&
    typeof task.updatedAt === "string" &&
    (typeof task.completedAt === "string" || task.completedAt === null)
  );
}

function isRecurringTask(value: unknown): value is RecurringTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<RecurringTask>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.memo === "string" &&
    isOneOf(task.category, ACTIVE_TASK_CATEGORIES) &&
    isOneOf(task.kind, RECURRING_KINDS) &&
    isOneOf(task.repeatType, REPEAT_TYPES) &&
    (isWeekday(task.weekday) || task.weekday === null) &&
    (isMonthDay(task.monthDay) || task.monthDay === null) &&
    typeof task.isActive === "boolean" &&
    typeof task.createdAt === "string" &&
    typeof task.updatedAt === "string"
  );
}

function isRecurringCompletion(value: unknown): value is RecurringCompletion {
  if (!value || typeof value !== "object") return false;
  const completion = value as Partial<RecurringCompletion>;
  return (
    typeof completion.id === "string" &&
    typeof completion.recurringTaskId === "string" &&
    typeof completion.targetDate === "string" &&
    typeof completion.completedAt === "string" &&
    typeof completion.titleSnapshot === "string" &&
    isOneOf(completion.categorySnapshot, ACTIVE_TASK_CATEGORIES) &&
    isOneOf(completion.kindSnapshot, RECURRING_KINDS)
  );
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppData>;
  const recurringTasksOk = data.recurringTasks === undefined || (Array.isArray(data.recurringTasks) && data.recurringTasks.every(isRecurringTask));
  const recurringCompletionsOk = data.recurringCompletions === undefined || (Array.isArray(data.recurringCompletions) && data.recurringCompletions.every(isRecurringCompletion));
  return typeof data.version === "number" && Array.isArray(data.tasks) && data.tasks.every(isTask) && recurringTasksOk && recurringCompletionsOk;
}

function normalizeData(data: AppData): AppData {
  return {
    ...emptyData(),
    ...data,
    version: 1,
    recurringTasks: data.recurringTasks ?? [],
    recurringCompletions: data.recurringCompletions ?? [],
    settings: {
      ...emptyData().settings,
      ...data.settings,
    },
  };
}

function loadData(): { data: AppData; error: string } {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { data: emptyData(), error: "" };
  try {
    const parsed = JSON.parse(raw);
    if (!isAppData(parsed)) throw new Error("Invalid data");
    return { data: normalizeData(parsed), error: "" };
  } catch {
    return {
      data: emptyData(),
      error: "保存データを読み込めませんでした。必要ならJSONバックアップから復元してください。",
    };
  }
}

function loadActiveTab(): Tab {
  const stored = localStorage.getItem(ACTIVE_VIEW_KEY);
  return stored && stored in STORED_VIEW_TO_TAB ? STORED_VIEW_TO_TAB[stored as StoredView] : "今日";
}

function makeTask(draft: TaskDraft): Task {
  const time = nowIso();
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    title: draft.title.trim(),
    type: draft.type,
    status: draft.status,
    category: draft.category,
    memo: draft.memo.trim(),
    place: draft.place,
    dueDate: draft.dueDate || null,
    createdAt: time,
    updatedAt: time,
    completedAt: draft.status === "完了" ? time : null,
  };
}

function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    type: task.type,
    status: task.status,
    category: task.category,
    place: task.place,
    dueDate: task.dueDate ?? "",
    memo: task.memo,
  };
}

function draftFromRecurringTask(task: RecurringTask): RecurringDraft {
  return {
    title: task.title,
    memo: task.memo,
    category: task.category,
    kind: task.kind,
    repeatType: task.repeatType,
    weekday: String(task.weekday ?? 0),
    monthDay: String(task.monthDay ?? 1),
    isActive: task.isActive,
  };
}

function dateFromKey(key: string) {
  return new Date(`${key}T00:00:00`);
}

function dateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function monthlyTargetDate(base: Date, monthOffset: number, monthDay: number) {
  const first = addMonths(new Date(base.getFullYear(), base.getMonth(), 1), monthOffset);
  const day = Math.min(monthDay, daysInMonth(first.getFullYear(), first.getMonth()));
  return new Date(first.getFullYear(), first.getMonth(), day);
}

function visibleTargetDate(task: RecurringTask, today = todayKey()) {
  if (!task.isActive) return null;
  const todayDate = dateFromKey(today);
  if (task.repeatType === "weekly") {
    if (task.weekday === null) return null;
    const diff = (todayDate.getDay() - task.weekday + 7) % 7;
    if (diff > 1) return null;
    return dateKeyFromDate(addDays(todayDate, -diff));
  }
  if (task.monthDay === null) return null;
  const candidates = [-1, 0, 1].map((offset) => monthlyTargetDate(todayDate, offset, task.monthDay as number));
  const target = candidates.find((candidate) => {
    const diff = Math.round((todayDate.getTime() - candidate.getTime()) / 86400000);
    return diff >= -2 && diff <= 2;
  });
  return target ? dateKeyFromDate(target) : null;
}

function visibleRecurringTasks(data: AppData) {
  const completedKeys = new Set(data.recurringCompletions.map((completion) => `${completion.recurringTaskId}:${completion.targetDate}`));
  return data.recurringTasks
    .map((task) => ({ task, targetDate: visibleTargetDate(task) }))
    .filter((item): item is VisibleRecurringTask => Boolean(item.targetDate) && !completedKeys.has(`${item.task.id}:${item.targetDate}`))
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.task.createdAt.localeCompare(b.task.createdAt));
}

function completedRecurringToday(data: AppData) {
  return data.recurringCompletions.filter((completion) => toDateKey(completion.completedAt) === todayKey()).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

function isRecentlyUpdatedStockTask(task: Task) {
  if (task.status === "今日やる" || task.status === "近いうち" || task.status === "完了") return false;
  const updatedKey = toDateKey(task.updatedAt);
  if (!updatedKey) return false;
  const todayDate = dateFromKey(todayKey());
  return updatedKey >= dateKeyFromDate(addDays(todayDate, -2)) && updatedKey <= todayKey();
}

function dueLabel(dueDate: string | null) {
  if (!dueDate) return "";
  const today = new Date(`${todayKey()}T00:00:00`);
  const due = new Date(`${dueDate}T00:00:00`);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "過ぎているかも";
  if (diff === 0) return "今日まで";
  if (diff === 1) return "明日まで";
  return `あと${diff}日`;
}

function isNearDue(task: Task) {
  if (!task.dueDate || task.status === "完了" || task.status === "今日やる") return false;
  const today = new Date(`${todayKey()}T00:00:00`);
  const due = new Date(`${task.dueDate}T00:00:00`);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  return diff <= 3;
}

function App() {
  const loaded = useMemo(loadData, []);
  const initialTab = useMemo(loadActiveTab, []);
  const [data, setData] = useState<AppData>(loaded.data);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [loadError, setLoadError] = useState(loaded.error);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState<RecurringTask | null>(null);
  const [importData, setImportData] = useState<AppData | null>(null);
  const [importError, setImportError] = useState("");
  const [filters, setFilters] = useState<Record<string, FilterValue>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [saveBlocked, setSaveBlocked] = useState(Boolean(loaded.error));
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (saveBlocked) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, saveBlocked]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_VIEW_KEY, TAB_TO_STORED_VIEW[activeTab]);
  }, [activeTab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const tasks = data.tasks;
  const todayTasks = tasks.filter((task) => task.status === "今日やる").sort(byCreatedDesc);
  const nearDueTasks = tasks.filter((task) => isNearDue(task) && task.status !== "連絡待ち").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const completedTodayTasks = tasks.filter((task) => task.status === "完了" && toDateKey(task.completedAt) === todayKey()).sort(byCompletedDesc);
  const waitingContactTasks = tasks.filter((task) => task.status === "連絡待ち" && !task.completedAt).sort(byCreatedDesc);
  const stockTasks = tasks.filter((task) => task.status !== "完了" && task.status !== "今日やる").sort(byCreatedDesc);
  const doneTasks = tasks.filter((task) => task.status === "完了").sort(byCompletedDesc);
  const recurringTodayTasks = visibleRecurringTasks(data);
  const recurringCompletedToday = completedRecurringToday(data);
  const matchesSearch = (task: Task) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [task.title, task.memo, task.category, task.status].some((value) => value.toLowerCase().includes(query));
  };

  function updateTask(id: string, updater: (task: Task) => Task) {
    setSaveBlocked(false);
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? updater(task) : task) }));
  }

  function addTask(draft: TaskDraft) {
    if (!draft.title.trim()) return false;
    setSaveBlocked(false);
    setData((current) => ({ ...current, tasks: [makeTask(draft), ...current.tasks] }));
    setNotice("タスクを追加しました。");
    return true;
  }

  function saveTask(task: Task, draft: TaskDraft) {
    const time = nowIso();
    const completedAt = draft.status === "完了" ? (task.completedAt ?? time) : null;
    updateTask(task.id, () => ({
      ...task,
      title: draft.title.trim(),
      type: draft.type,
      status: draft.status,
      category: draft.category,
      place: draft.place,
      dueDate: draft.dueDate || null,
      memo: draft.memo.trim(),
      completedAt,
      updatedAt: time,
    }));
    setNotice("タスクを更新しました。");
  }

  function moveTask(task: Task, status: TaskStatus) {
    const time = nowIso();
    updateTask(task.id, (current) => ({
      ...current,
      status,
      completedAt: status === "完了" ? time : status === "今日やる" && current.status === "完了" ? null : current.completedAt,
      updatedAt: time,
    }));
  }

  function undoComplete(task: Task) {
    updateTask(task.id, (current) => ({ ...current, status: "今日やる", completedAt: null, updatedAt: nowIso() }));
    setNotice("完了を取り消して、今日やるに戻しました。");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    setSaveBlocked(false);
    setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== deleteTarget.id) }));
    setDeleteTarget(null);
    setNotice("タスクを削除しました。");
  }

  function makeRecurringTask(draft: RecurringDraft): RecurringTask {
    const time = nowIso();
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: draft.title.trim(),
      memo: draft.memo.trim(),
      category: draft.category,
      kind: draft.kind,
      repeatType: draft.repeatType,
      weekday: draft.repeatType === "weekly" ? Number(draft.weekday) as Weekday : null,
      monthDay: draft.repeatType === "monthly" ? Number(draft.monthDay) : null,
      isActive: draft.isActive,
      createdAt: time,
      updatedAt: time,
    };
  }

  function addRecurringTask(draft: RecurringDraft) {
    setSaveBlocked(false);
    setData((current) => ({ ...current, recurringTasks: [makeRecurringTask(draft), ...current.recurringTasks] }));
    setNotice("繰り返しタスクを追加しました。");
    return true;
  }

  function saveRecurringTask(task: RecurringTask, draft: RecurringDraft) {
    const time = nowIso();
    setSaveBlocked(false);
    setData((current) => ({
      ...current,
      recurringTasks: current.recurringTasks.map((item) => item.id === task.id ? {
        ...item,
        title: draft.title.trim(),
        memo: draft.memo.trim(),
        category: draft.category,
        kind: draft.kind,
        repeatType: draft.repeatType,
        weekday: draft.repeatType === "weekly" ? Number(draft.weekday) as Weekday : null,
        monthDay: draft.repeatType === "monthly" ? Number(draft.monthDay) : null,
        isActive: draft.isActive,
        updatedAt: time,
      } : item),
    }));
    setNotice("繰り返しタスクを更新しました。");
  }

  function setRecurringActive(task: RecurringTask, isActive: boolean) {
    setSaveBlocked(false);
    setData((current) => ({
      ...current,
      recurringTasks: current.recurringTasks.map((item) => item.id === task.id ? { ...item, isActive, updatedAt: nowIso() } : item),
    }));
    setNotice(isActive ? "繰り返しタスクを再開しました。" : "繰り返しタスクを停止しました。");
  }

  function completeRecurringTask(item: VisibleRecurringTask) {
    const time = nowIso();
    const completion: RecurringCompletion = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      recurringTaskId: item.task.id,
      targetDate: item.targetDate,
      completedAt: time,
      titleSnapshot: item.task.title,
      categorySnapshot: item.task.category,
      kindSnapshot: item.task.kind,
    };
    setSaveBlocked(false);
    setData((current) => ({ ...current, recurringCompletions: [completion, ...current.recurringCompletions] }));
    setNotice("今回分を完了しました。");
  }

  function confirmRecurringDelete() {
    if (!recurringDeleteTarget) return;
    setSaveBlocked(false);
    setData((current) => ({ ...current, recurringTasks: current.recurringTasks.filter((task) => task.id !== recurringDeleteTarget.id) }));
    setRecurringDeleteTarget(null);
    setNotice("繰り返しタスクを削除しました。");
  }

  function keepText() {
    const lines = [
      `# タスク整理メモ ${todayKey()}`,
      "",
      "## 今日やる",
      ...formatCheckList(todayTasks, false),
      "",
      "## 期限が近い",
      ...formatCheckList(nearDueTasks, false, true),
      "",
      "## 今日完了したこと",
      ...formatCheckList(completedTodayTasks, true),
      "",
      "## 近いうち",
      ...formatCheckList(tasks.filter((task) => task.status === "近いうち").sort(byCreatedDesc), false),
      "",
      "## いつかやる",
      ...formatCheckList(tasks.filter((task) => task.status === "いつかやる").sort(byCreatedDesc), false),
      "",
      "## 連絡待ち",
      ...formatCheckList(tasks.filter((task) => task.status === "連絡待ち").sort(byCreatedDesc), false),
      "",
      "## 保留",
      ...formatCheckList(tasks.filter((task) => task.status === "保留").sort(byCreatedDesc), false),
      "",
      "## 夜のメモ",
      "-",
    ];
    return lines.join("\n");
  }

  function formatCheckList(list: Task[], checked: boolean, withDue = false) {
    if (list.length === 0) return ["- なし"];
    return list.map((task) => `- [${checked ? "x" : " "}] ${task.title}${withDue && task.dueDate ? `（期限：${task.dueDate}）` : ""}`);
  }

  async function copyKeepText() {
    await navigator.clipboard.writeText(keepText());
    setNotice("整理メモをコピーしました。");
  }

  function exportJson() {
    const exported: AppData = { ...data, exportedAt: nowIso() };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `task-manager-backup-${todayKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("JSONをエクスポートしました。");
  }

  function parseImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isAppData(parsed)) throw new Error("Invalid JSON");
        setImportData(normalizeData(parsed));
      } catch {
        setImportError("JSONの形式が不正です。バックアップファイルを確認してください。");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function doImport() {
    if (!importData) return;
    setSaveBlocked(false);
    setData(importData);
    setImportData(null);
    setNotice("JSONから復元しました。");
  }

  function matches(task: Task, pairs: [string, string][]) {
    return pairs.every(([key, value]) => value === "すべて" || task[key as keyof Task] === value);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">思いついたことをその場で置けるタスク台帳</p>
          <h1>ゆるタスク</h1>
        </div>
      </header>
      <nav className="bottom-nav" aria-label="画面切り替え">
        {(["今日", "ストック", "完了", "設定"] as Tab[]).map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </nav>

      {loadError && <div className="message error">{loadError}<button onClick={() => setLoadError("")}>閉じる</button></div>}
      {notice && <div className="message success">{notice}</div>}

      <main>
        {activeTab === "今日" && <TodayView todayTasks={todayTasks} nearDueTasks={nearDueTasks} recurringTodayTasks={recurringTodayTasks} completedTodayTasks={completedTodayTasks} recurringCompletedToday={recurringCompletedToday} waitingContactTasks={waitingContactTasks} addTask={addTask} saveTask={saveTask} moveTask={moveTask} undoComplete={undoComplete} completeRecurringTask={completeRecurringTask} requestDelete={setDeleteTarget} copyKeepText={copyKeepText} />}
        {activeTab === "ストック" && <StockView tasks={stockTasks} filters={filters} setFilters={setFilters} searchQuery={searchQuery} setSearchQuery={setSearchQuery} saveTask={saveTask} moveTask={moveTask} requestDelete={setDeleteTarget} matches={matches} matchesSearch={matchesSearch} />}
        {activeTab === "完了" && <DoneView tasks={doneTasks} filters={filters} setFilters={setFilters} searchQuery={searchQuery} setSearchQuery={setSearchQuery} saveTask={saveTask} undoComplete={undoComplete} requestDelete={setDeleteTarget} matches={matches} matchesSearch={matchesSearch} />}
        {activeTab === "設定" && <SettingsView data={data} exportJson={exportJson} parseImport={parseImport} fileInputRef={fileInputRef} importError={importError} addRecurringTask={addRecurringTask} saveRecurringTask={saveRecurringTask} setRecurringActive={setRecurringActive} requestRecurringDelete={setRecurringDeleteTarget} />}
      </main>

      {deleteTarget && (
        <ConfirmDialog title="このタスクを削除しますか？" body="削除すると元に戻せません。" confirmLabel="削除する" onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {recurringDeleteTarget && (
        <ConfirmDialog title="この繰り返しタスクを削除しますか？" body="登録内容は削除され、今日画面にも表示されなくなります。過去の完了履歴は残ります。" confirmLabel="削除する" onConfirm={confirmRecurringDelete} onCancel={() => setRecurringDeleteTarget(null)} />
      )}
      {importData && (
        <ConfirmDialog title="JSONインポート" body="現在のタスクデータを、選択したJSONファイルの内容で置き換えます。必要なら先に現在のデータをエクスポートしてください。" confirmLabel="インポートする" onConfirm={doImport} onCancel={() => setImportData(null)} />
      )}
    </div>
  );
}

type SharedProps = {
  saveTask: (task: Task, draft: TaskDraft) => void;
  moveTask: (task: Task, status: TaskStatus) => void;
  requestDelete: (task: Task) => void;
  matches: (task: Task, pairs: [string, string][]) => boolean;
  matchesSearch: (task: Task) => boolean;
};

type SearchProps = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
};

function TodayView(props: {
  todayTasks: Task[];
  nearDueTasks: Task[];
  recurringTodayTasks: VisibleRecurringTask[];
  completedTodayTasks: Task[];
  recurringCompletedToday: RecurringCompletion[];
  waitingContactTasks: Task[];
  addTask: (draft: TaskDraft) => boolean;
  saveTask: (task: Task, draft: TaskDraft) => void;
  moveTask: (task: Task, status: TaskStatus) => void;
  requestDelete: (task: Task) => void;
  undoComplete: (task: Task) => void;
  completeRecurringTask: (item: VisibleRecurringTask) => void;
  copyKeepText: () => void;
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ today: true });
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const filteredTodayTasks = props.todayTasks;
  const filteredNearDueTasks = props.nearDueTasks;
  const filteredCompletedTodayTasks = props.completedTodayTasks;
  const filteredRecurringTodayTasks = props.recurringTodayTasks;
  const filteredRecurringCompletedToday = props.recurringCompletedToday;
  const filteredWaitingContactTasks = props.waitingContactTasks;
  function toggleSection(key: string) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }
  function addTaskAndClose(draft: TaskDraft) {
    const added = props.addTask(draft);
    if (added) setIsAddFormOpen(false);
    return added;
  }
  return <div className="view-stack">
    <Section title="今日">
      <div className="today-actions">
        <button className="primary-button add-task-button" type="button" onClick={() => setIsAddFormOpen((current) => !current)} aria-expanded={isAddFormOpen}>{isAddFormOpen ? "▼ 新規タスク" : "＋ 新規タスク"}</button>
        {isAddFormOpen && <div className="today-add-panel">
          <TaskForm initial={newDraft("いつかやる")} submitLabel="タスクを追加" onSubmit={addTaskAndClose} onCancel={() => setIsAddFormOpen(false)} allowDone />
        </div>}
      </div>
    </Section>
    <CollapsibleSection title="今日やる" count={filteredTodayTasks.length} description="今日動きたいものを置きます。あとから状態を変えても大丈夫です。" isOpen={Boolean(openSections.today)} onToggle={() => toggleSection("today")}>
      <TaskList empty="今日やるタスクはありません。必要なら新規タスクから追加できます。" tasks={filteredTodayTasks} actions={(task) => <><Action onClick={() => props.moveTask(task, "完了")}>完了</Action><MoveButtons task={task} moveTask={props.moveTask} hide={["今日やる"]} /><Action subtle onClick={() => props.requestDelete(task)}>削除</Action></>} saveTask={props.saveTask} />
    </CollapsibleSection>
    <CollapsibleSection title="期限が近い" count={filteredNearDueTasks.length} description="責める場所ではなく、そろそろ見ておくものを拾う場所です。" className="due-section" isOpen={Boolean(openSections.nearDue)} onToggle={() => toggleSection("nearDue")}>
      <TaskList empty="期限が近いタスクはありません。" tasks={filteredNearDueTasks} actions={(task) => <><Action onClick={() => props.moveTask(task, "完了")}>完了</Action><Action onClick={() => props.moveTask(task, "今日やる")}>今日やるへ</Action><Action onClick={() => props.moveTask(task, "保留")}>保留へ</Action></>} saveTask={props.saveTask} />
    </CollapsibleSection>
    <CollapsibleSection title="繰り返し" count={filteredRecurringTodayTasks.length} description="毎週・毎月の予定や楽しみを、必要な期間だけここに出します。" isOpen={Boolean(openSections.recurring)} onToggle={() => toggleSection("recurring")}>
      <RecurringTodayList items={filteredRecurringTodayTasks} completeRecurringTask={props.completeRecurringTask} />
    </CollapsibleSection>
    <CollapsibleSection title="今日完了したこと" count={filteredCompletedTodayTasks.length + filteredRecurringCompletedToday.length} description="今日やったことを見えるようにして、日記や振り返りに使います。" isOpen={Boolean(openSections.completedToday)} onToggle={() => toggleSection("completedToday")}>
      {filteredCompletedTodayTasks.length === 0 && filteredRecurringCompletedToday.length === 0 ? <p className="empty-text">今日完了したタスクはまだありません。終わったこともあとから追加できます。</p> : filteredCompletedTodayTasks.length > 0 && <TaskList empty="" tasks={filteredCompletedTodayTasks} actions={(task) => <Action onClick={() => props.undoComplete(task)}>完了を取り消す</Action>} saveTask={props.saveTask} />}
      <RecurringCompletionList completions={filteredRecurringCompletedToday} />
    </CollapsibleSection>
    <CollapsibleSection title="連絡待ち" count={filteredWaitingContactTasks.length} description="相手からの返信や回答を待っているものを、今日やることとは分けて置きます。" className="waiting-section" isOpen={Boolean(openSections.waiting)} onToggle={() => toggleSection("waiting")}>
      <TaskList empty="連絡待ちはありません。" tasks={filteredWaitingContactTasks} actions={(task) => <><Action onClick={() => props.moveTask(task, "完了")}>完了</Action><Action onClick={() => props.moveTask(task, "今日やる")}>今日やるへ</Action><Action onClick={() => props.moveTask(task, "近いうち")}>近いうちへ</Action><Action onClick={() => props.moveTask(task, "保留")}>保留へ</Action><Action subtle onClick={() => props.requestDelete(task)}>削除</Action></>} saveTask={props.saveTask} />
    </CollapsibleSection>
    <Section title="整理メモをコピー" description="今日画面の内容から、あとで見返しやすいMarkdown風テキストを作ります。">
      <button className="primary-button" onClick={props.copyKeepText}>整理メモをコピー</button>
    </Section>
  </div>;
}

function StockView(props: SharedProps & SearchProps & { tasks: Task[]; filters: Record<string, FilterValue>; setFilters: (filters: Record<string, FilterValue>) => void }) {
  const pairs: [string, string][] = [["status", props.filters.stockStatus ?? "すべて"], ["category", props.filters.stockCategory ?? "すべて"], ["type", props.filters.stockType ?? "すべて"], ["place", props.filters.stockPlace ?? "すべて"]];
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ soon: true });
  const visibleTasks = props.tasks.filter((task) => props.matches(task, pairs) && props.matchesSearch(task));
  const stockActions = (task: Task) => <><MoveButtons task={task} moveTask={props.moveTask} /><Action onClick={() => props.moveTask(task, "完了")}>完了</Action><Action subtle onClick={() => props.requestDelete(task)}>削除</Action></>;
  const groups = [
    { key: "soon", title: "近いうち", tasks: visibleTasks.filter((task) => task.status === "近いうち").sort(byDueThenUpdatedDesc) },
    { key: "recent", title: "最近更新", tasks: visibleTasks.filter(isRecentlyUpdatedStockTask).sort(byUpdatedThenCreatedDesc) },
    { key: "someday", title: "いつかやる", tasks: visibleTasks.filter((task) => task.status === "いつかやる").sort(byDueThenUpdatedDesc) },
    { key: "hold", title: "保留", tasks: visibleTasks.filter((task) => task.status === "保留").sort(byDueThenUpdatedDesc) },
    { key: "waiting", title: "連絡待ち", tasks: visibleTasks.filter((task) => task.status === "連絡待ち").sort(byDueThenUpdatedDesc) },
    { key: "other", title: "その他・未整理", tasks: visibleTasks.filter((task) => !["近いうち", "いつかやる", "保留", "連絡待ち"].includes(task.status)).sort(byDueThenUpdatedDesc) },
  ];
  function toggleGroup(key: string) {
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));
  }
  return <div className="view-stack">
    <Section title="ストック" description="あとで拾いたいタスクを置く場所です。" />
    <Section title="絞り込み"><StockFilterPanel searchQuery={props.searchQuery} setSearchQuery={props.setSearchQuery} filters={props.filters} setFilters={props.setFilters} /></Section>
    <div className="stock-groups">
      {groups.map((group) => <CollapsibleSection key={group.key} title={group.title} count={group.tasks.length} isOpen={Boolean(openGroups[group.key])} onToggle={() => toggleGroup(group.key)}>
        <TaskList empty={`${group.title}のタスクはありません。`} tasks={group.tasks} actions={stockActions} saveTask={props.saveTask} />
      </CollapsibleSection>)}
    </div>
  </div>;
}

function StockFilterPanel({ searchQuery, setSearchQuery, filters, setFilters }: SearchProps & { filters: Record<string, FilterValue>; setFilters: (filters: Record<string, FilterValue>) => void }) {
  const filterItems = [
    { label: "状態", keyName: "stockStatus", value: filters.stockStatus ?? "すべて", options: ["近いうち", "いつかやる", "連絡待ち", "保留"] },
    { label: "カテゴリ", keyName: "stockCategory", value: filters.stockCategory ?? "すべて", options: ACTIVE_TASK_CATEGORIES },
    { label: "種類", keyName: "stockType", value: filters.stockType ?? "すべて", options: TASK_TYPES },
    { label: "作業場所", keyName: "stockPlace", value: filters.stockPlace ?? "すべて", options: TASK_PLACES },
  ];
  return <div className="stock-filter-panel">
    <label className="stock-search-row"><span>検索</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="タスクを検索" /></label>
    <div className="stock-filter-grid">
      {filterItems.map((filter) => <Select key={filter.keyName} label={filter.label} value={filter.value} options={["すべて", ...filter.options]} onChange={(value) => setFilters({ ...filters, [filter.keyName]: value })} />)}
    </div>
  </div>;
}

function DoneView(props: Omit<SharedProps, "moveTask"> & SearchProps & { tasks: Task[]; filters: Record<string, FilterValue>; setFilters: (filters: Record<string, FilterValue>) => void; undoComplete: (task: Task) => void }) {
  const pairs: [string, string][] = [["category", props.filters.doneCategory ?? "すべて"], ["type", props.filters.doneType ?? "すべて"]];
  return <div className="view-stack">
    <Section title="完了" description="終わったことを残す場所です。日記や振り返りの材料にできます。" />
    <Section title="絞り込み"><SearchBox value={props.searchQuery} onChange={props.setSearchQuery} /><FilterBar current={props.filters} setFilters={props.setFilters} filters={[{ label: "カテゴリ", keyName: "doneCategory", value: props.filters.doneCategory ?? "すべて", options: ACTIVE_TASK_CATEGORIES }, { label: "種類", keyName: "doneType", value: props.filters.doneType ?? "すべて", options: TASK_TYPES }]} /></Section>
    <Section title="完了一覧"><TaskList empty="完了タスクはまだありません。終わったことを残すと、日記や振り返りに使えます。" tasks={props.tasks.filter((task) => props.matches(task, pairs) && props.matchesSearch(task))} actions={(task) => <><Action onClick={() => props.undoComplete(task)}>完了を取り消す</Action><Action subtle onClick={() => props.requestDelete(task)}>削除</Action></>} saveTask={props.saveTask} /></Section>
  </div>;
}

function RecurringTodayList({ items, completeRecurringTask }: { items: VisibleRecurringTask[]; completeRecurringTask: (item: VisibleRecurringTask) => void }) {
  if (items.length === 0) return <p className="empty-text">表示期間内の繰り返しタスクはありません。</p>;
  return <div className="task-grid">{items.map((item) => <article className="task-card recurring-card" key={`${item.task.id}-${item.targetDate}`}>
    <div className="chips"><span>繰り返し</span><span>{item.task.category}</span><span>{item.task.kind}</span></div>
    <h3>{item.task.title}</h3>
    <div className="task-meta"><span>{recurringInfo(item.task)}</span><span>対象日：{item.targetDate}</span></div>
    {item.task.memo && <p className="task-memo">{item.task.memo}</p>}
    <div className="button-row"><button className="primary-button" type="button" onClick={() => completeRecurringTask(item)}>今回分を完了</button></div>
  </article>)}</div>;
}

function RecurringCompletionList({ completions }: { completions: RecurringCompletion[] }) {
  if (completions.length === 0) return null;
  return <div className="task-grid">{completions.map((completion) => <article className="task-card recurring-card" key={completion.id}>
    <div className="chips"><span>繰り返し</span><span>{completion.categorySnapshot}</span><span>{completion.kindSnapshot}</span></div>
    <h3>{completion.titleSnapshot}</h3>
    <div className="task-meta"><span>対象日：{completion.targetDate}</span><span>完了：{completion.completedAt.slice(0, 10)}</span></div>
  </article>)}</div>;
}

function RecurringTaskManager({ tasks, addRecurringTask, saveRecurringTask, setRecurringActive, requestRecurringDelete }: { tasks: RecurringTask[]; addRecurringTask: (draft: RecurringDraft) => boolean; saveRecurringTask: (task: RecurringTask, draft: RecurringDraft) => void; setRecurringActive: (task: RecurringTask, isActive: boolean) => void; requestRecurringDelete: (task: RecurringTask) => void }) {
  return <div className="recurring-manager">
    <div className="manager-block">
      <h3>繰り返しを追加</h3>
      <RecurringTaskForm initial={newRecurringDraft()} submitLabel="追加する" onSubmit={addRecurringTask} />
    </div>
    <div className="task-grid">
      {tasks.length === 0 ? <p className="empty-text">繰り返しタスクはまだありません。</p> : tasks.map((task) => <RecurringManageCard key={task.id} task={task} saveRecurringTask={saveRecurringTask} setRecurringActive={setRecurringActive} requestRecurringDelete={requestRecurringDelete} />)}
    </div>
  </div>;
}

function RecurringManageCard({ task, saveRecurringTask, setRecurringActive, requestRecurringDelete }: { task: RecurringTask; saveRecurringTask: (task: RecurringTask, draft: RecurringDraft) => void; setRecurringActive: (task: RecurringTask, isActive: boolean) => void; requestRecurringDelete: (task: RecurringTask) => void }) {
  const [editing, setEditing] = useState(false);
  return <article className="task-card recurring-card">
    <div className="chips"><span>{task.isActive ? "有効" : "停止中"}</span><span>{task.category}</span><span>{task.kind}</span></div>
    <h3>{task.title}</h3>
    <div className="task-meta"><span>{recurringInfo(task)}</span><span>{repeatTypeLabel(task.repeatType)}</span></div>
    {task.memo && <p className="task-memo">{task.memo}</p>}
    <div className="button-row">
      {task.isActive ? <Action onClick={() => setRecurringActive(task, false)}>停止</Action> : <Action onClick={() => setRecurringActive(task, true)}>再開</Action>}
      <Action onClick={() => setEditing((current) => !current)}>編集</Action>
      <Action subtle onClick={() => requestRecurringDelete(task)}>削除</Action>
    </div>
    {editing && <RecurringTaskForm initial={draftFromRecurringTask(task)} submitLabel="保存する" onSubmit={(draft) => { saveRecurringTask(task, draft); setEditing(false); return true; }} onCancel={() => setEditing(false)} />}
  </article>;
}

function RecurringTaskForm({ initial, submitLabel, onSubmit, onCancel }: { initial: RecurringDraft; submitLabel: string; onSubmit: (draft: RecurringDraft) => boolean; onCancel?: () => void }) {
  const [draft, setDraft] = useState<RecurringDraft>(initial);
  const [error, setError] = useState("");
  function setField<K extends keyof RecurringDraft>(key: K, value: RecurringDraft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function validate() {
    if (!draft.title.trim()) return "タイトルを入力してください。";
    if (!draft.category) return "カテゴリを選んでください。";
    if (!draft.kind) return "種類を選んでください。";
    if (!draft.repeatType) return "繰り返し種別を選んでください。";
    if (draft.repeatType === "weekly" && draft.weekday === "") return "曜日を選んでください。";
    if (draft.repeatType === "monthly" && draft.monthDay === "") return "日付を選んでください。";
    return "";
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const message = validate();
    if (message) { setError(message); return; }
    if (onSubmit(draft)) {
      setDraft(newRecurringDraft());
      setError("");
    }
  }
  return <form className="task-form recurring-form" onSubmit={submit}>
    <label>タイトル<input value={draft.title} onChange={(event) => setField("title", event.target.value)} placeholder="毎週のアニメ、月次振り返りなど" /></label>
    <div className="form-grid">
      <Select label="カテゴリ" value={draft.category} options={ACTIVE_TASK_CATEGORIES} onChange={(value) => setField("category", value as ActiveTaskCategory)} />
      <Select label="種類" value={draft.kind} options={RECURRING_KINDS} onChange={(value) => setField("kind", value as RecurringKind)} />
      <label>繰り返し種別<select value={draft.repeatType} onChange={(event) => setField("repeatType", event.target.value as RepeatType)}>
        <option value="weekly">毎週</option>
        <option value="monthly">毎月</option>
      </select></label>
      {draft.repeatType === "weekly" ? <label>曜日<select value={draft.weekday} onChange={(event) => setField("weekday", event.target.value)}>
        {WEEKDAYS.map((weekday, index) => <option key={weekday} value={index}>{weekday}</option>)}
      </select></label> : <label>日付<select value={draft.monthDay} onChange={(event) => setField("monthDay", event.target.value)}>
        {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => <option key={day} value={day}>{day}日</option>)}
      </select></label>}
    </div>
    <label>メモ<textarea value={draft.memo} onChange={(event) => setField("memo", event.target.value)} rows={3} /></label>
    <label className="check-label"><input type="checkbox" checked={draft.isActive} onChange={(event) => setField("isActive", event.target.checked)} />有効</label>
    {error && <p className="form-error">{error}</p>}
    <div className="button-row"><button className="primary-button" type="submit">{submitLabel}</button>{onCancel && <button type="button" onClick={onCancel}>キャンセル</button>}</div>
  </form>;
}

function SettingsView({ data, exportJson, parseImport, fileInputRef, importError, addRecurringTask, saveRecurringTask, setRecurringActive, requestRecurringDelete }: { data: AppData; exportJson: () => void; parseImport: (event: ChangeEvent<HTMLInputElement>) => void; fileInputRef: React.MutableRefObject<HTMLInputElement | null>; importError: string; addRecurringTask: (draft: RecurringDraft) => boolean; saveRecurringTask: (task: RecurringTask, draft: RecurringDraft) => void; setRecurringActive: (task: RecurringTask, isActive: boolean) => void; requestRecurringDelete: (task: RecurringTask) => void }) {
  const [recurringOpen, setRecurringOpen] = useState(false);
  return <div className="view-stack">
    <Section title="データ管理" description="バックアップ、別端末への移動、不具合時の復元に使います。">
      <p className="small-note">実運用前や大きく整理する前は、JSONエクスポートでバックアップを残しておくと安心です。</p>
      <div className="button-row"><button className="primary-button" onClick={exportJson}>JSONエクスポート</button><button onClick={() => fileInputRef.current?.click()}>JSONインポート</button></div>
      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={parseImport} />
      {importError && <p className="form-error">{importError}</p>}
    </Section>
    <CollapsibleSection title="繰り返しタスク管理" count={data.recurringTasks.length} description="毎週・毎月の予定や楽しみを、必要な期間だけ今日画面に出すための固定メニューです。" isOpen={recurringOpen} onToggle={() => setRecurringOpen((current) => !current)}>
      <RecurringTaskManager tasks={data.recurringTasks} addRecurringTask={addRecurringTask} saveRecurringTask={saveRecurringTask} setRecurringActive={setRecurringActive} requestRecurringDelete={requestRecurringDelete} />
    </CollapsibleSection>
    <Section title="整理メモコピーの説明"><p>今日画面の内容から、見返しやすいMarkdown風テキストを作ります。日中の確認や、夜の日記材料に使えます。</p></Section>
    <Section title="固定リスト" description="現在の新規作成・編集で使うカテゴリです。既存タスクに過去のカテゴリが残っていても、表示は維持されます。"><div className="fixed-grid"><FixedList title="種類" items={TASK_TYPES} /><FixedList title="状態" items={TASK_STATUSES} /><FixedList title="カテゴリ" items={ACTIVE_TASK_CATEGORIES} /><FixedList title="作業場所" items={TASK_PLACES} /></div></Section>
    <Section title="保存方式の説明"><p>初期版はブラウザのlocalStorageに自動保存します。タスク追加、編集、削除、状態変更、JSONインポートのあと保存ボタンなしで保存されます。</p></Section>
  </div>;
}

function Section({ title, description, children, className = "" }: { title: string; description?: string; children?: React.ReactNode; className?: string }) {
  return <section className={`section ${className}`.trim()}><div className="section-head"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

function CollapsibleSection({ title, count, description, children, className = "", isOpen, onToggle }: { title: string; count: number; description?: string; children: React.ReactNode; className?: string; isOpen: boolean; onToggle: () => void }) {
  return <section className={`section collapsible-section ${className}`.trim()}>
    <button className="collapse-trigger" type="button" onClick={onToggle} aria-expanded={isOpen}>
      <span className="collapse-title"><span aria-hidden="true">{isOpen ? "▼" : "▶"}</span>{title}<span className="collapse-count">{count}件</span></span>
    </button>
    {isOpen && <div className="collapsible-body">{description && <p className="collapse-description">{description}</p>}{children}</div>}
  </section>;
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="search-box">検索<input value={value} onChange={(event) => onChange(event.target.value)} placeholder="タスクを検索" /></label>;
}

function TaskList({ tasks, empty, actions, saveTask }: { tasks: Task[]; empty: string; actions: (task: Task) => React.ReactNode; saveTask: (task: Task, draft: TaskDraft) => void }) {
  if (tasks.length === 0) return <p className="empty-text">{empty}</p>;
  return <div className="task-grid">{tasks.map((task) => <TaskCard key={task.id} task={task} saveTask={saveTask} actions={actions(task)} />)}</div>;
}

function TaskCard({ task, actions, saveTask }: { task: Task; actions: React.ReactNode; saveTask: (task: Task, draft: TaskDraft) => void }) {
  const [editing, setEditing] = useState(false);
  return <article className="task-card">
    {editing ? <TaskForm initial={draftFromTask(task)} submitLabel="保存" onSubmit={(draft) => { if (!draft.title.trim()) return false; saveTask(task, draft); setEditing(false); return true; }} onCancel={() => setEditing(false)} allowDone completedAt={task.completedAt} /> : <>
      <div className="chips"><span>{task.type}</span><span>{task.category}</span><span>{task.status}</span></div>
      <h3>{task.title}</h3>
      <div className="task-meta">{task.dueDate && <span>期限：{task.dueDate}（{dueLabel(task.dueDate)}）</span>}<span>場所：{task.place}</span></div>
      {task.memo && <p className="task-memo">{task.memo}</p>}
      {task.completedAt && <p className="small-note">完了：{task.completedAt.slice(0, 10)}</p>}
      <div className="button-row">{actions}<Action onClick={() => setEditing(true)}>編集</Action></div>
    </>}
  </article>;
}

function TaskForm({ initial, submitLabel, onSubmit, onCancel, allowDone = false, completedAt }: { initial: TaskDraft; submitLabel: string; onSubmit: (draft: TaskDraft) => boolean; onCancel?: () => void; allowDone?: boolean; completedAt?: string | null }) {
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [error, setError] = useState("");
  function setField<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) { setError("タイトルを入力してください。"); return; }
    if (onSubmit(draft)) setDraft({ ...initial, title: "", memo: "", dueDate: "" });
  }
  return <form className="task-form" onSubmit={submit}>
    <label>タイトル<input value={draft.title} onChange={(event) => setField("title", event.target.value)} placeholder="タイトルだけでも追加できます" /></label>
    <div className="form-grid"><Select label="種類" value={draft.type} options={TASK_TYPES} onChange={(value) => setField("type", value as TaskType)} /><Select label="状態" value={draft.status} options={allowDone ? TASK_STATUSES : TASK_STATUSES.filter((status) => status !== "完了")} onChange={(value) => setField("status", value as TaskStatus)} /><CategorySelect value={draft.category} onChange={(value) => setField("category", value)} /><Select label="作業場所" value={draft.place} options={TASK_PLACES} onChange={(value) => setField("place", value as TaskPlace)} /></div>
    <label>期限<input type="date" value={draft.dueDate} onChange={(event) => setField("dueDate", event.target.value)} /></label>
    <label>メモ<textarea value={draft.memo} onChange={(event) => setField("memo", event.target.value)} rows={3} /></label>
    {completedAt && <p className="small-note">完了日は自動設定です：{completedAt.slice(0, 10)}</p>}
    {error && <p className="form-error">{error}</p>}
    <div className="button-row"><button className="primary-button" type="submit">{submitLabel}</button>{onCancel && <button type="button" onClick={onCancel}>キャンセル</button>}</div>
  </form>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function CategorySelect({ value, onChange }: { value: TaskCategory; onChange: (value: TaskCategory) => void }) {
  const isActive = (ACTIVE_TASK_CATEGORIES as readonly TaskCategory[]).includes(value);
  return <label>カテゴリ<select value={isActive ? value : ""} onChange={(event) => onChange(event.target.value as TaskCategory)}>
    {!isActive && <option value="" disabled>過去カテゴリを維持</option>}
    {ACTIVE_TASK_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
  </select>{!isActive && <span className="legacy-note">現在の保存カテゴリ：{value}</span>}</label>;
}

function FilterBar({ filters, current, setFilters }: { filters: { label: string; keyName: string; value: FilterValue; options: readonly string[] }[]; current: Record<string, FilterValue>; setFilters: (filters: Record<string, FilterValue>) => void }) {
  return <div className="filter-bar">{filters.map((filter) => <Select key={filter.keyName} label={filter.label} value={filter.value} options={["すべて", ...filter.options]} onChange={(value) => setFilters({ ...current, [filter.keyName]: value })} />)}</div>;
}

function MoveButtons({ task, moveTask, hide = [] }: { task: Task; moveTask: (task: Task, status: TaskStatus) => void; hide?: TaskStatus[] }) {
  return <>{(["今日やる", "近いうち", "いつかやる", "連絡待ち", "保留"] as TaskStatus[]).filter((status) => status !== task.status && !hide.includes(status)).map((status) => <Action key={status} onClick={() => moveTask(task, status)}>{status === "いつかやる" ? "いつかへ" : `${status}へ`}</Action>)}</>;
}

function Action({ children, onClick, subtle = false }: { children: React.ReactNode; onClick: () => void; subtle?: boolean }) {
  return <button className={subtle ? "subtle-button" : ""} type="button" onClick={onClick}>{children}</button>;
}

function FixedList({ title, items }: { title: string; items: readonly string[] }) {
  return <div><h3>{title}</h3><div className="chips">{items.map((item) => <span key={item}>{item}</span>)}</div></div>;
}

function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">{title}</h2><p>{body}</p><div className="button-row"><button className="danger-button" onClick={onConfirm}>{confirmLabel}</button><button onClick={onCancel}>キャンセル</button></div></div></div>;
}

export default App;

