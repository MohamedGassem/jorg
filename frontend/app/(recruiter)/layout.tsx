// frontend/app/(recruiter)/layout.tsx
import { NavSidebar } from "@/components/nav-sidebar";

const recruiterNav = [
  { href: "/recruiter/dashboard", label: "Tableau de bord" },
  { href: "/recruiter/candidates", label: "Candidats" },
  { href: "/recruiter/opportunities", label: "Opportunités" },
  { href: "/recruiter/documents", label: "Dossiers" },
  { href: "/recruiter/settings", label: "Configuration" },
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
