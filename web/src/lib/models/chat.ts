import type { DateTime } from "luxon";

export type Chat = {
  id: number;
  created_at: DateTime;
  content: string;
  user_id: number;
  user_name?: string;
  avatar?: string;
  team_id: number;
  team_name?: string;
  game_id: number;
  game_name?: string;
  challenge_id: number;
  challenge_name?: string;
  checked: boolean;
  is_admin: boolean;
};

export type ChatSession = {
  challenge_id: number;
  challenge_name: string;
  team_id: number;
  team_name: string;
  game_id: number;
  game_name: string;
  checked: boolean;
  last_active_at: DateTime;
  last_message: string | null;
  last_user_id: number | null;
  last_message_id: number;
  is_admin: boolean;
};

export type ChatMessagePage = {
  items: Chat[];
  has_more: boolean;
};

export type ChatSessionPage = {
  items: ChatSession[];
  has_more: boolean;
  next_cursor: number | null;
};
