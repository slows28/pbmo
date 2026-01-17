import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiToken } from "../_auth";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function clampTime(t: string): string {
  if (!t) return "09:00";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  let hh = Math.min(23, Math.max(0, Number(m[1])));
  let mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// GET: 템플릿 전체 조회 (start/end 포함)
export async function GET(req: Request) {
  const auth = requireApiToken(req);
  if (auth) return auth;

  const { data, error } = await supabase
    .from("action_templates")
    .select("id,name,category,start_time,end_time,default_time,created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

// POST: upsert (start/end 저장)
export async function POST(req: Request) {
  const auth = requireApiToken(req);
  if (auth) return auth;

  const body = await req.json().catch(() => null);

  const id = String(body?.id ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const category = body?.category;

  const start_time = clampTime(String(body?.start_time ?? body?.time ?? body?.default_time ?? "09:00"));
  const end_time = clampTime(String(body?.end_time ?? "10:00"));

  if (!id || !name || !category) {
    return NextResponse.json(
      { ok: false, error: "id/name/category는 필수입니다." },
      { status: 400 }
    );
  }

  const payload = {
    id,
    name,
    category,
    start_time,
    end_time,
    // 과거 호환: default_time도 같이 유지 (정렬/표시에서 섞여도 문제 없게)
    default_time: start_time,
  };

  const { error } = await supabase.from("action_templates").upsert(payload, { onConflict: "id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE: 템플릿 삭제 (연관 로그 먼저 삭제)
export async function DELETE(req: Request) {
  const auth = requireApiToken(req);
  if (auth) return auth;

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "").trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: "id는 필수입니다." }, { status: 400 });
  }

  // 1) 로그 삭제
  const { error: e1 } = await supabase.from("action_logs").delete().eq("action_id", id);
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });

  // 2) 템플릿 삭제
  const { error: e2 } = await supabase.from("action_templates").delete().eq("id", id);
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
