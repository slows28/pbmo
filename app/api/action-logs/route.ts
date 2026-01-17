import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { actionId, dateKey } = await req.json();

    if (!actionId || !dateKey) {
      return NextResponse.json(
        { ok: false, error: "actionId / dateKey required" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("action_logs").insert({
      action_id: actionId,
      date_key: dateKey,
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

export async function DELETE(req: Request) {
  try {
    const { actionId, dateKey } = await req.json();

    if (!actionId || !dateKey) {
      return NextResponse.json(
        { ok: false, error: "actionId / dateKey required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("action_logs")
      .delete()
      .eq("action_id", actionId)
      .eq("date_key", dateKey);

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
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateKey = searchParams.get("dateKey");

    if (!dateKey) {
      return NextResponse.json(
        { ok: false, error: "dateKey required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("action_logs")
      .select("action_id")
      .eq("date_key", dateKey);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
