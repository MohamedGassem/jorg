"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { CandidateProfile } from "@/types/api";

// Server-owned onboarding gate for the whole (candidate) group. A candidate who
// has not exited the tunnel is sent back to it before any candidate page paints,
// so there is no flash of gated content and no per-page redirect to maintain.
export function CandidateOnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((profile) => {
        if (!mounted) return;
        if (!profile.onboarding_completed) {
          router.replace("/onboarding/candidate/profile");
          return;
        }
        setChecked(true);
      })
      .catch(() => {
        // Fail open on a transient error rather than locking the candidate out
        // of the whole app; the page's own fetch will surface real failures.
        if (mounted) setChecked(true);
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  if (!checked) return null;
  return <>{children}</>;
}
