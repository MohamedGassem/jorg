import { NavSidebar } from "@/components/nav-sidebar";

const candidateNav = [
  { href: "/candidate/dashboard", label: "Accueil" },
  { href: "/candidate/profile", label: "Mon dossier" },
  { href: "/candidate/access", label: "Qui a accès" },
  { href: "/candidate/settings", label: "Compte & données" },
];

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      <NavSidebar
        items={candidateNav}
        title="Espace candidat"
        homeHref="/candidate/dashboard"
      />
      <main className="flex-1 overflow-auto p-8" id="main-content">
        {children}
      </main>
    </div>
  );
}
