import { NextResponse } from "next/server";

export function requireApiToken(req: Request) {
  const token = process.env.PBMO_API_TOKEN;
  const got = req.headers.get("x-pbmo-token");

  if (!token || got !== token) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return null;
}
