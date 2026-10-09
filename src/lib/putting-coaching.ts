// Digital Putting Green coaching engine.
// Generates distance-aware drills and evaluates progress from logged putts.

export type PuttMarker = {
  distance_ft: number;
  latitude: number;
  longitude: number;
  set_at: string;
};

export type PuttRecord = {
  distance_ft: number;
  made: boolean;
  drill_id: string | null;
  created_at: string;
};

export type Drill = {
  id: string;
  title: string;
  coach: string;
  target_distance_ft: number;
  goal_makes: number;
  goal_attempts?: number; // if set, must be met in a rolling window
  category: "warmup" | "consistency" | "circle1" | "circle2" | "streak" | "pressure" | "daily";
  reward_xp: number;
  achievement?: string; // optional badge name unlocked on completion
};

const DEFAULT_MARKERS = [15, 20, 30, 40, 50];

export function suggestMarkers(): number[] {
  return DEFAULT_MARKERS;
}

/**
 * Great-circle distance in feet. Good enough for putt-length ranges.
 */
export function haversineFt(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 20902231; // Earth radius in feet
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Given basket + placed markers + player position, returns nearest marker & distance to basket.
 */
export function nearestMarker(
  markers: PuttMarker[],
  position: { latitude: number; longitude: number },
): PuttMarker | null {
  if (!markers.length) return null;
  let best: PuttMarker | null = null;
  let bestDist = Infinity;
  for (const m of markers) {
    const d = haversineFt(m, position);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

/**
 * Build the drill roster for a session. Balanced across warm-up, C1, C2, streaks and pressure work.
 */
export function buildDrills(markers: PuttMarker[]): Drill[] {
  const distances = markers.map((m) => m.distance_ft).sort((a, b) => a - b);
  const has = (d: number) => distances.some((x) => Math.abs(x - d) <= 3);
  const drills: Drill[] = [];

  // Warm-up (inside Circle 1)
  drills.push({
    id: "warmup_10_at_15",
    title: "Warm-Up: 10 makes from 15 ft",
    coach:
      "Start close and stay smooth. Groove your form with 10 clean makes at 15 feet before stepping back.",
    target_distance_ft: 15,
    goal_makes: 10,
    category: "warmup",
    reward_xp: 25,
  });

  // Daily consistency
  drills.push({
    id: "daily_100_putts",
    title: "Daily 100: Put in 100 total makes today",
    coach:
      "The single best putting drill in disc golf. Reps build confidence. Stack 100 makes across any distance in one day.",
    target_distance_ft: 20,
    goal_makes: 100,
    category: "daily",
    reward_xp: 200,
    achievement: "Daily Century",
  });

  // Circle 1 mastery
  if (has(20)) {
    drills.push({
      id: "c1_25_at_20",
      title: "Circle 1 Lock-In: 25 from 20 ft",
      coach:
        "This is money range. Chain 25 makes at 20 ft. If you miss, don't reset the counter — but note whether you missed high, low, left or right.",
      target_distance_ft: 20,
      goal_makes: 25,
      category: "circle1",
      reward_xp: 60,
    });
  }
  drills.push({
    id: "c1_pressure_5",
    title: "Pressure 5 at 30 ft",
    coach:
      "Make 5 in a row from 30 feet. Miss one, start over. Simulate needing a putt to win the hole.",
    target_distance_ft: 30,
    goal_makes: 5,
    goal_attempts: 5,
    category: "pressure",
    reward_xp: 80,
  });

  // Streak
  drills.push({
    id: "streak_15_at_25",
    title: "Streak Drill: 15 in a row @ ~25 ft",
    coach:
      "Confidence work. String 15 straight makes. Reset on any miss. Slow your breath between putts.",
    target_distance_ft: 25,
    goal_makes: 15,
    category: "streak",
    reward_xp: 90,
  });

  // Circle 2 stretch
  if (has(40)) {
    drills.push({
      id: "c2_10_at_40",
      title: "Circle 2 Confidence: 10 makes at 40 ft",
      coach:
        "C2 is where rounds are won. Take your time, commit to a line, and bank 10 makes at 40 feet.",
      target_distance_ft: 40,
      goal_makes: 10,
      category: "circle2",
      reward_xp: 120,
    });
  }
  if (has(50)) {
    drills.push({
      id: "long_10_at_50",
      title: "Long-Range Slam: 10 makes at 50 ft",
      coach:
        "Full send. Read the wind, pick a chain, and make 10 putts from 50 feet in a single day to unlock the badge.",
      target_distance_ft: 50,
      goal_makes: 10,
      category: "circle2",
      reward_xp: 250,
      achievement: "Deep Threat",
    });
  }

  // Wind + comeback layered on if we ever want to expand — leave hooks here.
  return drills;
}

/**
 * Progress evaluator. Handles ordinary "N makes at ~D ft" drills plus streak-style drills that reset on a miss.
 */
export function evaluateDrill(
  drill: Drill,
  putts: PuttRecord[],
): {
  makes: number;
  total: number;
  currentStreak: number;
  bestStreak: number;
  complete: boolean;
  progressPct: number;
} {
  const withinTarget = (p: PuttRecord) => {
    // Warm-up and streak-type drills gate strictly by distance;
    // "Daily 100" counts every make anywhere on the green.
    if (drill.id === "daily_100_putts") return true;
    return Math.abs(p.distance_ft - drill.target_distance_ft) <= 5;
  };

  const relevant = putts.filter((p) => p.drill_id === drill.id || withinTarget(p));

  let makes = 0;
  let total = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  for (const p of relevant) {
    total += 1;
    if (p.made) {
      makes += 1;
      currentStreak += 1;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  let complete = false;
  if (drill.category === "streak" || drill.category === "pressure") {
    complete = bestStreak >= drill.goal_makes;
  } else {
    complete = makes >= drill.goal_makes;
  }
  const progressPct = Math.min(
    100,
    drill.category === "streak" || drill.category === "pressure"
      ? Math.round((bestStreak / drill.goal_makes) * 100)
      : Math.round((makes / drill.goal_makes) * 100),
  );
  return { makes, total, currentStreak, bestStreak, complete, progressPct };
}

export function bucketByDistance(
  putts: PuttRecord[],
): { bucket: string; distance: number; makes: number; total: number; pct: number }[] {
  const buckets = [
    { bucket: "10-19 ft", distance: 15, min: 10, max: 19 },
    { bucket: "20-29 ft", distance: 25, min: 20, max: 29 },
    { bucket: "30-39 ft", distance: 35, min: 30, max: 39 },
    { bucket: "40-49 ft", distance: 45, min: 40, max: 49 },
    { bucket: "50+ ft", distance: 55, min: 50, max: 999 },
  ];
  return buckets.map((b) => {
    const inBucket = putts.filter((p) => p.distance_ft >= b.min && p.distance_ft <= b.max);
    const makes = inBucket.filter((p) => p.made).length;
    const total = inBucket.length;
    return {
      bucket: b.bucket,
      distance: b.distance,
      makes,
      total,
      pct: total ? Math.round((makes / total) * 100) : 0,
    };
  });
}
