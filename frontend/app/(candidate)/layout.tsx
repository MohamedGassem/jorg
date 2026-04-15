// frontend/app/(candidate)/layout.tsx
import { NavSidebar } from "@/components/nav-sidebar";

const candidateNav = [
  { href: "/candidate/profile", label: "Mon profil" },
  { href: "/candidate/requests", label: "Invitations" },
  { href: "/candidate/access", label: "Accès accordés" },
  { href: "/candidate/history", label: "Historique" },
];

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <NavSidebar items={candidateNav} title="Espace candidat" />
      <main className="flex-1 overflow-auto p-8" id="main-content">
        {children}
      </main>
    </div>
  );
}
