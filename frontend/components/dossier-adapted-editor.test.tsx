import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DossierAdaptedEditor } from "@/components/dossier-adapted-editor";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    download: vi.fn(),
  },
}));

import { api } from "@/lib/api";

const experiences = [
  { id: "e1", role: "Dev", client_name: "ACME" },
  { id: "e2", role: "Lead", client_name: "Globex" },
];
const skills = [
  { id: "s1", name: "Python" },
  { id: "s2", name: "React" },
];

function mockGet(
  builtins: { key: string; name: string; description: string }[],
) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === "/templates/builtin") return Promise.resolve(builtins);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet([
    { key: "compact_esn", name: "Compact", description: "Format court" },
  ]);
});

function renderSelf() {
  return render(
    <DossierAdaptedEditor
      open
      onOpenChange={() => {}}
      target={{ kind: "self" }}
      experiences={experiences}
      skills={skills}
    />,
  );
}

describe("DossierAdaptedEditor", () => {
  it("lists every experience and skill, all included by default", async () => {
    renderSelf();
    expect(
      await screen.findByRole("checkbox", { name: "Inclure Dev - ACME" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Inclure Lead - Globex" }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Python" })).toBeInTheDocument();
  });

  it("drops an excluded experience from the live preview", async () => {
    const user = userEvent.setup();
    renderSelf();
    const preview = await screen.findByRole("region", {
      name: "Aperçu de la structure",
    });
    expect(within(preview).getByText("Dev - ACME")).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: "Inclure Dev - ACME" }),
    );
    expect(within(preview).queryByText("Dev - ACME")).not.toBeInTheDocument();
    expect(within(preview).getByText("Lead - Globex")).toBeInTheDocument();
  });

  it("creates the dossier, replaces selections, then generates", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((path: string) => {
      if (path === "/dossiers") return Promise.resolve({ id: "d1" });
      if (path === "/dossiers/d1/generate")
        return Promise.resolve({ id: "doc1", file_format: "docx" });
      return Promise.resolve({});
    });
    vi.mocked(api.put).mockResolvedValue({});

    renderSelf();
    await screen.findByRole("checkbox", { name: "Inclure Dev - ACME" });

    await user.type(screen.getByLabelText("Nom de la version"), "Version ACME");
    await user.click(screen.getByRole("button", { name: /Compact/ }));
    await user.click(screen.getByRole("button", { name: /^Générer/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/dossiers",
        expect.objectContaining({ name: "Version ACME", share_contact: true }),
      ),
    );
    expect(api.put).toHaveBeenCalledWith("/dossiers/d1/experiences", [
      { experience_id: "e1", is_featured: false },
      { experience_id: "e2", is_featured: false },
    ]);
    expect(api.put).toHaveBeenCalledWith("/dossiers/d1/skills", [
      { candidate_skill_id: "s1", is_featured: false },
      { candidate_skill_id: "s2", is_featured: false },
    ]);
    expect(api.post).toHaveBeenCalledWith(
      "/dossiers/d1/generate",
      expect.objectContaining({
        system_template_key: "compact_esn",
        format: "docx",
      }),
    );
    expect(
      await screen.findByText(/Version adaptée générée/),
    ).toBeInTheDocument();
  });

  it("sends candidate and organization ids when a recruiter creates", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((path: string) => {
      if (path === "/dossiers") return Promise.resolve({ id: "d9" });
      if (path === "/dossiers/d9/generate")
        return Promise.resolve({ id: "doc9", file_format: "docx" });
      return Promise.resolve({});
    });
    vi.mocked(api.put).mockResolvedValue({});

    render(
      <DossierAdaptedEditor
        open
        onOpenChange={() => {}}
        target={{
          kind: "recruiter",
          orgId: "org1",
          candidateId: "cand1",
          candidateName: "Jane",
        }}
        experiences={experiences}
        skills={skills}
      />,
    );
    await screen.findByRole("checkbox", { name: "Inclure Dev - ACME" });
    await user.click(screen.getByRole("button", { name: /Compact/ }));
    await user.click(screen.getByRole("button", { name: /^Générer/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/dossiers",
        expect.objectContaining({
          candidate_id: "cand1",
          organization_id: "org1",
        }),
      ),
    );
  });
});
