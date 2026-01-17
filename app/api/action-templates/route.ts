import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("action_templates")
      .select("id,name,default_time,category,created_at")
      // ✅ is_active 필터 제거
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name, time, category } = body;

    if (!id || !name) {
      return NextResponse.json({ ok: false, error: "id/name required" }, { status: 400 });
    }

    const payload = {
      id,
      name,
      default_time: time ?? "09:00",
      category: category ?? "기타",
    };

    // ✅ upsert: 같은 id면 업데이트, 없으면 생성
    const { error } = await supabase.from("action_templates").upsert(payload);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server error" }, { status: 500 });
  }
}
