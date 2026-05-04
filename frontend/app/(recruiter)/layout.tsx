// frontend/app/(recruiter)/layout.tsx
import { NavSidebar } from "@/components/nav-sidebar";

const recruiterNav = [
  { href: "/recruiter/templates", label: "Templates" },
  { href: "/recruiter/invitations", label: "Invitations" },
  { href: "/recruiter/candidates", label: "Candidats" },
  { href: "/recruiter/opportunities", label: "Opportunités" },
  { href: "/recruiter/generate", label: "Générer" },
  { href: "/recruiter/history", label: "Historique" },
];

export default function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      <NavSidebar items={recruiterNav} title="Espace recruteur" />
      <main className="flex-1 overflow-auto p-8" id="main-content">
        {children}
      </main>
    </div>
  );
}
