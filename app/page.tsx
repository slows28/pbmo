"use client";

import { useEffect, useMemo, useState } from "react";

type PlanItem = {
  id: string;
  name: string;
  time: string; // "HH:MM"
  done: boolean;
  reason?: string | null;
  priority?: number | null;
};

type PlanStatus = "draft" | "confirmed";

type PlanResponse = {
  ok: boolean;
  dateKey: string;
  status: PlanStatus;
  items: PlanItem[];
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
  // basic guard: enforce "HH:MM"
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
  const [status, setStatus] = useState<PlanStatus>("draft");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState("09:00");

  // local journal (iOS memo 느낌: 일단 로컬 유지)
  const journalKey = useMemo(() => `pbmo_journal_${dateKey}`, [dateKey]);
  const [journal, setJournal] = useState("");

  useEffect(() => {
    localStorage.setItem(LAST_DATE_KEY, dateKey);
  }, [dateKey]);

  useEffect(() => {
    // journal load
    const saved = localStorage.getItem(journalKey);
    setJournal(saved || "");
  }, [journalKey]);

  useEffect(() => {
    // journal save
    localStorage.setItem(journalKey, journal);
  }, [journal, journalKey]);

  async function apiGetPlan(targetDateKey: string) {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`/api/plan?dateKey=${encodeURIComponent(targetDateKey)}`, {
      cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "계획을 불러오지 못했습니다.");
    }

    // ✅ 서버가 주는 형태: { ok:true, data: { status, plan:{ items:[...] } } }
    const row = json.data;

    if (!row) {
      setStatus("draft");
      setItems([]);
      return;
    }

    setStatus(row.status || "draft");

    const serverItems = Array.isArray(row?.plan?.items) ? row.plan.items : [];
    // done이 없는 예전 데이터도 false로 보정
    setItems(
      serverItems.map((it: any) => ({
        id: it.id,
        name: it.name,
        time: it.time || "09:00",
        done: typeof it.done === "boolean" ? it.done : false,
        reason: it.reason ?? null,
        priority: it.priority ?? null,
      }))
    );
  } catch (e: any) {
    setStatus("draft");
    setItems([]);
    setError(e?.message || "오류가 발생했습니다.");
  } finally {
    setLoading(false);
  }
}

  async function apiGenerateDraft() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/generate-draft?dateKey=${encodeURIComponent(dateKey)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "초안 생성에 실패했습니다.");
      }
      await apiGetPlan(dateKey);
    } catch (e: any) {
      setError(e?.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function apiSave(nextStatus: PlanStatus) {
  setLoading(true);
  setError(null);
  try {
    const payload = {
  dateKey,
  status: nextStatus,
  plan: {
    items: items.map((it) => ({
      id: it.id,
      name: it.name,
      time: it.time,
      reason: it.reason ?? null,
      priority: it.priority ?? null,
      done: it.done ?? false,
    })),
  },
};

    const res = await fetch(`/api/plan`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "저장에 실패했습니다.");
    }

    setStatus(nextStatus);
  } catch (e: any) {
    setError(e?.message || "오류가 발생했습니다.");
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    apiGetPlan(dateKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  const doneCount = items.filter((x) => x.done).length;
  const progressPct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  function toggleDone(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  }

  function updateTime(id: string, time: string) {
    const t = clampTime(time);
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, time: t } : it)));
  }

  function updateName(id: string, name: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, name } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function addItem() {
    const name = newName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setItems((prev) => [{ id, name, time: clampTime(newTime), done: false }, ...prev]);
    setNewName("");
  }

  const sortedItems = useMemo(() => {
    // iOS 느낌: 시간순 정렬 + done은 맨 아래
    const copy = [...items];
    copy.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.time.localeCompare(b.time);
    });
    return copy;
  }, [items]);

  return (
    <main className="min-h-screen bg-[#F2F2F7] text-[#111]">
      {/* iOS-like top bar */}
      <div className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight">PBMO</h1>
            <span className="text-[12px] text-black/50">1인용</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-medium",
                status === "confirmed"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-sky-50 text-sky-700"
              )}
            >
              {status === "confirmed" ? "확정" : "초안"}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[760px] px-4 pb-16 pt-4">
        {/* Date + actions card */}
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

              <div className="min-w-[120px]">
                <div className="text-[11px] text-black/50">오늘 진행률</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-[#E5E5EA]">
                    <div
                      className="h-full rounded-full bg-[#0A84FF]"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="text-[13px] font-semibold">
                    {doneCount}/{items.length}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={apiGenerateDraft}
                disabled={loading}
                className={cn(
                  "rounded-2xl px-3.5 py-2 text-[14px] font-semibold",
                  "bg-[#0A84FF] text-white",
                  "disabled:opacity-50"
                )}
              >
                초안 생성
              </button>
              <button
                onClick={() => apiSave("draft")}
                disabled={loading}
                className={cn(
                  "rounded-2xl px-3.5 py-2 text-[14px] font-semibold",
                  "bg-[#F2F2F7] text-black/85",
                  "disabled:opacity-50"
                )}
              >
                저장
              </button>
              <button
                onClick={() => apiSave("confirmed")}
                disabled={loading}
                className={cn(
                  "rounded-2xl px-3.5 py-2 text-[14px] font-semibold",
                  "bg-[#111827] text-white",
                  "disabled:opacity-50"
                )}
              >
                확정
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-3 text-[12px] text-black/45">불러오는 중…</div>
          ) : null}
        </section>

        {/* Add item */}
        <section className="mt-4 rounded-3xl bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
          <div className="text-[13px] font-semibold text-black/80">행동 추가</div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_96px] sm:items-center">
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

            <button
              onClick={addItem}
              className="rounded-2xl bg-[#34C759] px-4 py-3 text-[15px] font-semibold text-white"
            >
              추가
            </button>
          </div>

          <div className="mt-2 text-[12px] text-black/45">
            팁: 시간 기반으로 정렬되며, 완료한 항목은 아래로 내려갑니다.
          </div>
        </section>

        {/* List */}
        <section className="mt-4">
          <div className="mb-2 px-1 text-[13px] font-semibold text-black/70">오늘 계획</div>

          <div className="space-y-2">
            {sortedItems.length === 0 ? (
              <div className="rounded-3xl bg-white p-5 text-[14px] text-black/55 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
                아직 오늘 계획이 없습니다. <span className="font-semibold">초안 생성</span>을 눌러 시작하세요.
              </div>
            ) : null}

            {sortedItems.map((it) => (
              <div
                key={it.id}
                className={cn(
                  "rounded-3xl bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)]",
                  it.done && "opacity-70"
                )}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleDone(it.id)}
                    className={cn(
                      "mt-0.5 h-6 w-6 shrink-0 rounded-full border",
                      it.done
                        ? "border-[#34C759] bg-[#34C759]"
                        : "border-black/15 bg-white"
                    )}
                    aria-label="toggle done"
                    title="완료 체크"
                  >
                    <div className={cn("h-full w-full", it.done ? "block" : "hidden")}>
                      <div className="flex h-full w-full items-center justify-center text-white">
                        ✓
                      </div>
                    </div>
                  </button>

                  <div className="min-w-0 flex-1">
                    <input
                      value={it.name}
                      onChange={(e) => updateName(it.id, e.target.value)}
                      className={cn(
                        "w-full bg-transparent text-[16px] font-semibold outline-none",
                        it.done ? "line-through text-black/50" : "text-black"
                      )}
                    />

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="rounded-2xl border border-black/10 bg-[#F2F2F7] px-3 py-2">
                        <div className="text-[11px] text-black/50">시간</div>
                        <input
                          type="time"
                          value={clampTime(it.time)}
                          onChange={(e) => updateTime(it.id, e.target.value)}
                          className="mt-0.5 bg-transparent text-[14px] font-semibold outline-none"
                        />
                      </div>

                      {it.reason ? (
                        <div className="min-w-[180px] flex-1 rounded-2xl bg-[#F2F2F7] px-3 py-2">
                          <div className="text-[11px] text-black/50">추천 이유</div>
                          <div className="mt-0.5 text-[13px] text-black/70">{it.reason}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(it.id)}
                    className="rounded-2xl bg-[#FF3B30] px-3 py-2 text-[13px] font-semibold text-white"
                    title="삭제"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
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

        {/* Footer hint */}
        <div className="mt-6 px-1 text-[12px] text-black/45">
          운영 팁: 기능은 서버(API)에서 처리되고, 화면은 표시/수정만 합니다. UI를 바꿔도 DB 구조는 그대로 유지됩니다.
        </div>
      </div>
    </main>
  );
}
