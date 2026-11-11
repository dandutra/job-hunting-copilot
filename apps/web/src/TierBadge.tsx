import "./tiers.css";

export type Tier = "A" | "B" | "C";

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`tier tier-${tier}`}>
      <span className="visually-hidden">Tier </span>
      {tier}
    </span>
  );
}
