import { Markdown } from "@/lib/markdown";
import type { Notification } from "@/lib/models/notification";
import { Permission } from "@/lib/models/user";
import { accountStore } from "@/lib/storage/account";
import { gameStore } from "@/lib/storage/game";
import { fullTheme, t } from "@/lib/storage/theme";
import Button from "@/lib/widgets/button";
import Card from "@/lib/widgets/card";
import Divider from "@/lib/widgets/divider";
import Editor from "@/lib/widgets/editor";
import Input from "@/lib/widgets/input";
import Popover from "@/lib/widgets/popover";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createSignal } from "solid-js";

export default function () {
    const [notifications, setNotifications] = createSignal([
        {
            id: 1,
            title: "Test",
            content: "Test Content",
            published_at: DateTime.now(),
            game_id: 1,
            publisher_id: 1,
            publisher_name: "Reverier Xu",
        },
    ] as Notification[]);
    return (
        <div class="w-full h-full overflow-hidden">
            <OverlayScrollbarsComponent
                options={{
                    scrollbars: {
                        theme: `os-theme-${fullTheme()}`,
                        autoHide: "scroll",
                    },
                }}
                class="relative w-full h-full print:h-auto print:overflow-auto"
                defer
            >
                <div class="flex flex-col space-y-2 p-3 lg:p-6">
                    <Show
                        when={
                            accountStore.id &&
                            gameStore.current?.admins.includes(accountStore.id) &&
                            accountStore.permissions.includes(Permission.Game)
                        }
                    >
                        <Popover
                            btnContent={
                                <>
                                    <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                                    <span>{t("form.create")}</span>
                                </>
                            }
                        >
                            <Card class="w-96" contentClass="p-2 flex flex-col space-y-2">
                                {/* TODO: use form here */}
                                {/* <Input
                                    extraBtn={
                                        <Button class="!rounded-l-none">
                                            <span class="icon-[fluent--send-20-regular] w-5 h-5" />
                                        </Button>
                                    }
                                />
                                <Editor class="h-48" /> */}
                            </Card>
                        </Popover>
                    </Show>
                    <For
                        each={notifications()}
                        fallback={
                            <div class="flex flex-row items-center justify-center space-x-2 opacity-60 p-3">
                                <span class="icon-[fluent--chat-empty-20-regular] w-5 h-5" />
                                <span>{t("game.noNotifications")}</span>
                            </div>
                        }
                    >
                        {(notification) => (
                            <>
                                <div class="flex flex-col">
                                    <h2
                                        class="flex flex-row items-center py-2 space-x-2 font-bold"
                                        title={`${notification.publisher_name} at ${notification.published_at.toFormat(
                                            "yyyy-MM-dd HH:mm:ss"
                                        )}`}
                                    >
                                        <span class="flex-shrink-0 icon-[fluent--alert-20-regular] w-5 h-5" />
                                        <span class="flex-1 truncate">{notification.title}</span>
                                        <span class="flex-shrink-0 icon-[fluent--calendar-20-regular] w-5 h-5" />
                                        <a
                                            class="flex-shrink-0 flex items-center"
                                            href={`/users/${notification.publisher_id}`}
                                        >
                                            <span class="icon-[fluent--person-20-regular] w-5 h-5" />
                                        </a>
                                        <Show
                                            when={
                                                accountStore.id &&
                                                gameStore.current?.admins.includes(accountStore.id) &&
                                                accountStore.permissions.includes(Permission.Game)
                                            }
                                        >
                                            <button
                                                class="flex-shrink-0 flex items-center"
                                                type="button"
                                                title={t("form.delete")}
                                            >
                                                <span class="icon-[fluent--delete-20-regular] w-5 h-5" />
                                            </button>
                                        </Show>
                                    </h2>
                                    <Divider />
                                    <p class="py-2 break-words">{notification.content}</p>
                                </div>
                            </>
                        )}
                    </For>
                </div>
            </OverlayScrollbarsComponent>
        </div>
    );
}
