import type { DateTime } from "luxon";

export type Milestone = {
  id: number;
  created_at: DateTime;
  updated_at: DateTime;
  game_id: number;
  prerequisites: number[];
  unlock_limit: number;
  avatar: string | null;
  bonus_score: number;
  name: string;
  description: string;
  /// Manual position on the milestone graph in logical grid units;
  /// `null` means the automatic layout owns this node.
  layout_col: number | null;
  layout_row: number | null;
};
