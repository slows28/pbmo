"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================
   Types
========================= */
type Category = "운동" | "공부" | "기타";
type TabKey = "actions" | "stats" | "journal";
type ThemeKey = "dark" | "light";

type ActionTemplate = {
  id: string;
  name: string;
  category: Category;
  start_time?: string | null;
  end_time?: string | null;
  default_time?: string | null; // backward-compat
};

type WeekStat = { days: number; total: number };
type WeekStats = Record<Category, WeekStat>;

/* =========================
   Constants
========================= */
const API_TOKEN = process.env.NEXT_PUBLIC_PBMO_API_TOKEN || "";

const LAST_DATE_KEY = "pbmo_last_date";
const LAST_TAB_KEY = "pbmo_last_tab";
const LAST_THEME_KEY = "pbmo_theme";

/* =========================
   Utils
========================= */
function cn(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clampTime(t?: string | null): string {
  if (!t) return "09:00";
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  let hh = Math.min(23, Math.max(0, Number(m[1])));
  let mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function ensureCategory(v: any): Category {
  return v === "운동" || v === "공부" || v === "기타" ? v : "기타";
}

function timeRangeParts(t: ActionTemplate) {
  const s = clampTime(t.start_time ?? t.default_time ?? "09:00");
  const e = clampTime(t.end_time ?? "10:00");
  return { s, e, label: `${s}–${e}` };
}

/* =========================
   Component
========================= */
export default function Home() {
  /* ===== Hydration Safe Boot ===== */
  const [mounted, setMounted] = useState(false);

  // SSR 안전 기본값(서버/클라 첫 렌더 동일해야 함)
  const [theme, setTheme] = useState<ThemeKey>("dark");
  const [tab, setTab] = useState<TabKey>("actions");
  const [dateKey, setDateKey] = useState<string>(todayKey());

  /* ===== App State ===== */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<ActionTemplate[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const [weekRange, setWeekRange] = useState<{ weekStart: string; weekEnd: string } | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);

  // Add template inputs
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("10:00");
  const [newCategory, setNewCategory] = useState<Category>("기타");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("09:00");
  const [editEnd, setEditEnd] = useState("10:00");
  const [editCategory, setEditCategory] = useState<Category>("기타");

  // Journal
  const journalKey = useMemo(() => `pbmo_journal_${dateKey}`, [dateKey]);
  const [journal, setJournal] = useState("");

  /* ===== Boot: localStorage 반영은 클라에서만 ===== */
  useEffect(() => {
    const savedTheme = (localStorage.getItem(LAST_THEME_KEY) as ThemeKey) || "dark";
    const savedTab = (localStorage.getItem(LAST_TAB_KEY) as TabKey) || "actions";
    const savedDate = localStorage.getItem(LAST_DATE_KEY) || todayKey();

    setTheme(savedTheme);
    setTab(savedTab);
    setDateKey(savedDate);

    setMounted(true);
  }, []);

  /* ===== Persist ===== */
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(LAST_THEME_KEY, theme);
  }, [theme, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(LAST_TAB_KEY, tab);
  }, [tab, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(LAST_DATE_KEY, dateKey);
  }, [dateKey, mounted]);

  useEffect(() => {
    const saved = localStorage.getItem(journalKey);
    setJournal(saved || "");
  }, [journalKey]);

  useEffect(() => {
    localStorage.setItem(journalKey, journal);
  }, [journal, journalKey]);

  /* ===== API helpers ===== */
  async function fetchText(url: string, init?: RequestInit) {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init?.headers || {}),
        "x-pbmo-token": API_TOKEN,
      },
    });

    const text = await res.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`응답이 JSON이 아닙니다. url=${url} status=${res.status}`);
    }

    if (!res.ok || !json?.ok) throw new Error(json?.error || `API 실패: ${url}`);
    return json;
  }

  async function loadTemplates() {
    const json = await fetchText("/api/action-templates");
    setTemplates(json.data || []);
  }

  async function loadDoneIds(target: string) {
    const json = await fetchText(`/api/action-logs?dateKey=${encodeURIComponent(target)}`);
    const ids = new Set<string>((json.data || []).map((r: any) => r.action_id));
    setDoneIds(ids);
  }

  async function loadWeekStats(target: string) {
    const json = await fetchText(`/api/week-stats?dateKey=${encodeURIComponent(target)}`);
    setWeekRange({ weekStart: json.weekStart, weekEnd: json.weekEnd });

    const data = json.data || {};
    setWeekStats({
      운동: data["운동"] || { days: 0, total: 7 },
      공부: data["공부"] || { days: 0, total: 7 },
      기타: data["기타"] || { days: 0, total: 7 },
    });
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadTemplates(), loadDoneIds(dateKey), loadWeekStats(dateKey)]);
    } catch (e: any) {
      setError(e?.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  /* ===== Actions ===== */
  function beginEdit(t: ActionTemplate) {
    setEditingId(t.id);
    setEditName(t.name || "");
    setEditCategory(ensureCategory(t.category));
    setEditStart(clampTime(t.start_time ?? t.default_time ?? "09:00"));
    setEditEnd(clampTime(t.end_time ?? "10:00"));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) return;

    setLoading(true);
    setError(null);

    const prev = templates;
    setTemplates((cur) =>
      cur.map((x) =>
        x.id === id
          ? {
              ...x,
              name,
              category: editCategory,
              start_time: clampTime(editStart),
              end_time: clampTime(editEnd),
            }
          : x
      )
    );

    try {
      await fetchText("/api/action-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          category: editCategory,
          start_time: clampTime(editStart),
          end_time: clampTime(editEnd),
        }),
      });

      setEditingId(null);
      await loadTemplates();
    } catch (e: any) {
      setTemplates(prev);
      setError(e?.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function addTemplate() {
    const name = newName.trim();
    if (!name) return;

    setLoading(true);
    setError(null);
    try {
      const id = crypto.randomUUID();

      await fetchText("/api/action-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          category: newCategory,
          start_time: clampTime(newStart),
          end_time: clampTime(newEnd),
        }),
      });

      setNewName("");
      await loadTemplates();
    } catch (e: any) {
      setError(e?.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTemplate(id: string) {
    const ok = confirm("이 행동을 삭제할까요? (관련 로그도 함께 정리됩니다)");
    if (!ok) return;

    setLoading(true);
    setError(null);
    try {
      await fetchText("/api/action-templates", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (editingId === id) setEditingId(null);
      await Promise.all([loadTemplates(), loadDoneIds(dateKey), loadWeekStats(dateKey)]);
    } catch (e: any) {
      setError(e?.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleDone(actionId: string) {
    const nextDone = !doneIds.has(actionId);

    setDoneIds((prev) => {
      const copy = new Set(prev);
      if (nextDone) copy.add(actionId);
      else copy.delete(actionId);
      return copy;
    });

    try {
      await fetchText("/api/action-logs", {
        method: nextDone ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, dateKey }),
      });
      await loadWeekStats(dateKey);
    } catch (e: any) {
      setDoneIds((prev) => {
        const copy = new Set(prev);
        if (nextDone) copy.delete(actionId);
        else copy.add(actionId);
        return copy;
      });
      setError(e?.message || "체크 저장 실패");
    }
  }

  /* ===== Derived ===== */
  const sortedTemplates = useMemo(() => {
    const copy = [...templates];
    copy.sort((a, b) => {
      const aDone = doneIds.has(a.id);
      const bDone = doneIds.has(b.id);
      if (aDone !== bDone) return aDone ? 1 : -1;
      const at = clampTime(a.start_time ?? a.default_time ?? "09:00");
      const bt = clampTime(b.start_time ?? b.default_time ?? "09:00");
      return at.localeCompare(bt);
    });
    return copy;
  }, [templates, doneIds]);

  const palette = useMemo(() => {
    if (theme === "light") {
      return {
        bg: "bg-zinc-50 text-zinc-950",
        top: "border-b border-zinc-200/80 bg-white/80",
        card: "bg-white ring-1 ring-zinc-200/70 shadow-[0_10px_30px_rgba(0,0,0,0.06)]",
        subcard: "bg-zinc-50 ring-1 ring-zinc-200/70",
        textDim: "text-zinc-800",
        textSub: "text-zinc-500",
        btn: "bg-zinc-900 text-white hover:bg-zinc-800",
        btnSoft: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 ring-1 ring-zinc-200",
        danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
        input: "border border-zinc-200 bg-zinc-50 focus:border-zinc-300",
        chip: "bg-zinc-900/5 ring-1 ring-zinc-200 text-zinc-800",
        glow: "bg-gradient-to-r from-zinc-900/5 via-transparent to-zinc-900/5",
      };
    }
    return {
      bg: "bg-zinc-950 text-zinc-100",
      top: "border-b border-white/10 bg-zinc-950/70",
      card: "bg-white/[0.06] ring-1 ring-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
      subcard: "bg-white/[0.05] ring-1 ring-white/10",
      textDim: "text-white/85",
      textSub: "text-white/45",
      btn: "bg-white/10 text-white hover:bg-white/15 ring-1 ring-white/10",
      btnSoft: "bg-white/5 text-white/70 hover:text-white ring-1 ring-white/10",
      danger: "bg-red-500/10 text-red-200 ring-1 ring-red-400/20",
      input: "border border-white/10 bg-white/5 focus:border-white/20",
      chip: "bg-white/5 ring-1 ring-white/10 text-white/85",
      glow: "bg-gradient-to-r from-white/10 via-transparent to-white/10",
    };
  }, [theme]);

  function categoryBadge(cat: Category) {
    if (theme === "light") {
      const cls =
        cat === "운동"
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : cat === "공부"
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
      return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{cat}</span>;
    }
    const cls =
      cat === "운동"
        ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20"
        : cat === "공부"
        ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/20"
        : "bg-zinc-500/15 text-zinc-200 ring-1 ring-zinc-400/15";
    return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{cat}</span>;
  }

  function TabButton({ k, label }: { k: TabKey; label: string }) {
    const active = tab === k;
    return (
      <button
        onClick={() => setTab(k)}
        className={cn(
          "rounded-2xl px-3 py-2 text-[13px] font-semibold transition",
          active ? palette.btn : palette.btnSoft
        )}
      >
        {label}
      </button>
    );
  }

  /* =========================
     Render
     - ✅ hooks는 모두 위에서 호출됨
     - ✅ mounted 가드를 쓰더라도 "return 직전"에만 사용 가능
  ========================= */

  // mounted 이전에는 화면 깜빡임을 줄이기 위해 최소 UI만 보여주고 싶으면 여기서 처리 가능
  // (그러나 hooks 규칙 위반은 절대 아님)
  if (!mounted) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-[760px] px-4 py-6 opacity-60 text-sm">로딩중…</div>
      </main>
    );
  }

  return (
    <main className={cn("min-h-screen", palette.bg)}>
      {/* Top */}
      <div className={cn("sticky top-0 z-20 backdrop-blur", palette.top)}>
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-4 py-3">
          <div className="relative">
            <div className={cn("absolute -inset-2 rounded-2xl blur-xl opacity-60", palette.glow)} />
            <div className="relative">
              <div className="text-[11px] uppercase tracking-[0.22em] opacity-60">Action Optimization</div>
              <h1 className="text-[18px] font-semibold tracking-tight">행동 최적화 툴</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className={cn("rounded-2xl px-3 py-2 text-[13px] font-semibold transition", palette.btnSoft)}
              title="테마 전환"
            >
              {theme === "dark" ? "라이트" : "다크"}
            </button>

            <button
              onClick={refreshAll}
              disabled={loading}
              className={cn("rounded-2xl px-3 py-2 text-[13px] font-semibold transition disabled:opacity-50", palette.btn)}
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[760px] px-4 pb-3">
          <div className="flex gap-2">
            <TabButton k="actions" label="행동" />
            <TabButton k="stats" label="통계" />
            <TabButton k="journal" label="일기" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[760px] px-4 pb-16 pt-4">
        {/* Date / Error */}
        <section className={cn("rounded-3xl p-3", palette.card)}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("rounded-2xl px-3 py-2", palette.subcard)}>
                <div className={cn("text-[11px]", palette.textSub)}>날짜</div>
                <input
                  type="date"
                  value={dateKey}
                  onChange={(e) => setDateKey(e.target.value)}
                  className="mt-0.5 bg-transparent text-[14px] font-medium outline-none"
                />
              </div>

              {weekRange ? (
                <div className={cn("hidden sm:block text-[12px]", palette.textSub)}>
                  {weekRange.weekStart} ~ {weekRange.weekEnd}
                </div>
              ) : null}

              {loading ? <div className={cn("text-[12px]", palette.textSub)}>불러오는 중…</div> : null}
            </div>
          </div>

          {error ? <div className={cn("mt-3 rounded-2xl px-3 py-2 text-[13px]", palette.danger)}>{error}</div> : null}
        </section>

        {/* TAB: ACTIONS */}
        {tab === "actions" ? (
          <>
            {/* Add */}
            <section className={cn("mt-4 rounded-3xl p-3", palette.card)}>
              <div className={cn("text-[13px] font-semibold", palette.textDim)}>행동 추가</div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_140px_140px_88px] sm:items-center">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="예: 스트레칭 5분"
                  className={cn("w-full rounded-2xl px-4 py-2.5 text-[14px] outline-none", palette.input)}
                />

                <div className={cn("rounded-2xl px-3 py-2.5", palette.subcard)}>
                  <div className={cn("text-[11px]", palette.textSub)}>시작</div>
                  <input
                    type="time"
                    value={newStart}
                    onChange={(e) => setNewStart(clampTime(e.target.value))}
                    className="mt-0.5 w-full bg-transparent text-[14px] font-medium outline-none"
                  />
                </div>

                <div className={cn("rounded-2xl px-3 py-2.5", palette.subcard)}>
                  <div className={cn("text-[11px]", palette.textSub)}>종료</div>
                  <input
                    type="time"
                    value={newEnd}
                    onChange={(e) => setNewEnd(clampTime(e.target.value))}
                    className="mt-0.5 w-full bg-transparent text-[14px] font-medium outline-none"
                  />
                </div>

                <div className={cn("rounded-2xl px-3 py-2.5", palette.subcard)}>
                  <div className={cn("text-[11px]", palette.textSub)}>카테고리</div>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(ensureCategory(e.target.value))}
                    className="mt-0.5 w-full bg-transparent text-[14px] font-medium outline-none"
                  >
                    <option value="운동">운동</option>
                    <option value="공부">공부</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                <button
                  onClick={addTemplate}
                  disabled={loading}
                  className={cn("rounded-2xl px-3 py-2.5 text-[14px] font-semibold transition disabled:opacity-50", palette.btn)}
                >
                  추가
                </button>
              </div>
            </section>

            {/* List */}
            <section className="mt-4">
              <div className={cn("mb-2 px-1 text-[13px] font-semibold", palette.textDim)}>오늘 계획</div>

              <div className="space-y-2">
                {sortedTemplates.length === 0 ? (
                  <div className={cn("rounded-3xl p-4 text-[14px]", palette.card, palette.textSub)}>
                    아직 행동 템플릿이 없습니다. 위에서 행동을 추가하세요.
                  </div>
                ) : null}

                {sortedTemplates.map((t) => {
                  const done = doneIds.has(t.id);
                  const isEditing = editingId === t.id;
                  const tr = timeRangeParts(t);

                  return (
                    <div key={t.id} className={cn("rounded-3xl p-3 transition", palette.card, done && "opacity-70")}>
                      <div className="flex items-start gap-3">
                        {/* Done */}
                        <button
                          onClick={() => toggleDone(t.id)}
                          className={cn(
                            "mt-0.5 h-6 w-6 shrink-0 rounded-full border transition",
                            done
                              ? theme === "light"
                                ? "border-zinc-900 bg-zinc-900"
                                : "border-white bg-white"
                              : theme === "light"
                              ? "border-zinc-300 bg-white"
                              : "border-white/15 bg-white/5"
                          )}
                          aria-label="toggle done"
                          title="완료 체크"
                        >
                          {done ? (
                            <div
                              className={cn(
                                "flex h-full w-full items-center justify-center text-[12px] font-black",
                                theme === "light" ? "text-white" : "text-zinc-950"
                              )}
                            >
                              ✓
                            </div>
                          ) : null}
                        </button>

                        <div className="min-w-0 flex-1">
                          {!isEditing ? (
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div
                                    className={cn(
                                      "text-[15px] font-semibold leading-6",
                                      done &&
                                        (theme === "light"
                                          ? "line-through text-zinc-400"
                                          : "line-through text-white/50")
                                    )}
                                  >
                                    {t.name}
                                  </div>

                                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", palette.chip)}>
                                    {tr.label}
                                  </span>

                                  {categoryBadge(t.category)}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => beginEdit(t)}
                                  className={cn("rounded-xl px-2 py-1 text-[12px] font-semibold transition", palette.btnSoft)}
                                  title="수정"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => deleteTemplate(t.id)}
                                  className={cn("rounded-xl px-2 py-1 text-[12px] font-semibold transition", palette.btnSoft)}
                                  title="삭제"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_120px_auto] sm:items-center">
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className={cn("w-full rounded-2xl px-3 py-2 text-[14px] outline-none", palette.input)}
                                placeholder="행동 이름"
                              />

                              <div className={cn("rounded-2xl px-3 py-2", palette.subcard)}>
                                <div className={cn("text-[11px]", palette.textSub)}>시작</div>
                                <input
                                  type="time"
                                  value={editStart}
                                  onChange={(e) => setEditStart(clampTime(e.target.value))}
                                  className="mt-0.5 w-full bg-transparent text-[14px] font-medium outline-none"
                                />
                              </div>

                              <div className={cn("rounded-2xl px-3 py-2", palette.subcard)}>
                                <div className={cn("text-[11px]", palette.textSub)}>종료</div>
                                <input
                                  type="time"
                                  value={editEnd}
                                  onChange={(e) => setEditEnd(clampTime(e.target.value))}
                                  className="mt-0.5 w-full bg-transparent text-[14px] font-medium outline-none"
                                />
                              </div>

                              <div className={cn("rounded-2xl px-3 py-2", palette.subcard)}>
                                <div className={cn("text-[11px]", palette.textSub)}>카테고리</div>
                                <select
                                  value={editCategory}
                                  onChange={(e) => setEditCategory(ensureCategory(e.target.value))}
                                  className="mt-0.5 w-full bg-transparent text-[14px] font-medium outline-none"
                                >
                                  <option value="운동">운동</option>
                                  <option value="공부">공부</option>
                                  <option value="기타">기타</option>
                                </select>
                              </div>

                              <div className="flex gap-2 sm:justify-end">
                                <button
                                  onClick={() => saveEdit(t.id)}
                                  disabled={loading}
                                  className={cn("rounded-2xl px-3 py-2 text-[13px] font-semibold transition disabled:opacity-50", palette.btn)}
                                >
                                  저장
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  disabled={loading}
                                  className={cn("rounded-2xl px-3 py-2 text-[13px] font-semibold transition disabled:opacity-50", palette.btnSoft)}
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {/* TAB: STATS */}
        {tab === "stats" ? (
          <section className={cn("mt-4 rounded-3xl p-4", palette.card)}>
            <div className="flex items-center justify-between">
              <div className={cn("text-[13px] font-semibold", palette.textDim)}>이번 주 카테고리별 수행 일수</div>
              <div className={cn("text-[12px]", palette.textSub)}>
                {weekRange ? `${weekRange.weekStart} ~ ${weekRange.weekEnd}` : ""}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["운동", "공부", "기타"] as Category[]).map((cat) => {
                const stat = weekStats?.[cat] ?? { days: 0, total: 7 };
                const pct = stat.total ? Math.round((stat.days / stat.total) * 100) : 0;
                return (
                  <div key={cat} className={cn("rounded-3xl p-3", palette.subcard)}>
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-semibold">{cat}</div>
                      <div className="text-[13px] font-semibold">
                        {stat.days}/{stat.total}
                      </div>
                    </div>
                    <div className={cn("mt-2 h-2 overflow-hidden rounded-full", theme === "light" ? "bg-zinc-200" : "bg-white/10")}>
                      <div
                        className={cn("h-full rounded-full", theme === "light" ? "bg-zinc-900" : "bg-sky-400")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* TAB: JOURNAL */}
        {tab === "journal" ? (
          <section className={cn("mt-4 rounded-3xl p-4", palette.card)}>
            <div className="flex items-center justify-between">
              <div className={cn("text-[13px] font-semibold", palette.textDim)}>일기</div>
              <div className={cn("text-[12px]", palette.textSub)}>3줄만 써도 충분</div>
            </div>

            <textarea
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
              placeholder="오늘의 기록…"
              className={cn("mt-3 w-full rounded-3xl px-4 py-4 text-[14px] leading-6 outline-none", palette.input)}
              style={{ minHeight: 180 }}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}
