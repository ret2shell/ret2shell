import type { DateTime } from "luxon";

export type Notification = {
    id: number;
    title: string;
    content: string;
    published_at: DateTime;
    game_id: number;
    publisher_id: number;
    publisher_name?: string;
};
