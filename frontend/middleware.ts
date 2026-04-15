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

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const payload = jwtDecode<JwtPayload>(token);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (pathname.startsWith("/candidate") && payload.role !== "candidate") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (pathname.startsWith("/recruiter") && payload.role !== "recruiter") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/candidate/:path*", "/recruiter/:path*"],
};
