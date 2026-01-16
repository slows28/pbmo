"use client";

import { useEffect, useMemo, useState } from "react";

type PlanItem = {
  id: string;
  name: string;
  time: string; // "HH:MM"
  priority?: number;
  reason?: string;
};

type DailyPlanRow = {
  date_key: string;
  status: "draft" | "confirmed";
  plan: {
    dateKey: string;
    items: PlanItem[];
    generatedAt?: string;
  };
};

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function newId() {
  return crypto.randomUUID();
}

function clampTime(v: string) {
  // 아주 단순 검증 (비면 09:00)
  if (!/^\d{2}:\d{2}$/.test(v)) return "09:00";
  return v;
}

export default function Home() {
  const [dateKey, setDateKey] = useState(todayKey());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [row, setRow] = useState<DailyPlanRow | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [status, setStatus] = useState<"draft" | "confirmed">("draft");

  const progressText = useMemo(() => {
    // 현재는 "완료체크"를 DB에 저장하지 않으므로 진행률은 임시로 숨김/확장 여지
    return status === "confirmed" ? "확정됨" : "초안";
  }, [status]);

  async function loadPlan(targetDate: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/plan?date=${encodeURIComponent(targetDate)}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "load failed");

      const data = json.data as DailyPlanRow | null;
      setRow(data);

      if (!data) {
        setItems([]);
        setStatus("draft");
        return;
      }

      setItems(Array.isArray(data.plan?.items) ? data.plan.items : []);
      setStatus(data.status);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlan(dateKey);
  }, [dateKey]);

  async function generateDraft() {
    setLoading(true);
    try {
      // 기존에 만든 draft 생성 API 호출
      const res = await fetch("/api/generate-draft");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "generate failed");

      // 생성 후 다시 로드
      await loadPlan(dateKey);
    } finally {
      setLoading(false);
    }
  }

  async function save(statusToSave: "draft" | "confirmed") {
    setSaving(true);
    try {
      const plan = {
        dateKey,
        items: items.map((it, idx) => ({
          ...it,
          time: clampTime(it.time),
          priority: idx + 1,
        })),
        generatedAt: row?.plan?.generatedAt ?? new Date().toISOString(),
      };

      const res = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateKey, status: statusToSave, plan }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "save failed");

      await loadPlan(dateKey);
    } finally {
      setSaving(false);
    }
  }

  function updateItem(id: string, patch: Partial<PlanItem>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: newId(), name: "새 행동", time: "09:00", reason: "수동 추가" },
    ]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  const card: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 14,
    background: "white",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "white",
    cursor: "pointer",
    fontWeight: 600,
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: "#111827",
    color: "white",
    borderColor: "#111827",
  };

  return (
    <main
      style={{
        fontFamily: "system-ui",
        maxWidth: 900,
        margin: "0 auto",
        padding: 16,
        background: "#f9fafb",
        minHeight: "100vh",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>PBMO (1인용)</h1>
          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            상태: <b style={{ color: "#111827" }}>{progressText}</b>
            {loading ? " · 로딩중..." : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#374151" }}>날짜</span>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>
        </div>
      </header>

      <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111827" }}>오늘 계획</div>
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
                DB에서 불러온 계획을 수정하고 확정합니다.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btn} onClick={generateDraft} disabled={loading}>
                초안 생성(자동)
              </button>
              <button style={btn} onClick={addItem} disabled={loading}>
                항목 추가
              </button>
              <button style={btnPrimary} onClick={() => save("draft")} disabled={saving || loading}>
                초안 저장
              </button>
              <button style={btnPrimary} onClick={() => save("confirmed")} disabled={saving || loading}>
                확정 저장
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {!row && items.length === 0 ? (
              <div style={{ padding: 12, borderRadius: 10, background: "#f3f4f6", color: "#374151" }}>
                아직 오늘 계획이 없습니다. <b>“초안 생성(자동)”</b>을 눌러 시작하세요.
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: 12, borderRadius: 10, background: "#fef3c7", color: "#92400e" }}>
                계획은 존재하지만 items가 비어 있습니다. 항목을 추가하고 저장하세요.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {items.map((it, idx) => (
                  <div
                    key={it.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "90px 1fr 90px",
                      gap: 10,
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                    }}
                  >
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>시간</div>
                      <input
                        value={it.time}
                        onChange={(e) => updateItem(it.id, { time: e.target.value })}
                        placeholder="HH:MM"
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #d1d5db" }}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>행동 #{idx + 1}</div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>
                          {it.reason ? `이유: ${it.reason}` : ""}
                        </div>
                      </div>
                      <input
                        value={it.name}
                        onChange={(e) => updateItem(it.id, { name: e.target.value })}
                        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}
                      />
                    </div>

                    <button style={btn} onClick={() => removeItem(it.id)} disabled={loading}>
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ ...card, background: "#0b1220", color: "white" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>지금 단계에서 가능한 것</div>
          <ul style={{ marginTop: 10, lineHeight: 1.7, color: "#d1d5db" }}>
            <li>초안 자동 생성(템플릿 기반) → DB 저장</li>
            <li>DB의 오늘 계획을 화면에 표시</li>
            <li>시간/이름 수정, 항목 추가/삭제</li>
            <li>초안 저장(draft) / 확정 저장(confirmed)</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

