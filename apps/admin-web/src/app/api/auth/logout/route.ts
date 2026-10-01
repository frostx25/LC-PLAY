import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set("lc_admin_session", "", { path: "/", maxAge: 0 });
  return response;
}

