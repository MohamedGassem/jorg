import { CandidateAppBar } from "@/components/app-bar";
import { AppLegalFooter } from "@/components/AppLegalFooter";
import { CandidateOnboardingGate } from "@/components/candidate-onboarding-gate";

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <CandidateAppBar />
      <main
        className="mx-auto w-full min-w-0 max-w-[var(--shell)] flex-1 px-7 py-[26px]"
        id="main-content"
      >
        <CandidateOnboardingGate>{children}</CandidateOnboardingGate>
      </main>
      <AppLegalFooter />
    </div>
  );
}
