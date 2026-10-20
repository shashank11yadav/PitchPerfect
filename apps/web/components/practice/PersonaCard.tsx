import type { ScenarioPublic } from "@pitchperfect/shared";
import { Sparkles } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

type Persona = Pick<ScenarioPublic, "personaName" | "personaTitle" | "companyType" | "personality">;

interface PersonaCardProps {
  persona: Persona;
  /** The name's element; a plain paragraph where a heading would break the page outline. */
  titleAs?: "h2" | "h3" | "p";
  className?: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** "Direct, time-pressed" becomes two chips. */
const traits = (personality: string) =>
  personality
    .split(/[,;]/)
    .map((trait) => trait.trim())
    .filter(Boolean);

/** Who the student is talking to. The persona has a human name but is always labelled as AI. */
export function PersonaCard({ persona, titleAs: Title = "h2", className }: PersonaCardProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("rounded-card border border-border bg-surface p-4", className)}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-linear-to-br from-primary to-navy font-display text-body font-semibold text-white"
        >
          {initials(persona.personaName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Title id={id} className="font-display text-body font-semibold text-navy">
              {persona.personaName}
            </Title>
            <Badge tone="info">
              <Sparkles aria-hidden="true" className="size-3" />
              AI practice partner
            </Badge>
          </div>
          <p className="text-small text-ink">{persona.personaTitle}</p>
          <p className="text-small text-muted">{persona.companyType}</p>
        </div>
      </div>
      <ul aria-label="Personality" className="mt-3 flex flex-wrap gap-1.5">
        {traits(persona.personality).map((trait) => (
          <li
            key={trait}
            className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-caption font-semibold text-ink"
          >
            {trait}
          </li>
        ))}
      </ul>
    </section>
  );
}
