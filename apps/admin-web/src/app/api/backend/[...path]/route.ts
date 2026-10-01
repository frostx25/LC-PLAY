import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: RouteContext) {
  const token = (await cookies()).get("lc_admin_session")?.value;
  if (!token) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const { path } = await context.params;
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4100";
  const query = request.nextUrl.search;
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  const hasBody = !["GET", "HEAD"].includes(request.method);
  if (hasBody) headers["Content-Type"] = request.headers.get("content-type") ?? "application/json";

  const response = await fetch(`${apiUrl}/api/${path.join("/")}${query}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
    cache: "no-store",
  });

  if (response.status === 204) return new NextResponse(null, { status: 204 });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;

