/**
 * Centralized tuning numbers for the time-travel coach's personal life/career
 * layer (docs/CAREER_LIFE_ROADMAP.md). One file so later phases (B-F) don't
 * each invent their own magic numbers scattered across modules.
 *
 * This file only grows as later roadmap steps land; it intentionally starts
 * small with just what phase A needs.
 */

/** Starting age when a new time-travel career begins. */
export const COACH_START_AGE = 35;

/** Mandatory retirement age (roadmap B7). */
export const COACH_RETIRE_AGE = 70;

export const COACH_START_REPUTATION = 50;
export const COACH_START_MOOD = 60;

/** The four perk lines from the roadmap: tactics / player development / negotiation / media. */
export const COACH_PERK_LINES = ["tactics", "development", "negotiation", "media"];

/** Each perk line caps at 3 levels (roadmap §2.3). */
export const COACH_PERK_MAX_LEVEL = 3;

/** Flat XP curve for now: level N needs N * this much XP to reach N+1. Can grow a real curve later. */
export const COACH_XP_PER_LEVEL = 100;

/** Energy granted at the start of each in-season week (roadmap §2.1). */
export const WEEKLY_ENERGY = 3;

/** Energy granted once per offseason (roadmap §2.1). */
export const OFFSEASON_ENERGY = 10;
