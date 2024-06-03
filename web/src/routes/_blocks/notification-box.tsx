import { clearToasts, toastStore } from "@/lib/storage/toast";
import Button from "@/lib/widgets/button";
import Toast from "@/lib/widgets/toast";
import { t } from "@storage/theme";
import Card from "@widgets/card";
import Popover from "@widgets/popover";
import { For, Show } from "solid-js";

export function NotificationBoxContent() {
    return (
        <div class="flex flex-col space-y-2 max-w-96 w-[calc(100vw-1rem)]">
            <Card contentClass="p-2 h-12 flex flex-row items-center space-x-2">
                <h2 class="px-2 flex-1 flex items-center space-x-2 font-bold">
                    <span class="icon-[fluent--alert-20-regular] w-5 h-5" />
                    <Show
                        when={toastStore.toasts.length > 0}
                        fallback={<span class="opacity-60">{t("platform.noNotifications")}</span>}
                    >
                        <span>{t("platform.notificationBox")}</span>
                    </Show>
                </h2>
                <Show when={toastStore.toasts.length > 0}>
                    <Button size="sm" ghost level="info" onClick={() => clearToasts()}>
                        {t("platform.clearNotifications")}
                    </Button>
                </Show>
            </Card>
            <For each={toastStore.toasts}>{(toast) => <Toast toast={toast} />}</For>
        </div>
    );
}

export default function NotificationBox() {
    // Level colors
    // text-info text-warning text-primary text-error text-success
    return (
        <Popover
            btnContent={
                <span
                    class={`${
                        toastStore.toasts.length > 0
                            ? "icon-[fluent--alert-badge-20-filled] text-primary"
                            : "icon-[fluent--alert-20-regular]"
                    } w-5 h-5`}
                />
            }
            square
            ghost
            popContentClass="pt-2"
            title={t("platform.notificationBox")}
        >
            <NotificationBoxContent />
        </Popover>
    );
}
