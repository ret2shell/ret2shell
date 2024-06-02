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
import { createForm, required } from "@modular-forms/solid";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Show, createSignal } from "solid-js";

type NotificationForm = {
    title: string;
    content: string;
};

export default function () {
    const [notifications, setNotifications] = createSignal([] as Notification[]);
    const [createFormExpanded, setCreateFormExpanded] = createSignal(false);
    const [form, { Form, Field }] = createForm<NotificationForm>();
    const onSubmit = (result: NotificationForm) => {};
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
                        <Form onSubmit={onSubmit} class="flex flex-col space-y-2">
                            <Show when={createFormExpanded()}>
                                <Field name="title" validate={[required(t("game.notification.titleRequired")!)]}>
                                    {(field, props) => (
                                        <Input
                                            placeholder={t("game.notification.titlePlaceholder")}
                                            title={t("game.notification.titlePlaceholder")}
                                            {...props}
                                            value={field.value}
                                            error={field.error}
                                            required
                                        />
                                    )}
                                </Field>
                                <Field name="content" validate={[required(t("game.notification.contentRequired")!)]}>
                                    {(field) => (
                                        <Editor
                                            form={form}
                                            class="h-48"
                                            lang="plaintext"
                                            placeholder="PLAINTEXT"
                                            title={t("game.notification.contentPlaceholder")}
                                            name="content"
                                            value={field.value}
                                            error={field.error}
                                        />
                                    )}
                                </Field>
                            </Show>
                            <div class="flex flex-row space-x-2">
                                <Show when={createFormExpanded()}>
                                    <Button class="flex-1" type="submit">
                                        <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                                        <span>{t("form.create")}</span>
                                    </Button>
                                </Show>
                                <Button
                                    class={`${createFormExpanded() ? "flex-shrink-0" : "flex-1"}`}
                                    square={createFormExpanded()}
                                    type="button"
                                    onClick={() => {
                                        setCreateFormExpanded(!createFormExpanded());
                                    }}
                                >
                                    <Show
                                        when={createFormExpanded()}
                                        fallback={<span class="icon-[fluent--add-20-regular] w-5 h-5" />}
                                    >
                                        <span class="icon-[fluent--chevron-double-up-20-regular] w-5 h-5" />
                                    </Show>
                                    <Show when={!createFormExpanded()}>
                                        <span>{t("form.create")}</span>
                                    </Show>
                                </Button>
                            </div>
                        </Form>
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
