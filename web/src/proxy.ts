import { NextResponse, type NextRequest } from "next/server";
import { openSession } from "@/lib/server/sealed";

const SESSION_COOKIE = "rideops_session";

export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = openSession(cookie) !== null;
  const isLogin = request.nextUrl.pathname === "/login";
  if (hasSession && isLogin) return NextResponse.redirect(new URL("/", request.url));
  const response = hasSession || isLogin
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/login", request.url));
  if (cookie && !hasSession) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
