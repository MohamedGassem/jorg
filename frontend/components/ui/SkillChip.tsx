import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillProofState } from "@/lib/skill-proof";

const BASE =
  "inline-flex h-[22px] items-center gap-1 rounded-[5px] border px-2 font-mono text-[11px] font-medium transition-colors";

// Home-made proof seal (glyphe maison; lucide stays reserved for utilitarian
// actions). A scalloped disc reads as a wax seal / stamp of evidence. Filled
// for a featured proven skill, outlined for a plain proven one.
function Seal({ filled = false }: { filled?: boolean }) {
  const cx = 8;
  const cy = 8;
  const teeth = 12;
  const outer = 7.4;
  const inner = 6.2;
  const points: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / teeth) * i - Math.PI / 2;
    points.push(
      `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`,
    );
  }
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="shrink-0 text-primary"
    >
      <polygon
        points={points.join(" ")}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M5.4 8.1 7.1 9.8 10.6 6.2"
        fill="none"
        stroke={filled ? "var(--accent-soft)" : "currentColor"}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The three proof faces (plan décision 3). featured only fills the seal when
// the skill is also proven; a featured-but-declared skill stays visually
// declared and is merely sorted to the head of its group.
export interface SkillChipProof {
  state: SkillProofState;
  featured?: boolean;
  count?: number;
}

// `active` is only meaningful for the clickable filter variant, so the type
// only accepts it alongside `onClick`. `proof` selects the sealed variant.
type SkillChipProps =
  | {
      label: string;
      onClick: () => void;
      active?: boolean;
      proof?: never;
      onRemove?: never;
    }
  | {
      label: string;
      onRemove: () => void;
      onClick?: never;
      proof?: never;
      active?: never;
    }
  | {
      label: string;
      proof: SkillChipProof;
      onClick?: () => void;
      expanded?: boolean;
      active?: never;
      onRemove?: never;
    }
  | {
      label: string;
      onClick?: never;
      onRemove?: never;
      proof?: never;
      active?: never;
    };

function ProofChip(props: {
  label: string;
  proof: SkillChipProof;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const { label, proof, onClick, expanded } = props;
  const proven = proof.state === "proven";

  const skin = proven
    ? "border-primary bg-accent-soft text-ink"
    : "border-dashed border-line-strong bg-transparent text-ink-2";

  const inner = (
    <>
      {proven && <Seal filled={proof.featured} />}
      {label}
      {proven && proof.count != null && proof.count > 0 && (
        <span className="text-primary">×{proof.count}</span>
      )}
      {proof.state === "inferred" && (
        <span className="ml-0.5 rounded-[3px] bg-warn-soft px-1 py-px text-[9px] uppercase tracking-wide text-warn">
          à confirmer
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        className={cn(BASE, skin, "hover:border-primary")}
      >
        {inner}
      </button>
    );
  }
  return <span className={cn(BASE, skin)}>{inner}</span>;
}

export function SkillChip(props: SkillChipProps) {
  const { label } = props;

  if (props.proof) {
    return (
      <ProofChip
        label={label}
        proof={props.proof}
        onClick={props.onClick}
        expanded={props.expanded}
      />
    );
  }

  if (props.onClick) {
    const active = props.active;
    return (
      <button
        type="button"
        onClick={props.onClick}
        className={cn(
          BASE,
          active
            ? "border-primary bg-accent-soft text-primary"
            : "border-accent-line bg-accent-soft-2 text-primary hover:border-primary",
        )}
      >
        {label}
      </button>
    );
  }

  if (props.onRemove) {
    const { onRemove } = props;
    return (
      <span
        className={cn(BASE, "border-accent-line bg-accent-soft-2 text-primary")}
      >
        {label}
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-3 hover:text-primary"
          aria-label={`Retirer ${label}`}
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      </span>
    );
  }

  return (
    <span
      className={cn(BASE, "border-accent-line bg-accent-soft-2 text-primary")}
    >
      {label}
    </span>
  );
}
