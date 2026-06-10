import { RecruiterAppBar } from "@/components/app-bar";

export default function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <RecruiterAppBar />
      <main className="min-w-0 flex-1 px-7 py-[26px]" id="main-content">
        {children}
      </main>
    </div>
  );
}
