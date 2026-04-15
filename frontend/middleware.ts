// frontend/middleware.ts
import { jwtDecode } from "jwt-decode";
import { NextRequest, NextResponse } from "next/server";

interface JwtPayload {
  sub: string;
  role: "candidate" | "recruiter";
  exp: number;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("access_token")?.value;

  const isProtected =
    pathname.startsWith("/candidate") || pathname.startsWith("/recruiter");

  if (!isProtected) return NextResponse.next();

  function redirectToLogin() {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete("access_token");
    res.cookies.delete("refresh_token");
    return res;
  }

  if (!token) return redirectToLogin();

  try {
    const payload = jwtDecode<JwtPayload>(token);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return redirectToLogin();
    if (pathname.startsWith("/candidate") && payload.role !== "candidate") return redirectToLogin();
    if (pathname.startsWith("/recruiter") && payload.role !== "recruiter") return redirectToLogin();
  } catch {
    return redirectToLogin();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/candidate/:path*", "/recruiter/:path*"],
};
