// frontend/components/landing/LandingHero.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LandingDocumentPreview } from "@/components/landing/LandingDocumentPreview";

export function LandingHero() {
  return (
    <section className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
      <div className="text-center lg:text-left">
        <p className="j-overline">La plateforme de dossiers de compétences</p>
        <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-[44px] sm:leading-[1.15]">
          Un profil rempli une fois. Des dossiers prêts à envoyer en 30
          secondes.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-2 lg:mx-0">
          Le candidat maintient un profil unique : chaque accès est accordé
          explicitement, révocable à tout moment. L&apos;ESN en tire des
          dossiers de compétences sur mesure, adaptés au poste et au client.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
          <Link href="/register?role=candidate">
            <Button size="lg" className="w-full sm:w-auto">
              Créer mon profil
            </Button>
          </Link>
          <Link href="/register?role=recruiter">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Demander un accès recruteur
            </Button>
          </Link>
        </div>
      </div>
      <LandingDocumentPreview />
    </section>
  );
}
