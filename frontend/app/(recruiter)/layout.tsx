import { NavSidebar } from "@/components/nav-sidebar";

const recruiterNav = [
  { href: "/recruiter/dashboard", label: "Accueil" },
  { href: "/recruiter/candidates", label: "Candidats autorisés" },
  { href: "/recruiter/opportunities", label: "Missions" },
  { href: "/recruiter/documents", label: "Dossiers & modèles" },
  { href: "/recruiter/settings", label: "Équipe & organisation" },
];

export default function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      <NavSidebar
        items={recruiterNav}
        title="Espace recruteur"
        homeHref="/recruiter/dashboard"
      />
      <main className="flex-1 overflow-auto p-8" id="main-content">
        {children}
      </main>
    </div>
  );
}
