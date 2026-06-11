// frontend/app/page.tsx
import { cookies } from "next/headers";
import { LandingNav, type LandingUser } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingBridge } from "@/components/landing/LandingBridge";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingAlpha } from "@/components/landing/LandingAlpha";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  let user: LandingUser | null = null;
  if (token) {
    try {
      const apiUrl =
        process.env.NEXT_PRIVATE_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${apiUrl}/auth/me`, {
        headers: { Cookie: `access_token=${token}` },
        cache: "no-store",
      });

      if (res.ok) {
        const me = (await res.json()) as { role: string; email: string };
        if (me.role === "candidate" || me.role === "recruiter") {
          user = { role: me.role, email: me.email };
        }
      }
    } catch {
      // network error -- show the landing page as if logged out
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <LandingNav user={user} />
      <LandingHero />
      <LandingHowItWorks />
      <LandingBridge />
      <LandingFeatures />
      <LandingAlpha />
      <LandingFooter />
    </div>
  );
}
