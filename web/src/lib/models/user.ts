import type { DateTime } from "luxon";
import { t } from "../storage/theme";

export enum Permission {
  Basic = 0,
  Verified = 1,
  Calendar = 2,
  Wiki = 3,
  Bulletin = 4,
  Game = 5,
  Host = 6,
  User = 7,
  Statistics = 8,
  DevOps = 9,
}

export type User = {
  id: number;
  registered_at: DateTime;
  account: string;
  nickname: string;
  email: string | null;
  description: string | null;
  avatar: string | null;
  institute_id: number | null;
  institute_name?: string;
  permissions: Permission[];
  hidden: boolean;
  banned: boolean;
};

export function permissionToString(permission: Permission): string {
  switch (permission) {
    case Permission.Basic:
      return t("account.permission.basic")!;
    case Permission.Verified:
      return t("account.permission.verified")!;
    case Permission.Calendar:
      return t("account.permission.calendar")!;
    case Permission.Wiki:
      return t("account.permission.wiki")!;
    case Permission.Bulletin:
      return t("account.permission.bulletin")!;
    case Permission.Game:
      return t("account.permission.game")!;
    case Permission.Host:
      return t("account.permission.host")!;
    case Permission.User:
      return t("account.permission.user")!;
    case Permission.Statistics:
      return t("account.permission.statistics")!;
    case Permission.DevOps:
      return t("account.permission.devOps")!;
  }
}

export function permissionToIcon(permission: Permission): string {
  switch (permission) {
    case Permission.Basic:
      return "icon-[fluent--person-20-filled] w-5 h-5 text-primary";
    case Permission.Verified:
      return "icon-[fluent--checkmark-circle-20-filled] w-5 h-5 text-success";
    case Permission.Calendar:
      return "icon-[fluent--calendar-20-filled] w-5 h-5 text-info";
    case Permission.Wiki:
      return "icon-[fluent--book-number-20-filled] w-5 h-5 text-info";
    case Permission.Bulletin:
      return "icon-[fluent--megaphone-20-filled] w-5 h-5 text-info";
    case Permission.Game:
      return "icon-[fluent--flag-20-filled] w-5 h-5 text-info";
    case Permission.Host:
      return "icon-[fluent--desktop-20-filled] w-5 h-5 text-info";
    case Permission.User:
      return "icon-[fluent--people-20-filled] w-5 h-5 text-info";
    case Permission.Statistics:
      return "icon-[fluent--data-pie-20-filled] w-5 h-5 text-info";
    case Permission.DevOps:
      return "icon-[fluent--settings-20-filled] w-5 h-5 text-error";
  }
}

export type Token = {
  id: number;
  account: string;
  nickname: string;
  permissions: Permission[];
};
