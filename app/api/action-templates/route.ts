import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name, time, category } = body;

    if (!id || !name) {
      return NextResponse.json(
        { ok: false, error: "id/name required" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("action_templates").upsert({
      id,
      name,
      default_time: time ?? "09:00",
      category: category ?? "기타",
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
