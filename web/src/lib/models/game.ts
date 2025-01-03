import type { DateTime } from "luxon";

export enum HostType {
  Training = 0,
  Game = 1,
}

export type GameAccessPolicy = {
  restrict: boolean;
  institutes: number[];
  sync: number;
};

export type Game = {
  id: number;
  updated_at: DateTime;
  name: string;
  brief: string;
  introduction_id: number | null;
  start_at: DateTime;
  end_at: DateTime;
  register_at: DateTime;
  archive_at: DateTime;
  hidden: boolean;
  offline: boolean;
  frozen: boolean;
  host_type: HostType;
  team_size: number;
  access_policy: GameAccessPolicy;
  cover: string | null;
  logo: string | null;
  enable_audit: boolean;
  can_register_after_started: boolean;
  award_rate: number;
  award_rates: number[];
  admins: number[];
  weight: number;
  token: string | null;
  bucket: string | null;
  timeline_presets: {
    label: string;
    start_at: DateTime;
    end_at: DateTime;
  }[];
  node_selector: string | null;
  traffic: string | null;
};
