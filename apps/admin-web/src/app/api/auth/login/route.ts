import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4100";
  const response = await fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await request.json()),
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok) return NextResponse.json(data, { status: response.status });

  const nextResponse = NextResponse.json({ user: data.user });
  nextResponse.cookies.set("lc_admin_session", data.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return nextResponse;
}

