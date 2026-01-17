import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiToken } from "../_auth";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// GET: 날짜 기준 로그 조회
export async function GET(req: Request) {
  const auth = requireApiToken(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const dateKey = searchParams.get("dateKey");

  if (!dateKey) {
    return NextResponse.json({ ok: false, error: "dateKey가 필요합니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("action_logs")
    .select("action_id,date_key,created_at")
    .eq("date_key", dateKey);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

// POST: 체크 = insert
export async function POST(req: Request) {
  const auth = requireApiToken(req);
  if (auth) return auth;

  const body = await req.json().catch(() => null);
  const actionId = String(body?.actionId ?? "").trim();
  const dateKey = String(body?.dateKey ?? "").trim();

  if (!actionId || !dateKey) {
    return NextResponse.json(
      { ok: false, error: "actionId/dateKey는 필수입니다." },
      { status: 400 }
    );
  }

  // unique(action_id, date_key)라서 중복은 에러 가능 -> upsert로 처리
  const { error } = await supabase
    .from("action_logs")
    .upsert({ action_id: actionId, date_key: dateKey }, { onConflict: "action_id,date_key" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: 체크 해제 = delete
export async function DELETE(req: Request) {
  const auth = requireApiToken(req);
  if (auth) return auth;

  const body = await req.json().catch(() => null);
  const actionId = String(body?.actionId ?? "").trim();
  const dateKey = String(body?.dateKey ?? "").trim();

  if (!actionId || !dateKey) {
    return NextResponse.json(
      { ok: false, error: "actionId/dateKey는 필수입니다." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("action_logs")
    .delete()
    .eq("action_id", actionId)
    .eq("date_key", dateKey);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
