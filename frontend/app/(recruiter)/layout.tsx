import { RecruiterAppBar } from "@/components/app-bar";
import { AppLegalFooter } from "@/components/AppLegalFooter";
import { RecruiterWorkspaceProvider } from "@/components/recruiter-workspace";

export default function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RecruiterWorkspaceProvider>
      <div className="flex min-h-dvh flex-col bg-background">
        <RecruiterAppBar />
        <main
          className="mx-auto w-full min-w-0 max-w-[var(--shell)] flex-1 px-7 py-[26px]"
          id="main-content"
        >
          {children}
        </main>
        <AppLegalFooter />
      </div>
    </RecruiterWorkspaceProvider>
  );
}
