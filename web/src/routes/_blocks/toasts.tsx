import { setToastStore, toastStore } from "@storage/toast";
import Toast from "@widgets/toast";
import { TransitionGroup } from "@widgets/transition";
import { For } from "solid-js";

export default function () {
  const toasts = () => toastStore.toasts.filter((toast) => toast.shown !== false);
  return (
    <div class="fixed bottom-0 right-0 p-2 max-w-96 w-[calc(100vw-1rem)] flex flex-col space-y-2">
      <TransitionGroup name="fade-group-right">
        <For each={toasts()}>
          {(toast) => (
            <Toast
              class="fade-group-right"
              toast={toast}
              selfDestroy
              onTimeout={() => {
                setToastStore((s) => {
                  s.toasts = s.toasts.map((t) => (t.id === toast.id ? { ...t, shown: false } : t));
                });
              }}
            />
          )}
        </For>
      </TransitionGroup>
    </div>
  );
}
