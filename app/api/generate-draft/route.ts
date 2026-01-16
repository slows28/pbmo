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

export async function GET() {
  try {
    const supabase = createClient(
      mustEnv("SUPABASE_URL"),
      mustEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const dateKey = todayKeyKST();

    const { data: templates, error: tErr } = await supabase
      .from("action_templates")
      .select("id,name,default_time")
      .eq("is_active", true);

    if (tErr) throw tErr;

    const items = (templates ?? []).map((t, idx) => ({
      id: t.id,
      name: t.name,
      time: t.default_time ?? "09:00",
      priority: idx + 1,
      reason: "템플릿 기반 자동 생성(테스트)",
    }));

    const plan = {
      dateKey,
      items,
      generatedAt: new Date().toISOString(),
    };

    const { error: upErr } = await supabase.from("daily_plans").upsert({
      date_key: dateKey,
      status: "draft",
      plan,
    });

    if (upErr) throw upErr;

    return Response.json({ ok: true, dateKey, count: items.length });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
