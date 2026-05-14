import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "yuki-task-manager-data";

type TaskType = "やるべきこと" | "やりたいこと" | "思いつき";
type TaskStatus = "今日やる" | "近いうち" | "いつかやる" | "連絡待ち" | "保留" | "完了";
type TaskCategory = "生活" | "開発" | "Codex" | "就活" | "仕事" | "副業" | "お金" | "SNS" | "日記" | "片付け" | "人間関係" | "趣味" | "手続き";
type TaskPlace = "PC" | "スマホ" | "家" | "外" | "Codexに頼む" | "未設定";

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
  settings: {
    categories: TaskCategory[];
    types: TaskType[];
    statuses: TaskStatus[];
    places: TaskPlace[];
  };
};

type Tab = "今日" | "ストック" | "完了" | "設定";
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

const TASK_TYPES: TaskType[] = ["やるべきこと", "やりたいこと", "思いつき"];
const TASK_STATUSES: TaskStatus[] = ["今日やる", "近いうち", "いつかやる", "連絡待ち", "保留", "完了"];
const TASK_CATEGORIES: TaskCategory[] = ["生活", "開発", "Codex", "就活", "仕事", "副業", "お金", "SNS", "日記", "片付け", "人間関係", "趣味", "手続き"];
const ACTIVE_TASK_CATEGORIES: TaskCategory[] = TASK_CATEGORIES.filter((category) => category !== "就活");
const TASK_PLACES: TaskPlace[] = ["PC", "スマホ", "家", "外", "Codexに頼む", "未設定"];

const emptyData = (): AppData => ({
  version: 1,
  tasks: [],
  settings: {
    categories: TASK_CATEGORIES,
    types: TASK_TYPES,
    statuses: TASK_STATUSES,
    places: TASK_PLACES,
  },
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
const todayKey = () => toDateKey(new Date().toISOString());
const nowIso = () => new Date().toISOString();
const byCreatedDesc = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);
const byCompletedDesc = (a: Task, b: Task) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "");

function isOneOf<T extends string>(value: unknown, list: readonly T[]): value is T {
  return typeof value === "string" && list.includes(value as T);
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<Task>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    isOneOf(task.type, TASK_TYPES) &&
    isOneOf(task.status, TASK_STATUSES) &&
    isOneOf(task.category, TASK_CATEGORIES) &&
    typeof task.memo === "string" &&
    isOneOf(task.place, TASK_PLACES) &&
    (typeof task.dueDate === "string" || task.dueDate === null) &&
    typeof task.createdAt === "string" &&
    typeof task.updatedAt === "string" &&
    (typeof task.completedAt === "string" || task.completedAt === null)
  );
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppData>;
  return typeof data.version === "number" && Array.isArray(data.tasks) && data.tasks.every(isTask);
}

function normalizeData(data: AppData): AppData {
  return {
    ...emptyData(),
    ...data,
    version: 1,
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
  const [data, setData] = useState<AppData>(loaded.data);
  const [activeTab, setActiveTab] = useState<Tab>("今日");
  const [loadError, setLoadError] = useState(loaded.error);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
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
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const tasks = data.tasks;
  const todayTasks = tasks.filter((task) => task.status === "今日やる").sort(byCreatedDesc);
  const nearDueTasks = tasks.filter((task) => isNearDue(task) && task.status !== "連絡待ち").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const completedTodayTasks = tasks.filter((task) => task.status === "完了" && toDateKey(task.completedAt) === todayKey()).sort(byCompletedDesc);
  const waitingContactTasks = tasks.filter((task) => task.status === "連絡待ち" && !task.completedAt).sort(byCreatedDesc);
  const stockTasks = tasks.filter((task) => ["近いうち", "いつかやる", "連絡待ち", "保留"].includes(task.status)).sort(byCreatedDesc);
  const doneTasks = tasks.filter((task) => task.status === "完了").sort(byCompletedDesc);
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
    setNotice("Keep用テキストをコピーしました。");
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
          <p className="eyebrow">夜にKeepメモを回収するタスク台帳</p>
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
        {activeTab === "今日" && <TodayView tasks={tasks} todayTasks={todayTasks} nearDueTasks={nearDueTasks} completedTodayTasks={completedTodayTasks} waitingContactTasks={waitingContactTasks} filters={filters} setFilters={setFilters} searchQuery={searchQuery} setSearchQuery={setSearchQuery} addTask={addTask} saveTask={saveTask} moveTask={moveTask} undoComplete={undoComplete} requestDelete={setDeleteTarget} copyKeepText={copyKeepText} matches={matches} matchesSearch={matchesSearch} />}
        {activeTab === "ストック" && <StockView tasks={stockTasks} filters={filters} setFilters={setFilters} searchQuery={searchQuery} setSearchQuery={setSearchQuery} addTask={addTask} saveTask={saveTask} moveTask={moveTask} requestDelete={setDeleteTarget} matches={matches} matchesSearch={matchesSearch} />}
        {activeTab === "完了" && <DoneView tasks={doneTasks} filters={filters} setFilters={setFilters} searchQuery={searchQuery} setSearchQuery={setSearchQuery} saveTask={saveTask} undoComplete={undoComplete} requestDelete={setDeleteTarget} matches={matches} matchesSearch={matchesSearch} />}
        {activeTab === "設定" && <SettingsView data={data} exportJson={exportJson} parseImport={parseImport} fileInputRef={fileInputRef} importError={importError} />}
      </main>

      {deleteTarget && (
        <ConfirmDialog title="このタスクを削除しますか？" body="削除すると元に戻せません。" confirmLabel="削除する" onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
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

function TodayView(props: SharedProps & {
  tasks: Task[];
  todayTasks: Task[];
  nearDueTasks: Task[];
  completedTodayTasks: Task[];
  waitingContactTasks: Task[];
  filters: Record<string, FilterValue>;
  setFilters: (filters: Record<string, FilterValue>) => void;
  addTask: (draft: TaskDraft) => boolean;
  undoComplete: (task: Task) => void;
  copyKeepText: () => void;
} & SearchProps) {
  const { filters, setFilters, matches, matchesSearch } = props;
  const todayFilterPairs: [string, string][] = [["category", filters.todayCategory ?? "すべて"], ["type", filters.todayType ?? "すべて"]];
  const filteredWaitingContactTasks = props.waitingContactTasks.filter((task) => matches(task, todayFilterPairs) && matchesSearch(task));
  return <div className="view-stack">
    <Section title="今日" description="今日は、今日やることを確認しつつ、夜にKeepメモを回収する場所です。">
      <SearchBox value={props.searchQuery} onChange={props.setSearchQuery} />
      <FilterBar filters={[{ label: "カテゴリ", value: filters.todayCategory ?? "すべて", keyName: "todayCategory", options: ACTIVE_TASK_CATEGORIES }, { label: "種類", value: filters.todayType ?? "すべて", keyName: "todayType", options: TASK_TYPES }]} setFilters={setFilters} current={filters} />
    </Section>
    <Section title="今日やる" description="夜に「明日見たい」と思ったものも、初期版ではここに置きます。">
      <TaskList empty="今日やるタスクはありません。必要ならKeepメモから追加できます。" tasks={props.todayTasks.filter((task) => matches(task, todayFilterPairs) && matchesSearch(task))} actions={(task) => <><Action onClick={() => props.moveTask(task, "完了")}>完了</Action><MoveButtons task={task} moveTask={props.moveTask} hide={["今日やる"]} /><Action subtle onClick={() => props.requestDelete(task)}>削除</Action></>} saveTask={props.saveTask} />
    </Section>
    <Section title="期限が近い" description="責める場所ではなく、そろそろ見ておくものを拾う場所です。" className="due-section">
      <TaskList empty="期限が近いタスクはありません。" tasks={props.nearDueTasks.filter((task) => matches(task, todayFilterPairs) && matchesSearch(task))} actions={(task) => <><Action onClick={() => props.moveTask(task, "完了")}>完了</Action><Action onClick={() => props.moveTask(task, "今日やる")}>今日やるへ</Action><Action onClick={() => props.moveTask(task, "保留")}>保留へ</Action></>} saveTask={props.saveTask} />
    </Section>
    <Section title="今日完了したこと" description="今日やったことを見えるようにして、日記や振り返りに使います。">
      <TaskList empty="今日完了したタスクはまだありません。夜にKeepメモを見ながら追加してもOKです。" tasks={props.completedTodayTasks.filter((task) => matches(task, todayFilterPairs) && matchesSearch(task))} actions={(task) => <Action onClick={() => props.undoComplete(task)}>完了を取り消す</Action>} saveTask={props.saveTask} />
    </Section>
    <Section title={`連絡待ち（${filteredWaitingContactTasks.length}件）`} description="相手からの返信や回答を待っているものを、今日やることとは分けて置きます。" className="waiting-section">
      <TaskList empty="連絡待ちはありません。" tasks={filteredWaitingContactTasks} actions={(task) => <><Action onClick={() => props.moveTask(task, "完了")}>完了</Action><Action onClick={() => props.moveTask(task, "今日やる")}>今日やるへ</Action><Action onClick={() => props.moveTask(task, "近いうち")}>近いうちへ</Action><Action onClick={() => props.moveTask(task, "保留")}>保留へ</Action><Action subtle onClick={() => props.requestDelete(task)}>削除</Action></>} saveTask={props.saveTask} />
    </Section>
    <Section title="Keepから追加" description="日中にGoogle Keepへ書いた思いつき、完了、やることを夜に登録します。">
      <TaskForm initial={newDraft("いつかやる")} submitLabel="Keepメモから追加" onSubmit={props.addTask} allowDone />
    </Section>
    <Section title="Keep用コピー" description="Google Keepに貼って、スマホで見返すためのMarkdown風テキストを作ります。">
      <button className="primary-button" onClick={props.copyKeepText}>Keep用テキストをコピー</button>
    </Section>
  </div>;
}

function StockView(props: SharedProps & SearchProps & { tasks: Task[]; filters: Record<string, FilterValue>; setFilters: (filters: Record<string, FilterValue>) => void; addTask: (draft: TaskDraft) => boolean }) {
  const pairs: [string, string][] = [["status", props.filters.stockStatus ?? "すべて"], ["category", props.filters.stockCategory ?? "すべて"], ["type", props.filters.stockType ?? "すべて"], ["place", props.filters.stockPlace ?? "すべて"]];
  return <div className="view-stack">
    <Section title="ストック" description="今すぐではないタスクや思いつきを置く場所です。" />
    <Section title="ストックに追加"><TaskForm initial={newDraft("いつかやる")} submitLabel="ストックに追加" onSubmit={props.addTask} allowDone /></Section>
    <Section title="絞り込み"><SearchBox value={props.searchQuery} onChange={props.setSearchQuery} /><FilterBar current={props.filters} setFilters={props.setFilters} filters={[{ label: "状態", keyName: "stockStatus", value: props.filters.stockStatus ?? "すべて", options: ["近いうち", "いつかやる", "連絡待ち", "保留"] }, { label: "カテゴリ", keyName: "stockCategory", value: props.filters.stockCategory ?? "すべて", options: ACTIVE_TASK_CATEGORIES }, { label: "種類", keyName: "stockType", value: props.filters.stockType ?? "すべて", options: TASK_TYPES }, { label: "作業場所", keyName: "stockPlace", value: props.filters.stockPlace ?? "すべて", options: TASK_PLACES }]} /></Section>
    <Section title="ストック一覧"><TaskList empty="ストックはまだ空です。あとでやりたいことや思いつきを置けます。" tasks={props.tasks.filter((task) => props.matches(task, pairs) && props.matchesSearch(task))} actions={(task) => <><MoveButtons task={task} moveTask={props.moveTask} /><Action onClick={() => props.moveTask(task, "完了")}>完了</Action><Action subtle onClick={() => props.requestDelete(task)}>削除</Action></>} saveTask={props.saveTask} /></Section>
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

function SettingsView({ data, exportJson, parseImport, fileInputRef, importError }: { data: AppData; exportJson: () => void; parseImport: (event: ChangeEvent<HTMLInputElement>) => void; fileInputRef: React.MutableRefObject<HTMLInputElement | null>; importError: string }) {
  return <div className="view-stack">
    <Section title="データ管理" description="バックアップ、別端末への移動、不具合時の復元に使います。">
      <p className="small-note">実運用前や大きく整理する前は、JSONエクスポートでバックアップを残しておくと安心です。</p>
      <div className="button-row"><button className="primary-button" onClick={exportJson}>JSONエクスポート</button><button onClick={() => fileInputRef.current?.click()}>JSONインポート</button></div>
      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={parseImport} />
      {importError && <p className="form-error">{importError}</p>}
    </Section>
    <Section title="Keep用コピーの説明"><p>今日画面の内容から、Google Keepに貼りやすいMarkdown風テキストを作ります。スマホでの日中チェックや、夜の日記材料に使えます。</p></Section>
    <Section title="固定リスト"><div className="fixed-grid"><FixedList title="種類" items={data.settings.types} /><FixedList title="状態" items={data.settings.statuses} /><FixedList title="カテゴリ" items={data.settings.categories} /><FixedList title="作業場所" items={data.settings.places} /></div></Section>
    <Section title="保存方式の説明"><p>初期版はブラウザのlocalStorageに自動保存します。タスク追加、編集、削除、状態変更、JSONインポートのあと保存ボタンなしで保存されます。</p></Section>
  </div>;
}

function Section({ title, description, children, className = "" }: { title: string; description?: string; children?: React.ReactNode; className?: string }) {
  return <section className={`section ${className}`.trim()}><div className="section-head"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
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
  const isActive = ACTIVE_TASK_CATEGORIES.includes(value);
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

