import { setToastStore, toastStore } from "@/lib/storage/toast";
import Toast from "@/lib/widgets/toast";
import { For } from "solid-js";
import { TransitionGroup } from "solid-transition-group";

export default function () {
    const toasts = () => toastStore.toasts.filter((toast) => toast.shown !== false);
    return (
        <div class="fixed bottom-0 right-0 p-2 max-w-96 w-[calc(100vw-1rem)] flex flex-col space-y-2">
            <TransitionGroup name="toast">
                <For each={toasts()}>
                    {(toast) => (
                        <Toast
                            toast={toast}
                            selfDestroy
                            onTimeout={() => {
                                setToastStore({
                                    toasts: toastStore.toasts.map((t) => {
                                        if (t.id === toast.id) {
                                            return { ...t, shown: false };
                                        }
                                        return t;
                                    }),
                                });
                            }}
                        />
                    )}
                </For>
            </TransitionGroup>
        </div>
    );
}
