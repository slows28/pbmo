import { createClient } from "@supabase/supabase-js";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function todayKeyKST(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function isDateKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const supabase = () =>
  createClient(mustEnv("SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"));

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateKey = url.searchParams.get("date") || todayKeyKST();
    if (!isDateKey(dateKey)) {
      return Response.json({ ok: false, error: "Invalid date format" }, { status: 400 });
    }

    const { data, error } = await supabase()
      .from("daily_plans")
      .select("date_key,status,plan,created_at,updated_at")
      .eq("date_key", dateKey)
      .maybeSingle();

    if (error) throw error;

    return Response.json({ ok: true, data: data ?? null });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const dateKey = body?.dateKey;
    const status = body?.status; // 'draft' | 'confirmed'
    const plan = body?.plan;

    if (!dateKey || !isDateKey(dateKey)) {
      return Response.json({ ok: false, error: "dateKey is required (YYYY-MM-DD)" }, { status: 400 });
    }
    if (status !== "draft" && status !== "confirmed") {
      return Response.json({ ok: false, error: "status must be 'draft' or 'confirmed'" }, { status: 400 });
    }
    if (!plan || typeof plan !== "object") {
      return Response.json({ ok: false, error: "plan object is required" }, { status: 400 });
    }

    const { error } = await supabase().from("daily_plans").upsert({
      date_key: dateKey,
      status,
      plan,
    });

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
