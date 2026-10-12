import { Suspense } from "react";
import { CandidateOnboardingChoice } from "@/components/candidate-onboarding-choice";

export default function CandidateOnboardingProfilePage() {
  return (
    <Suspense>
      <CandidateOnboardingChoice />
    </Suspense>
  );
}
