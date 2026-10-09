/**
 * DGD Division Standard eligibility (pure). Mirrors DGD D200/D300:
 * calendar-year age rule, play up always, never play down, cash never matters.
 */
export interface DgdDivision {
  code: string;
  competitive_class: "open" | "amateur" | "junior";
  skill_min: number | null;
  skill_max: number | null;
  age_min: number | null;
  age_max: number | null;
}

export interface PlayerSnapshot {
  /** DGD Rating at the event's eligibility snapshot; null for unrated players. */
  rating: number | null;
  /** Birth year only — exact birthday is never needed under the calendar-year rule. */
  birthYear: number | null;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/** Age a player reaches during the calendar year (D200.1). */
export function seasonAge(birthYear: number, seasonYear: number): number {
  return seasonYear - birthYear;
}

export function checkDivisionEligibility(div: DgdDivision, p: PlayerSnapshot, seasonYear: number): Eligibility {
  if (div.age_min != null) {
    if (p.birthYear == null) return { ok: false, reason: "Add your birth year to enter age-protected divisions." };
    if (seasonAge(p.birthYear, seasonYear) < div.age_min)
      return { ok: false, reason: `You become eligible for ${div.age_min}+ in the year you turn ${div.age_min}.` };
  }
  if (div.age_max != null && p.birthYear != null && seasonAge(p.birthYear, seasonYear) > div.age_max)
    return { ok: false, reason: `This division is for players ${div.age_max} and under.` };
  // Age divisions with a rating floor (MP30 950+, AM30 900+) require that rating.
  if (div.age_min != null && div.skill_min != null && (p.rating == null || p.rating < div.skill_min))
    return { ok: false, reason: `This division needs a DGD Rating of ${div.skill_min} or higher.` };
  // Playing down: rated above the band's cap. Below skill_min elsewhere is playing up, always allowed.
  if (div.skill_max != null && p.rating != null && p.rating > div.skill_max)
    return { ok: false, reason: `Your DGD Rating of ${p.rating} is above this division's ${div.skill_max} cap.` };
  return { ok: true };
}
