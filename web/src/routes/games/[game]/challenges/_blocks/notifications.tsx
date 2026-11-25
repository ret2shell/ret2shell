import { useGame } from "@api/game";
import { useCreateNotificationMutation, useDeleteNotificationMutation, useNotifications } from "@api/notification";
import type { Notification } from "@models/notification";
import { createForm, required, setValues } from "@modular-forms/solid";

import { accountStore } from "@storage/account";
import { isAdminOfGame } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
import Editor from "@widgets/editor";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import { DateTime } from "luxon";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

type NotificationForm = {
  title: string;
  content: string;
};

export default function (props: { gameId: number }) {
  const game = useGame({ id: () => props.gameId });
  const notifications = useNotifications({
    game_id: () => props.gameId,
    enabled: () => !!props.gameId,
  });
  const sortedNotifications = createMemo(() => {
    return [...(notifications.data ?? [])].sort((a, b) => b.published_at.toMillis() - a.published_at.toMillis());
  });
  const [createFormExpanded, setCreateFormExpanded] = createSignal(false);
  const [form, { Form, Field }] = createForm<NotificationForm>();
  const createMutation = useCreateNotificationMutation({
    onSuccess: () => {
      setValues(form, { title: "", content: "" });
      setCreateFormExpanded(false);
      notifications.refetch();
    },
  });
  const deleteMutation = useDeleteNotificationMutation({
    onSuccess: () => {
      notifications.refetch();
    },
  });

  function onSubmit(result: NotificationForm) {
    const payload = {
      id: 0,
      title: result.title,
      content: result.content,
      published_at: DateTime.now(),
      publisher_id: accountStore.id,
      game_id: props.gameId,
    } as Notification;
    createMutation.mutate({ game_id: props.gameId, notification: payload });
  }

  function onDelete(id: number) {
    deleteMutation.mutate({ game_id: props.gameId, id });
  }

  const refreshTimer = setInterval(() => {
    notifications.refetch();
  }, 30 * 1000);

  onCleanup(() => {
    clearInterval(refreshTimer);
  });

  return (
    <div class="flex-1 overflow-hidden">
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
          <Show when={isAdminOfGame(game.data)}>
            <Form onSubmit={onSubmit} class="flex flex-col space-y-2">
              <Show when={createFormExpanded()}>
                <Field name="title" validate={[required(t("game.notification.form.title.required"))]}>
                  {(field, props) => (
                    <Input
                      placeholder={t("game.notification.form.title.placeholder")}
                      title={t("game.notification.form.title.label")}
                      {...props}
                      value={field.value}
                      error={field.error}
                      required
                    />
                  )}
                </Field>
                <Field name="content" validate={[required(t("game.notification.form.content.required"))]}>
                  {(field) => (
                    <Editor
                      form={form}
                      class="h-48"
                      lang="plaintext"
                      placeholder="PLAINTEXT"
                      title={t("game.notification.form.content.label")}
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
                    <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
                    <span>{t("general.actions.create.title")}</span>
                  </Button>
                </Show>
                <Button
                  class={createFormExpanded() ? "shrink-0" : "flex-1"}
                  square={createFormExpanded()}
                  type="button"
                  onClick={() => {
                    setCreateFormExpanded(!createFormExpanded());
                  }}
                >
                  <Show
                    when={createFormExpanded()}
                    fallback={<span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />}
                  >
                    <span class="shrink-0 icon-[fluent--chevron-double-up-20-regular] w-5 h-5" />
                  </Show>
                  <Show when={!createFormExpanded()}>
                    <span>{t("general.actions.create.title")}</span>
                  </Show>
                </Button>
              </div>
            </Form>
          </Show>
          <For
            each={sortedNotifications()}
            fallback={
              <div class="flex flex-row items-center justify-center space-x-2 opacity-60 p-3">
                <Show
                  when={notifications.isLoading}
                  fallback={
                    <>
                      <span class="shrink-0 icon-[fluent--chat-empty-20-regular] w-5 h-5" />
                      <span>{t("game.notification.empty")}</span>
                    </>
                  }
                >
                  <LoadingTips />
                </Show>
              </div>
            }
          >
            {(notification) => (
              <>
                <div class="flex flex-col">
                  <h2 class="flex flex-row items-center py-2 space-x-2 font-bold">
                    <span class="shrink-0 icon-[fluent--alert-20-regular] w-5 h-5" />
                    <span class="flex-1 truncate" title={notification.title}>
                      {notification.title}
                    </span>
                    <span
                      class="shrink-0 icon-[fluent--calendar-20-regular] w-5 h-5"
                      title={`${notification.publisher_name} at ${notification.published_at.toFormat(
                        "yyyy-MM-dd HH:mm:ss"
                      )}`}
                    />
                    <a class="shrink-0 flex items-center" href={`/users/${notification.publisher_id}`}>
                      <span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5" />
                    </a>
                    <Show when={isAdminOfGame(game.data)}>
                      <button
                        class="shrink-0 flex items-center cursor-pointer hover:text-error"
                        type="button"
                        title={t("general.actions.delete.title")}
                        onClick={() => onDelete(notification.id)}
                      >
                        <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />
                      </button>
                    </Show>
                  </h2>
                  <Divider />
                  <p class="py-2 break-words opacity-60">{notification.content}</p>
                </div>
              </>
            )}
          </For>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
