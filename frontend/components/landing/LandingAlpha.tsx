// frontend/components/landing/LandingAlpha.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingAlpha() {
  return (
    <section className="border-t border-line bg-paper-2">
      <div className="mx-auto max-w-5xl px-6 py-14 text-center">
        <p className="j-overline">Accès privé · alpha</p>
        <h2 className="mt-3 font-heading text-2xl font-semibold">
          L&apos;espace recruteur s&apos;ouvre sur demande
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-[15px] text-ink-2">
          Demandez votre code d&apos;accès : il rattache votre compte à votre
          organisation. Les candidats peuvent créer leur dossier dès maintenant.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/register?role=recruiter">
            <Button size="lg" className="w-full sm:w-auto">
              Demander un accès recruteur
            </Button>
          </Link>
          <Link href="/register?role=candidate">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Créer mon dossier de compétences
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
