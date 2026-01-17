import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function toDateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// weekStart: Monday
function getWeekRange(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0 Sun ... 6 Sat
  const diffToMon = (day + 6) % 7; // Mon=0
  const start = new Date(dt);
  start.setDate(dt.getDate() - diffToMon);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { weekStart: toDateKey(start), weekEnd: toDateKey(end) };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateKey = searchParams.get("dateKey");
    if (!dateKey) {
      return NextResponse.json({ ok: false, error: "dateKey required" }, { status: 400 });
    }

    const { weekStart, weekEnd } = getWeekRange(dateKey);

    // join: action_logs -> action_templates(category) via FK
    const { data, error } = await supabase
      .from("action_logs")
      .select("date_key, action_templates!inner(category)")
      .gte("date_key", weekStart)
      .lte("date_key", weekEnd);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const byCategory: Record<string, Set<string>> = {
      운동: new Set(),
      공부: new Set(),
      기타: new Set(),
    };

    for (const row of data ?? []) {
      const cat = (row as any).action_templates?.category ?? "기타";
      const dk = (row as any).date_key;
      if (!dk) continue;
      if (!byCategory[cat]) byCategory[cat] = new Set();
      byCategory[cat].add(dk);
    }

    const out = Object.fromEntries(
      Object.entries(byCategory).map(([cat, set]) => [cat, { days: set.size, total: 7 }])
    );

    return NextResponse.json({ ok: true, weekStart, weekEnd, data: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
