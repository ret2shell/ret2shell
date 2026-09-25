import { DateTime } from "luxon";
import { nanoid } from "nanoid";
import { createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";

export type ToastMessage = {
  id?: string;
  img?: string;
  description: string;
  level: "info" | "success" | "warning" | "error";
  duration?: number;
  reject?: () => void;
  rejectLabel?: string;
  accept?: () => void;
  acceptLabel?: string;
  createdAt?: number;
  shown?: boolean;
};

const toastRoot = createRoot(() =>
  createStore({
    toasts: [] as ToastMessage[],
  })
);

export const toastStore = toastRoot[0];
export const setToastStore = toastRoot[1];

export function addToast(toast: ToastMessage): string {
  const id = nanoid();
  setToastStore(
    produce((s) =>
      s.toasts.push({
        ...toast,
        id,
        createdAt: DateTime.now().toMillis(),
        shown: true,
      })
    )
  );
  return id;
}

export function removeToast(id: string) {
  setToastStore(
    produce((s) => {
      s.toasts = s.toasts.filter((toast) => toast.id !== id);
    })
  );
}

export function clearToasts() {
  setToastStore({ toasts: [] });
}
