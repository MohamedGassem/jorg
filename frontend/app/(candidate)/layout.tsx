import { CandidateAppBar } from "@/components/app-bar";

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <CandidateAppBar />
      <main className="min-w-0 flex-1 px-7 py-[26px]" id="main-content">
        {children}
      </main>
    </div>
  );
}
