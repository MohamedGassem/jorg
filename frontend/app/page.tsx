// frontend/app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingBridge } from "@/components/landing/LandingBridge";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingAlpha } from "@/components/landing/LandingAlpha";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (token) {
    try {
      const apiUrl =
        process.env.NEXT_PRIVATE_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${apiUrl}/auth/me`, {
        headers: { Cookie: `access_token=${token}` },
        cache: "no-store",
      });

      if (res.ok) {
        const user = (await res.json()) as { role: string };
        if (user.role === "candidate") redirect("/candidate/dashboard");
        if (user.role === "recruiter") redirect("/recruiter/dashboard");
      }
    } catch {
      // network error -- fall through to landing
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <LandingNav />
      <LandingHero />
      <LandingBridge />
      <LandingFeatures />
      <LandingAlpha />
      <LandingFooter />
    </div>
  );
}
