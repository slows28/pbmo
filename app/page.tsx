"use client";

import { useEffect, useMemo, useState } from "react";

type Category = "운동" | "공부" | "기타";

type ActionTemplate = {
  id: string;
  name: string;
  default_time: string;
  category: Category;
  is_active: boolean;
};

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function cn(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function clampTime(t: string): string {
  if (!t) return "09:00";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  let hh = Math.min(23, Math.max(0, Number(m[1])));
  let mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const LAST_DATE_KEY = "pbmo_last_date";

export default function Home() {
  const [dateKey, setDateKey] = useState(() => {
    if (typeof window === "undefined") return todayKey();
    return localStorage.getItem(LAST_DATE_KEY) || todayKey();
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // templates (오늘 계획은 templates 목록)
  const [templates, setTemplates] = useState<ActionTemplate[]>([]);
  // done ids for selected date
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  // weekly stats
  const [weekRange, setWeekRange] = useState<{ weekStart: string; weekEnd: string } | null>(null);
  const [weekStats, setWeekStats] = useState<Record<Category, { days: number; total: number }> | null>(
    null
  );

  // add template inputs
  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newCategory, setNewCategory] = useState<Category>("기타");

  // local journal (그대로 유지)
  const journalKey = useMemo(() => `pbmo_journal_${dateKey}`, [dateKey]);
  const [journal, setJournal] = useState("");

  useEffect(() => {
    localStorage.setItem(LAST_DATE_KEY, dateKey);
  }, [dateKey]);

  useEffect(() => {
    const saved = localStorage.getItem(journalKey);
    setJournal(saved || "");
  }, [journalKey]);

  useEffect(() => {
    localStorage.setItem(journalKey, journal);
  }, [journal, journalKey]);

  async function loadTemplates() {
  const res = await fetch("/api/action-templates", { cache: "no-store" });
  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`action-templates 응답이 JSON이 아닙니다. status=${res.status}`);
  }

  if (!res.ok || !json?.ok) throw new Error(json?.error || "템플릿을 불러오지 못했습니다.");
  setTemplates(json.data || []);
}

  async function loadDoneIds(targetDateKey: string) {
    const res = await fetch(`/api/action-logs?dateKey=${encodeURIComponent(targetDateKey)}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || "로그를 불러오지 못했습니다.");
    const ids = new Set<string>((json.data || []).map((r: any) => r.action_id));
    setDoneIds(ids);
  }

  async function loadWeekStats(targetDateKey: string) {
  const res = await fetch(`/api/week-stats?dateKey=${encodeURIComponent(targetDateKey)}`, {
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`week-stats 응답이 JSON이 아닙니다. status=${res.status}`);
  }

  if (!res.ok || !json?.ok) throw new Error(json?.error || "주간 통계를 불러오지 못했습니다.");

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

  async function addTemplate() {
    const name = newName.trim();
    if (!name) return;

    setLoading(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      const time = clampTime(newTime);

      const res = await fetch("/api/action-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          time,
          category: newCategory,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "템플릿 저장 실패");

      setNewName("");
      await loadTemplates();
    } catch (e: any) {
      setError(e?.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleDone(actionId: string) {
    const nextDone = !doneIds.has(actionId);

    // 1) UI 즉시 반영
    setDoneIds((prev) => {
      const copy = new Set(prev);
      if (nextDone) copy.add(actionId);
      else copy.delete(actionId);
      return copy;
    });

    // 2) 서버 반영
    const res = await fetch("/api/action-logs", {
      method: nextDone ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId, dateKey }),
    });

    const json = await res.json();
    if (!res.ok || !json?.ok) {
      // 실패 시 롤백
      setDoneIds((prev) => {
        const copy = new Set(prev);
        if (nextDone) copy.delete(actionId);
        else copy.add(actionId);
        return copy;
      });
      alert("체크 저장 실패: " + (json?.error || "unknown"));
      return;
    }

    // 3) 주간 통계 갱신
    await loadWeekStats(dateKey);
  }

  const sortedTemplates = useMemo(() => {
    const copy = [...templates];
    copy.sort((a, b) => {
      const aDone = doneIds.has(a.id);
      const bDone = doneIds.has(b.id);
      if (aDone !== bDone) return aDone ? 1 : -1;
      return (a.default_time || "09:00").localeCompare(b.default_time || "09:00");
    });
    return copy;
  }, [templates, doneIds]);

  function categoryBadge(cat: Category) {
    const cls =
      cat === "운동"
        ? "bg-emerald-50 text-emerald-700"
        : cat === "공부"
        ? "bg-sky-50 text-sky-700"
        : "bg-zinc-100 text-zinc-700";
    return (
      <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", cls)}>{cat}</span>
    );
  }

  const weekCards: Array<{ cat: Category; label: string }> = [
    { cat: "운동", label: "운동" },
    { cat: "공부", label: "공부" },
    { cat: "기타", label: "기타" },
  ];

  return (
    <main className="min-h-screen bg-[#F2F2F7] text-[#111]">
      <div className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight">PBMO</h1>
            <span className="text-[12px] text-black/50">1인용</span>
          </div>
          <div className="text-[12px] text-black/50">
            {weekRange ? `${weekRange.weekStart} ~ ${weekRange.weekEnd}` : ""}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[760px] px-4 pb-16 pt-4">
        {/* Header card */}
        <section className="rounded-3xl bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#F2F2F7] px-3 py-2">
                <div className="text-[11px] text-black/50">날짜</div>
                <input
                  type="date"
                  value={dateKey}
                  onChange={(e) => setDateKey(e.target.value)}
                  className="mt-0.5 bg-transparent text-[15px] font-medium outline-none"
                />
              </div>

              <div className="min-w-[220px]">
                <div className="text-[11px] text-black/50">이번 주 카테고리별 수행 일수</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {weekCards.map(({ cat }) => {
                    const stat = weekStats?.[cat] ?? { days: 0, total: 7 };
                    const pct = stat.total ? Math.round((stat.days / stat.total) * 100) : 0;
                    return (
                      <div key={cat} className="rounded-2xl bg-[#F2F2F7] px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[12px] font-semibold">{cat}</div>
                          <div className="text-[12px] font-semibold">
                            {stat.days}/{stat.total}
                          </div>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E5E5EA]">
                          <div className="h-full rounded-full bg-[#0A84FF]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={refreshAll}
              disabled={loading}
              className={cn(
                "rounded-2xl px-3.5 py-2 text-[14px] font-semibold",
                "bg-[#111827] text-white",
                "disabled:opacity-50"
              )}
            >
              새로고침
            </button>
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? <div className="mt-3 text-[12px] text-black/45">불러오는 중…</div> : null}
        </section>

        {/* Add template */}
        <section className="mt-4 rounded-3xl bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
          <div className="text-[13px] font-semibold text-black/80">행동 추가 (템플릿)</div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_160px_96px] sm:items-center">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 스트레칭 5분"
              className="w-full rounded-2xl border border-black/10 bg-[#F2F2F7] px-4 py-3 text-[15px] outline-none focus:border-black/20"
            />

            <div className="rounded-2xl border border-black/10 bg-[#F2F2F7] px-4 py-3">
              <div className="text-[11px] text-black/50">시간</div>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(clampTime(e.target.value))}
                className="mt-0.5 w-full bg-transparent text-[15px] font-medium outline-none"
              />
            </div>

            <div className="rounded-2xl border border-black/10 bg-[#F2F2F7] px-4 py-3">
              <div className="text-[11px] text-black/50">카테고리</div>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as Category)}
                className="mt-0.5 w-full bg-transparent text-[15px] font-medium outline-none"
              >
                <option value="운동">운동</option>
                <option value="공부">공부</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <button
              onClick={addTemplate}
              disabled={loading}
              className={cn(
                "rounded-2xl bg-[#34C759] px-4 py-3 text-[15px] font-semibold text-white",
                "disabled:opacity-50"
              )}
            >
              추가
            </button>
          </div>
        </section>

        {/* Today plan (templates) */}
        <section className="mt-4">
          <div className="mb-2 px-1 text-[13px] font-semibold text-black/70">오늘 계획</div>

          <div className="space-y-2">
            {sortedTemplates.length === 0 ? (
              <div className="rounded-3xl bg-white p-5 text-[14px] text-black/55 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
                아직 행동 템플릿이 없습니다. 위에서 행동을 추가하세요.
              </div>
            ) : null}

            {sortedTemplates.map((t) => {
              const done = doneIds.has(t.id);
              return (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-3xl bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)]",
                    done && "opacity-70"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleDone(t.id)}
                      className={cn(
                        "mt-0.5 h-6 w-6 shrink-0 rounded-full border",
                        done ? "border-[#34C759] bg-[#34C759]" : "border-black/15 bg-white"
                      )}
                      aria-label="toggle done"
                      title="완료 체크"
                    >
                      <div className={cn("h-full w-full", done ? "block" : "hidden")}>
                        <div className="flex h-full w-full items-center justify-center text-white">✓</div>
                      </div>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className={cn("text-[16px] font-semibold", done && "line-through text-black/50")}>
                          {t.name}
                        </div>
                        {categoryBadge(t.category)}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="rounded-2xl border border-black/10 bg-[#F2F2F7] px-3 py-2">
                          <div className="text-[11px] text-black/50">시간</div>
                          <div className="mt-0.5 text-[14px] font-semibold">{clampTime(t.default_time)}</div>
                        </div>
                        <div className="text-[12px] text-black/45">
                          체크하면 action_logs에 날짜별로 기록됩니다.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Journal */}
        <section className="mt-6 rounded-3xl bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-black/80">저널</div>
            <div className="text-[12px] text-black/45">3줄만 써도 충분</div>
          </div>

          <textarea
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            placeholder="오늘의 기록…"
            className="mt-3 w-full rounded-3xl border border-black/10 bg-[#F2F2F7] px-4 py-4 text-[15px] leading-6 outline-none focus:border-black/20"
            style={{ minHeight: 160 }}
          />
        </section>

        <div className="mt-6 px-1 text-[12px] text-black/45">
          운영 팁: 체크는 상태가 아니라 action_logs(로그)로 누적됩니다. 주간 통계는 로그 기반으로 계산됩니다.
        </div>
      </div>
    </main>
  );
}
