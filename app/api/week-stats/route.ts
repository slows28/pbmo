import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiToken } from "../_auth";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function toDateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateKey(dateKey: string) {
  // YYYY-MM-DD
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfWeekMon(d: Date) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // 월요일 기준
  const out = new Date(d);
  out.setDate(d.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

// GET: 주간 카테고리별 수행 일수
export async function GET(req: Request) {
  const auth = requireApiToken(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const dateKey = searchParams.get("dateKey");

  if (!dateKey) {
    return NextResponse.json({ ok: false, error: "dateKey가 필요합니다." }, { status: 400 });
  }

  const base = parseDateKey(dateKey);
  const ws = startOfWeekMon(base);
  const we = new Date(ws);
  we.setDate(ws.getDate() + 6);

  const weekStart = toDateKey(ws);
  const weekEnd = toDateKey(we);

  // logs: 주간 범위
  const { data: logs, error: e1 } = await supabase
    .from("action_logs")
    .select("action_id,date_key")
    .gte("date_key", weekStart)
    .lte("date_key", weekEnd);

  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });

  // templates: category 맵
  const { data: temps, error: e2 } = await supabase
    .from("action_templates")
    .select("id,category");

  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });

  const idToCat = new Map<string, string>();
  for (const t of temps ?? []) idToCat.set(t.id, t.category);

  // category별 "서로 다른 date_key" 집합
  const sets: Record<string, Set<string>> = {
    운동: new Set<string>(),
    공부: new Set<string>(),
    기타: new Set<string>(),
  };

  for (const r of logs ?? []) {
    const cat = idToCat.get(r.action_id) ?? "기타";
    const dk = r.date_key;
    if (cat === "운동" || cat === "공부" || cat === "기타") sets[cat].add(dk);
    else sets["기타"].add(dk);
  }

  return NextResponse.json({
    ok: true,
    weekStart,
    weekEnd,
    data: {
      운동: { days: sets["운동"].size, total: 7 },
      공부: { days: sets["공부"].size, total: 7 },
      기타: { days: sets["기타"].size, total: 7 },
    },
  });
}
