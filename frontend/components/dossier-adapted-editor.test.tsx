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
    delete: vi.fn(),
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

  it("lists saved versions with the base pinned first", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/templates/builtin")
        return Promise.resolve([
          { key: "compact_esn", name: "Compact", description: "Format court" },
        ]);
      if (path === "/dossiers/general")
        return Promise.resolve({
          id: "base",
          name: null,
          is_general: true,
          created_at: "2020-01-01",
        });
      if (path === "/dossiers")
        return Promise.resolve([
          {
            id: "d1",
            name: "Version data",
            is_general: false,
            created_at: "2024-01-01",
          },
          {
            id: "base",
            name: null,
            is_general: true,
            created_at: "2020-01-01",
          },
        ]);
      return Promise.resolve([]);
    });
    renderSelf();

    const nav = await screen.findByRole("region", {
      name: "Versions adaptées",
    });
    const items = within(nav).getAllByRole("button", {
      name: /Base|Version data/,
    });
    expect(items[0]).toHaveTextContent("Base");
    expect(within(nav).getByText("Version data")).toBeInTheDocument();
  });

  it("loads a version composition when selected", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/templates/builtin")
        return Promise.resolve([
          { key: "compact_esn", name: "Compact", description: "x" },
        ]);
      if (path === "/dossiers/general")
        return Promise.resolve({
          id: "base",
          name: null,
          is_general: true,
          created_at: "2020-01-01",
        });
      if (path === "/dossiers")
        return Promise.resolve([
          {
            id: "d1",
            name: "Version data",
            is_general: false,
            created_at: "2024-01-01",
          },
          {
            id: "base",
            name: null,
            is_general: true,
            created_at: "2020-01-01",
          },
        ]);
      if (path === "/dossiers/d1")
        return Promise.resolve({
          id: "d1",
          name: "Version data",
          objectif: "Obj",
          accroche: null,
          share_contact: true,
          share_finances: true,
          is_general: false,
          experience_selections: [
            { experience_id: "e2", position: 0, is_featured: true },
          ],
          skill_selections: [],
        });
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderSelf();

    const nav = await screen.findByRole("region", {
      name: "Versions adaptées",
    });
    await user.click(within(nav).getByRole("button", { name: "Version data" }));

    expect(await screen.findByDisplayValue("Version data")).toBeInTheDocument();
    // e2 selected and featured, e1 excluded
    const preview = screen.getByRole("region", {
      name: "Aperçu de la structure",
    });
    expect(within(preview).getByText("Lead - Globex")).toBeInTheDocument();
    expect(within(preview).queryByText("Dev - ACME")).not.toBeInTheDocument();
  });

  it("saves a new version via POST then PUT and marks it saved", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/templates/builtin")
        return Promise.resolve([
          { key: "compact_esn", name: "Compact", description: "x" },
        ]);
      if (path === "/dossiers/general")
        return Promise.resolve({
          id: "base",
          name: null,
          is_general: true,
          created_at: "2020-01-01",
        });
      if (path === "/dossiers") return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(api.post).mockResolvedValue({ id: "dN" });
    vi.mocked(api.put).mockResolvedValue({});
    const user = userEvent.setup();
    renderSelf();

    await user.type(
      await screen.findByLabelText("Nom de la version"),
      "Ma version",
    );
    expect(
      screen.getByText(/Modifications non enregistrées/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/dossiers",
        expect.objectContaining({ name: "Ma version" }),
      ),
    );
    expect(api.put).toHaveBeenCalledWith(
      "/dossiers/dN/experiences",
      expect.any(Array),
    );
    expect(api.put).toHaveBeenCalledWith(
      "/dossiers/dN/skills",
      expect.any(Array),
    );
    expect(await screen.findByText(/Enregistré/)).toBeInTheDocument();
  });

  it("updates an existing version via PATCH", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/templates/builtin")
        return Promise.resolve([
          { key: "compact_esn", name: "Compact", description: "x" },
        ]);
      if (path === "/dossiers/general")
        return Promise.resolve({
          id: "base",
          name: null,
          is_general: true,
          created_at: "2020-01-01",
        });
      if (path === "/dossiers")
        return Promise.resolve([
          {
            id: "d1",
            name: "Version data",
            is_general: false,
            created_at: "2024-01-01",
          },
          {
            id: "base",
            name: null,
            is_general: true,
            created_at: "2020-01-01",
          },
        ]);
      if (path === "/dossiers/d1")
        return Promise.resolve({
          id: "d1",
          name: "Version data",
          objectif: null,
          accroche: null,
          share_contact: true,
          share_finances: true,
          is_general: false,
          experience_selections: [],
          skill_selections: [],
        });
      return Promise.resolve([]);
    });
    vi.mocked(api.patch).mockResolvedValue({});
    vi.mocked(api.put).mockResolvedValue({});
    const user = userEvent.setup();
    renderSelf();

    const nav = await screen.findByRole("region", {
      name: "Versions adaptées",
    });
    await user.click(within(nav).getByRole("button", { name: "Version data" }));
    await screen.findByDisplayValue("Version data");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/dossiers/d1",
        expect.any(Object),
      ),
    );
  });

  it("deletes an adapted version after confirmation and not the base", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/templates/builtin")
        return Promise.resolve([
          { key: "compact_esn", name: "Compact", description: "x" },
        ]);
      if (path === "/dossiers/general")
        return Promise.resolve({
          id: "base",
          name: null,
          is_general: true,
          created_at: "2020-01-01",
        });
      if (path === "/dossiers")
        return Promise.resolve([
          {
            id: "d1",
            name: "Version data",
            is_general: false,
            created_at: "2024-01-01",
          },
          {
            id: "base",
            name: null,
            is_general: true,
            created_at: "2020-01-01",
          },
        ]);
      return Promise.resolve([]);
    });
    vi.mocked(api.delete).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderSelf();

    const nav = await screen.findByRole("region", {
      name: "Versions adaptées",
    });
    // Base has no delete control.
    expect(
      within(nav).queryByRole("button", { name: "Supprimer Base" }),
    ).not.toBeInTheDocument();

    await user.click(
      within(nav).getByRole("button", { name: "Supprimer Version data" }),
    );
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/dossiers/d1"),
    );
  });

  it("generates a clean saved version without re-saving", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/templates/builtin")
        return Promise.resolve([
          { key: "compact_esn", name: "Compact", description: "x" },
        ]);
      if (path === "/dossiers/general")
        return Promise.resolve({
          id: "base",
          name: null,
          is_general: true,
          created_at: "2020-01-01",
        });
      if (path === "/dossiers")
        return Promise.resolve([
          {
            id: "d1",
            name: "Version data",
            is_general: false,
            created_at: "2024-01-01",
          },
          {
            id: "base",
            name: null,
            is_general: true,
            created_at: "2020-01-01",
          },
        ]);
      if (path === "/dossiers/d1")
        return Promise.resolve({
          id: "d1",
          name: "Version data",
          objectif: null,
          accroche: null,
          share_contact: true,
          share_finances: true,
          is_general: false,
          experience_selections: [],
          skill_selections: [],
        });
      return Promise.resolve([]);
    });
    vi.mocked(api.post).mockResolvedValue({ id: "doc1", file_format: "docx" });
    vi.mocked(api.patch).mockResolvedValue({});
    vi.mocked(api.put).mockResolvedValue({});
    const user = userEvent.setup();
    renderSelf();

    const nav = await screen.findByRole("region", {
      name: "Versions adaptées",
    });
    await user.click(within(nav).getByRole("button", { name: "Version data" }));
    await screen.findByDisplayValue("Version data");
    await user.click(screen.getByRole("button", { name: /Compact/ }));
    await user.click(screen.getByRole("button", { name: /^Générer/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/dossiers/d1/generate",
        expect.any(Object),
      ),
    );
    expect(api.patch).not.toHaveBeenCalled(); // clean version: no re-save
  });
});
