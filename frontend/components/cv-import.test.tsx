import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CvImport } from "@/components/cv-import";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ id: "created" })),
    put: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    detail: string;
    status: number;
    constructor(detail: string, status = 400) {
      super(detail);
      this.detail = detail;
      this.status = status;
    }
  },
}));

import { api } from "@/lib/api";

// A minimal parse result shaped like the /parse-cv payload the backend returns.
function parseResult(overrides: Record<string, unknown> = {}) {
  return {
    proposal_id: "p1",
    status: "pending_review",
    extraction_method: "heuristic",
    quality_score: 0.8,
    warnings: [],
    email: null,
    phone: null,
    linkedin_url: null,
    skills: [],
    proposed_profile: {
      identity: {
        title: { value: "Développeur Full-Stack" },
        location: { value: "Paris" },
      },
      experiences: [],
      education: [],
      certifications: [],
      languages: [],
    },
    ...overrides,
  };
}

async function upload(
  result: ReturnType<typeof parseResult>,
  props: { collectIdentity?: boolean } = {},
) {
  vi.mocked(api.upload).mockResolvedValue(result);
  const user = userEvent.setup();
  const { container } = render(<CvImport {...props} />);
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await user.upload(
    input,
    new File(["cv"], "cv.pdf", { type: "application/pdf" }),
  );
  await screen.findByRole("button", { name: /ajouter \d+ élément/i });
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CvImport review", () => {
  it("prefills the identity block from the extracted profile", async () => {
    await upload(parseResult(), { collectIdentity: true });
    expect(
      screen.getByDisplayValue("Développeur Full-Stack"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Paris")).toBeInTheDocument();
  });

  it("keeps sections collapsed by default, showing a counter", async () => {
    const user = await upload(
      parseResult({
        proposed_profile: {
          identity: {},
          experiences: [
            {
              role: { value: "Lead" },
              client_name: { value: "ACME" },
              start_date: { value: "2020-01" },
            },
          ],
          education: [],
          certifications: [],
          languages: [],
        },
      }),
    );
    // Collapsed: the editable experience fields are not rendered yet.
    expect(
      screen.queryByPlaceholderText(/client ou entreprise/i),
    ).not.toBeInTheDocument();
    // A section toggle advertises the count.
    const toggle = screen.getByRole("button", { name: /expérience/i });
    await user.click(toggle);
    expect(
      screen.getByPlaceholderText(/client ou entreprise/i),
    ).toBeInTheDocument();
  });

  it("offers a single totalizing CTA counting every section", async () => {
    await upload(
      parseResult({
        skills: [
          { skill_ref_id: "s1", name: "React", kind: "hard" },
          { skill_ref_id: "s2", name: "Python", kind: "hard" },
        ],
        proposed_profile: {
          identity: {},
          experiences: [
            {
              role: { value: "Lead" },
              client_name: { value: "ACME" },
              start_date: { value: "2020-01" },
            },
          ],
          education: [],
          certifications: [],
          languages: [],
        },
      }),
    );
    // 1 experience + 2 skills = 3 elements, everything checked by default.
    expect(
      screen.getByRole("button", { name: /ajouter 3 élément/i }),
    ).toBeInTheDocument();
  });

  it("applies identity, experiences and skills in one action and reports a summary", async () => {
    const onApplied = vi.fn();
    vi.mocked(api.upload).mockResolvedValue(
      parseResult({
        skills: [{ skill_ref_id: "s1", name: "React", kind: "hard" }],
        proposed_profile: {
          identity: {
            title: { value: "Lead Dev" },
            location: { value: "Lyon" },
          },
          experiences: [
            {
              role: { value: "Lead" },
              client_name: { value: "ACME" },
              start_date: { value: "2020-01" },
            },
          ],
          education: [],
          certifications: [],
          languages: [],
        },
      }),
    );
    const user = userEvent.setup();
    const { container } = render(
      <CvImport collectIdentity onApplied={onApplied} />,
    );
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["cv"], "cv.pdf", { type: "application/pdf" }),
    );
    const cta = await screen.findByRole("button", {
      name: /ajouter \d+ élément/i,
    });
    await user.click(cta);

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/candidates/me/profile",
        expect.objectContaining({ title: "Lead Dev", location: "Lyon" }),
      ),
    );
    expect(api.post).toHaveBeenCalledWith(
      "/candidates/me/experiences",
      expect.objectContaining({ client_name: "ACME", role: "Lead" }),
    );
    expect(api.post).toHaveBeenCalledWith("/candidates/me/skills", {
      skill_ref_id: "s1",
    });
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });
});
