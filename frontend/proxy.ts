// frontend/proxy.ts
import { jwtDecode } from "jwt-decode";
import { NextRequest, NextResponse } from "next/server";

interface JwtPayload {
  sub: string;
  role: "candidate" | "recruiter";
  exp: number;
}

// UX-only routing gate. The JWT is base64-decoded (not signature-verified) just
// to redirect on an obviously wrong/expired role. The backend re-validates every
// request and remains the authoritative authorization boundary; never rely on
// this gate as a security check.
export function proxy(request: NextRequest): NextResponse {
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
    if (pathname.startsWith("/candidate") && payload.role !== "candidate")
      return redirectToLogin();
    if (pathname.startsWith("/recruiter") && payload.role !== "recruiter")
      return redirectToLogin();
  } catch {
    return redirectToLogin();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/candidate/:path*", "/recruiter/:path*"],
};
