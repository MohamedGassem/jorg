import { NavSidebar } from "@/components/nav-sidebar";

const recruiterNav = [
  { href: "/recruiter/dashboard", label: "Accueil" },
  { href: "/recruiter/candidates", label: "Candidats" },
  { href: "/recruiter/opportunities", label: "Missions" },
  { href: "/recruiter/documents", label: "Dossiers & modèles" },
  { href: "/recruiter/settings", label: "Organisation" },
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
      <main
        className="min-w-0 flex-1 overflow-auto p-5 md:p-6 xl:p-8"
        id="main-content"
      >
        {children}
      </main>
    </div>
  );
}
