import { useInstitutes } from "@api/account";
import { useGame, useGameAdmins, useUpdateGameAdminsMutation } from "@api/game";
import { useUsers } from "@api/user";
import { Popover as ArkPopover } from "@ark-ui/solid";
import { mediaPath } from "@lib/utils/media";
import { Permission, permissionToIcon, type User } from "@models/user";

import { fullTheme, t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Dialog from "@widgets/dialog";
import Divider from "@widgets/divider";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import { OverlayScrollbarsComponent } from "@widgets/overlay-scrollbars";
import Popover from "@widgets/popover";
import Tag from "@widgets/tag";
import clsx from "clsx";
import { createSignal, For, Show } from "solid-js";

export default function AdministratorsManagement(props: { gameId: number }) {
  const admins = useGameAdmins({
    game_id: () => props.gameId,
  });
  const game = useGame({ id: () => props.gameId });
  const institutes = useInstitutes();

  const [adminSearch, setAdminSearch] = createSignal<string>("");

  const searchedUsers = useUsers({
    page: () => 1,
    page_size: () => 30,
    order: () => "id",
    filter: () => adminSearch(),
  });

  const updateMutation = useUpdateGameAdminsMutation({
    onSuccess: () => {
      admins.refetch();
      game.refetch();
    },
  });

  async function handleAddAdmin(user: User) {
    updateMutation.mutate({ game_id: props.gameId, admins: [...(game.data?.admins || []), user.id] });
    setAdminSearch("");
  }
  async function handleDeleteAdmin(user: User) {
    updateMutation.mutate({ game_id: props.gameId, admins: (game.data?.admins || []).filter((v) => v !== user.id) });
  }
  return (
    <>
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="shrink-0 icon-[fluent--person-key-20-regular] w-5 h-5" />
        <span>{t("game.administrator.title")}</span>
      </h3>
      <Show when={admins.isLoading}>
        <div class="h-12 flex flex-row items-center border-b border-b-layer-content/10">
          <LoadingTips />
        </div>
      </Show>
      <ArkPopover.Root autoFocus={false} open={!!adminSearch()} closeOnInteractOutside={false}>
        <ArkPopover.Anchor>
          <Input
            placeholder={t("game.administrator.form.search.placeholder")}
            title={t("game.administrator.form.search.title")}
            icon={<span class="shrink-0 icon-[fluent--person-key-20-regular] w-5 h-5" />}
            onChange={(e) => setAdminSearch(e.currentTarget.value)}
          />
        </ArkPopover.Anchor>
        <ArkPopover.Positioner class="w-full">
          <ArkPopover.Content class="popover card w-full z-50">
            <OverlayScrollbarsComponent
              options={{
                scrollbars: {
                  theme: `os-theme-${fullTheme()}`,
                  autoHide: "scroll",
                },
              }}
              class="relative w-full print:h-auto print:overflow-auto max-h-96"
              defer
            >
              <div class="card-content p-2 flex flex-col space-y-2">
                <Show when={searchedUsers.isLoading}>
                  <LoadingTips />
                </Show>
                <For
                  each={searchedUsers.data?.[0] || []}
                  fallback={
                    <Show when={!searchedUsers.isLoading && adminSearch()}>
                      <div class="h-12 flex items-center font-bold space-x-4 px-2">
                        <span class="shrink-0 icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                        <span class="font-bold opacity-60">{t("game.administrator.empty")}</span>
                      </div>
                    </Show>
                  }
                >
                  {(user) => (
                    <Dialog
                      disabled={!user.permissions.includes(Permission.Game) || game.data?.admins.includes(user.id)}
                      ghost
                      btnContent={
                        <>
                          <Avatar
                            class="w-6 h-6"
                            src={(user.avatar && mediaPath(user.avatar)) || undefined}
                            fallback={user.account || undefined}
                          />
                          <span class="flex-1 truncate text-start">
                            <span>{user.nickname}</span>
                            <span class="font-normal px-2 opacity-60">
                              {user.account}#{user.id.toString(16).padStart(6, "0")}
                            </span>
                          </span>
                          <Show when={!user.permissions.includes(Permission.Game)}>
                            <Tag level="error">
                              <span>{t("game.administrator.errors.noPermission.title")}</span>
                            </Tag>
                          </Show>
                          <Show when={game.data?.admins.includes(user.id)}>
                            <Tag level="success">
                              <span>{t("game.administrator.errors.alreadyAdded.title")}</span>
                            </Tag>
                          </Show>
                        </>
                      }
                    >
                      <div class="flex flex-col w-64 space-y-2 items-center">
                        <div class="flex flex-row space-x-4 justify-start items-center w-full">
                          <Avatar
                            class="w-12 h-12"
                            src={(user.avatar && mediaPath(user.avatar)) || undefined}
                            fallback={user.account || undefined}
                          />
                          <div class="flex flex-col space-x-0 items-start justify-center">
                            <h2 class="font-bold text-lg">{user.nickname}</h2>
                            <p class="font-normal opacity-60">
                              {user.account}#{user.id.toString(16).padStart(6, "0")}
                            </p>
                          </div>
                        </div>
                        <Divider class="w-full" />
                        <p>
                          {t("game.administrator.form.confirm.message", {
                            name: `${user.account}#${user.id.toString(16).padStart(6, "0")}`,
                          })}
                        </p>
                        <Button
                          level="info"
                          class="w-full"
                          onClick={() => handleAddAdmin(user)}
                          loading={updateMutation.isPending}
                          disabled={updateMutation.isPending}
                        >
                          {t("general.actions.confirm.title")}
                        </Button>
                      </div>
                    </Dialog>
                  )}
                </For>
              </div>
            </OverlayScrollbarsComponent>
          </ArkPopover.Content>
        </ArkPopover.Positioner>
      </ArkPopover.Root>
      <div class="grid grid-cols-1 w-full">
        <For each={admins.data || []}>
          {(user) => (
            <div class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2">
              <Avatar
                class="w-6 h-6 shrink-0"
                src={(user.avatar && mediaPath(user.avatar)) || undefined}
                fallback={user.account || undefined}
              />
              <a class="flex truncate text-start hover:underline" href={`/users/${user.id}`}>
                <span class="flex-1 min-w-16 truncate">
                  <span>{user.nickname}</span>
                  <span class="font-normal px-2 opacity-60">
                    {user.account}#{user.id.toString(16).padStart(6, "0")}
                  </span>
                </span>
              </a>
              <span class="flex-1" />
              <span class="flex flex-row items-center justify-end space-x-4 overflow-auto">
                <For each={user.permissions}>
                  {(permission) => <span class={clsx(permissionToIcon(permission), "shrink-0")} />}
                </For>
                <Show when={user.institute_id}>
                  <Tag class="min-w-16" level="info">
                    <span class="flex-1 truncate">
                      {institutes.data?.find((v) => v.id === user.institute_id)?.name}
                    </span>
                  </Tag>
                </Show>
              </span>
              <Popover
                size="sm"
                ghost
                square
                level="error"
                btnContent={<span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />}
              >
                <Card contentClass="p-2 flex flex-row space-x-2 items-center">
                  <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5 text-error" />
                  <span>{t("general.actions.delete.message")}</span>
                  <Button
                    level="error"
                    size="sm"
                    title={t("general.actions.yes.title")}
                    onClick={() => handleDeleteAdmin(user)}
                    loading={updateMutation.isPending}
                  >
                    <span>{t("general.actions.yes.title")}</span>
                  </Button>
                </Card>
              </Popover>
            </div>
          )}
        </For>
      </div>
    </>
  );
}
