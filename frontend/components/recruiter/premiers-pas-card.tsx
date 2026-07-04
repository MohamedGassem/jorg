// Bloc "Premiers pas" du dashboard recruteur (plan refonte-onboarding.md, 2.2.2).
// Enseigne le geste central : inviter un candidat -> recevoir son accord ->
// générer un premier dossier. Chaque jalon reflète l'état réel des actions
// propres au recruteur (voir recruiterMilestones) et porte l'action directe.
// Disparaît une fois les 3 jalons faits (géré par le parent) ou au dismiss.
"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecruiterMilestones } from "@/lib/premiers-pas";

interface Step {
  key: keyof RecruiterMilestones;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    key: "invited",
    title: "Inviter un candidat",
    description:
      "Envoyez une invitation : le candidat garde le contrôle de son accord.",
  },
  {
    key: "accepted",
    title: "Recevoir son accord",
    description:
      "Son dossier devient consultable uniquement après son autorisation.",
  },
  {
    key: "generated",
    title: "Générer un premier dossier",
    description: "Composez un dossier ciblé à partir de ses données vérifiées.",
  },
];

export function PremiersPasCard({
  milestones,
  onInvite,
  onDismiss,
}: {
  milestones: RecruiterMilestones;
  onInvite: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="rounded-lg border border-accent-line bg-accent-soft-2 px-[22px] py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="j-overline">Premiers pas</p>
          <h2 className="mt-1 font-heading text-[17px] font-semibold">
            Prenez la main en trois gestes
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Masquer les premiers pas"
          className="grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface hover:text-ink"
        >
          <X className="size-4" strokeWidth={1.6} />
        </button>
      </div>

      <ol className="mt-4 flex flex-col gap-2.5">
        {STEPS.map((step, i) => {
          const done = milestones[step.key];
          return (
            <li
              key={step.key}
              className="flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-[26px] shrink-0 place-items-center rounded-full border font-mono text-[12.5px] font-semibold",
                  done
                    ? "border-positive-border bg-positive-soft text-positive"
                    : "border-line-strong bg-paper-2 text-ink-3",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={2} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    done && "text-ink-3 line-through",
                  )}
                >
                  {step.title}
                </p>
                {!done && (
                  <p className="mt-0.5 text-[12.5px] leading-5 text-ink-3">
                    {step.description}
                  </p>
                )}
              </div>
              {!done && step.key === "invited" && (
                <button
                  type="button"
                  onClick={onInvite}
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "shrink-0 self-center",
                  )}
                >
                  Inviter
                </button>
              )}
              {!done && step.key === "generated" && (
                <Link
                  href="/recruiter/candidates"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "shrink-0 self-center",
                  )}
                >
                  Composer
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
