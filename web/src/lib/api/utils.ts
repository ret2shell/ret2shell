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

export async function handleHttpError(err: Error, tip: string) {
  if (err instanceof HTTPError) {
    try {
      const text = typeof err.data === "string" ? err.data : JSON.stringify(err.data);
      toastError(`${tip}: ${text}`);
    } catch {}
  } else {
    toastError((err as Error).toString());
  }
}
