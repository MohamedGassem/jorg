// frontend/components/landing/LandingHero.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 text-center">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
        La plateforme de dossiers de compétences
      </p>
      <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Construisez votre dossier de compétences une fois.
        <br />
        Partagez-le en toute sécurité.
        <br />
        Générez des dossiers sur mesure en quelques secondes.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
        Les candidats réécrivent sans cesse les mêmes informations dans leurs
        CVs et dossiers de compétences. Jorg simplifie ça&nbsp;&mdash; pour tout
        le monde.
      </p>
      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
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
    </section>
  );
}
