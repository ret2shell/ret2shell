import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import { HTTPError } from "ky";

export function toastSuccess(description: string, duration = 5000) {
  addToast({
    level: "success",
    description,
    duration,
  });
}

export function toastError(description: string, duration = 5000) {
  addToast({
    level: "error",
    description,
    duration,
  });
}

// A single challenge switch can fire several requests, so rate-limit failures
// tend to arrive in bursts. Coalesce them into one toast.
const RATE_LIMIT_TOAST_COOLDOWN_MS = 3000;
let lastRateLimitToastAt = 0;

function retryAfterSeconds(response: Response): number {
  const raw = response.headers.get("retry-after") ?? response.headers.get("x-ratelimit-after") ?? "";
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export async function handleHttpError(err: unknown, tip: string) {
  if (err instanceof HTTPError) {
    // 429 is a transient, retryable condition. Show a localized message
    // instead of the raw backend text so a burst of requests does not spam
    // the player with errors.
    if (err.response.status === 429) {
      const now = Date.now();
      if (now - lastRateLimitToastAt < RATE_LIMIT_TOAST_COOLDOWN_MS) {
        return;
      }
      lastRateLimitToastAt = now;

      const seconds = retryAfterSeconds(err.response);
      addToast({
        level: "warning",
        description:
          seconds > 0
            ? t("general.network.status.429.message", { seconds })
            : t("general.network.status.429.messageGeneric"),
        duration: 5000,
      });
      return;
    }

    try {
      const text = typeof err.data === "string" ? err.data : JSON.stringify(err.data);
      toastError(`${tip}: ${text}`);
    } catch {}
  } else if (err instanceof Error) {
    toastError(err.toString());
  } else {
    toastError(`${tip}: ${String(err)}`);
  }
}
