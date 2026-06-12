import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const isLogin = req.nextUrl.pathname.startsWith("/login");

  const hasSupabaseSession = req.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));

  if (!hasSupabaseSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
