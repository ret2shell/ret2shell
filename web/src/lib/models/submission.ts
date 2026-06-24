import type { DateTime } from "luxon";

export type Submission = {
  id: number;
  created_at: DateTime;
  user_id: number;
  user_name?: string;
  team_id: number;
  team_name?: string;
  challenge_id: number;
  challenge_name?: string;
  content: string | null;
  score?: number;
  solved: boolean | null;
  result: string | null;
  is_llm_used: boolean | null;
};
