import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CandidateOnboardingChoice } from "@/components/candidate-onboarding-choice";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    detail: string;
    constructor(detail: string) {
      super(detail);
      this.detail = detail;
    }
  },
}));

// Stub CvImport so the CV path can be exercised without a real file upload.
vi.mock("@/components/cv-import", () => ({
  CvImport: () => <div data-testid="cv-import">CvImport</div>,
}));

import { api } from "@/lib/api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CandidateOnboardingChoice", () => {
  it("shows the three start options without a step number", () => {
    render(<CandidateOnboardingChoice />);
    expect(screen.getByText(/comment démarrer/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /importer mon cv/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remplir à la main/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /plus tard/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/étape/i)).not.toBeInTheDocument();
  });

  it("skip completes onboarding and lands on the dashboard", async () => {
    const user = userEvent.setup();
    render(<CandidateOnboardingChoice />);
    await user.click(screen.getByRole("button", { name: /plus tard/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/candidates/me/onboarding/complete",
      ),
    );
    expect(push).toHaveBeenCalledWith("/candidate/dashboard");
  });

  it("manual path saves the mini-form, completes onboarding, lands on profile", async () => {
    const user = userEvent.setup();
    render(<CandidateOnboardingChoice />);
    await user.click(
      screen.getByRole("button", { name: /remplir à la main/i }),
    );

    await user.type(screen.getByLabelText(/titre/i), "Développeur Full-Stack");
    await user.type(screen.getByLabelText(/localisation/i), "Paris");
    await user.click(screen.getByRole("button", { name: /^enregistrer/i }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/candidates/me/profile",
        expect.objectContaining({
          title: "Développeur Full-Stack",
          location: "Paris",
          contract_type: "freelance",
        }),
      ),
    );
    expect(api.post).toHaveBeenCalledWith("/candidates/me/onboarding/complete");
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/candidate/profile"),
    );
  });

  it("cv path reveals the importer and finishes on the profile", async () => {
    const user = userEvent.setup();
    render(<CandidateOnboardingChoice />);
    await user.click(screen.getByRole("button", { name: /importer mon cv/i }));
    expect(screen.getByTestId("cv-import")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /voir mon profil/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/candidates/me/onboarding/complete",
      ),
    );
    expect(push).toHaveBeenCalledWith("/candidate/profile");
  });
});
