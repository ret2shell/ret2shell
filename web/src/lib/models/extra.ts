import type { DateTime } from "luxon";

export type Extra = {
  id: number;
  created_at: DateTime;
  reason: string;
  score: number;
  hint_id: number | null;
  team_id: number;
  team_name?: string;
  challenge_id: number | null;
  challenge_name?: string;
  blood_state: number | null;
};
