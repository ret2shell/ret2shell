import { DateTime } from "luxon";

export function luxonReviver(key: string, value: unknown): unknown {
    if (key.endsWith("_at")) {
        if (typeof value === "number") {
            return DateTime.fromSeconds(value);
        }
    }
    return value;
}

export function luxonReplacer(key: string, value: string): unknown {
    if (key.endsWith("_at")) {
        return Math.round(DateTime.fromISO(value).toSeconds());
    }
    return value;
}
