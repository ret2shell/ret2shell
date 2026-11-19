import {
  useDeletePasskeyMutation,
  usePasskeys,
  useRegisterPasskeyMutation,
  useRenamePasskeyMutation,
} from "@api/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import Popover from "@widgets/popover";
import { DateTime } from "luxon";
import { createSignal, For, Show } from "solid-js";

function formatTime(time: DateTime | string | number | null | undefined): string {
  if (time === null || time === undefined) {
    return "-";
  }
  if (DateTime.isDateTime(time)) {
    return time.toFormat("yyyy-MM-dd HH:mm");
  }
  const parsed = typeof time === "number" ? DateTime.fromSeconds(time) : DateTime.fromISO(time);
  return parsed.isValid ? parsed.toFormat("yyyy-MM-dd HH:mm") : "-";
}

export default function () {
  const passkeys = usePasskeys();
  const registerMutation = useRegisterPasskeyMutation({
    onSuccess: () => {
      passkeys.refetch();
    },
  });
  const renameMutation = useRenamePasskeyMutation({
    onSuccess: () => {
      passkeys.refetch();
    },
  });
  const deleteMutation = useDeletePasskeyMutation({
    onSuccess: () => {
      passkeys.refetch();
    },
  });

  const [newName, setNewName] = createSignal("");
  const [renaming, setRenaming] = createSignal<{ id: number; value: string }>();

  return (
    <>
      <Title page={t("account.passkey.title")} route="/account/settings/passkey" />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <div class="flex flex-col w-full max-w-5xl relative">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--person-passkey-20-regular] w-5 h-5" />
            <span>{t("account.passkey.title")}</span>
          </h3>

          <div class="h-14 flex flex-row items-center border-b border-b-layer-content/10 space-x-2">
            <Input
              class="flex-1"
              placeholder={t("account.passkey.form.name.placeholder")}
              title={t("account.passkey.form.name.label")}
              value={newName()}
              onInput={(event) => setNewName(event.currentTarget.value)}
            />
            <Button
              level="primary"
              loading={registerMutation.isPending}
              disabled={registerMutation.isPending}
              onClick={() => registerMutation.mutate({ name: newName() })}
            >
              <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
              <span>{t("account.passkey.actions.add.title")}</span>
            </Button>
          </div>

          <Show when={passkeys.data?.length === 0}>
            <div class="h-14 flex items-center opacity-60">{t("account.passkey.empty")}</div>
          </Show>

          <For each={passkeys.data}>
            {(item) => (
              <div class="h-14 flex flex-row items-center border-b border-b-layer-content/10 space-x-2">
                <span class="shrink-0 icon-[fluent--person-passkey-20-regular] w-5 h-5" />
                <h4 class="font-bold text-start flex-1 truncate">
                  <span>{item.name === "" ? t("account.passkey.unnamed") : item.name}</span>
                </h4>
                <Popover size="sm" square btnContent={<span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5" />}>
                  <Card contentClass="max-w-lg p-2">
                    <table>
                      <tbody>
                        <tr class="h-10 align-middle text-start border-b border-b-layer-content/15">
                          <td class="text-start font-bold px-2">{t("account.passkey.info.created_at")}</td>
                          <td class="text-start px-2">{formatTime(item.created_at)}</td>
                        </tr>
                        <tr class="h-10 align-middle text-start border-b border-b-layer-content/15">
                          <td class="text-start font-bold px-2">{t("account.passkey.info.last_used_at")}</td>
                          <td class="text-start px-2">{formatTime(item.last_used_at)}</td>
                        </tr>
                        <tr class="h-10 align-middle text-start">
                          <td class="text-start font-bold px-2">{t("account.passkey.info.credential_id")}</td>
                          <td class="text-start truncate max-w-64 px-2" title={item.credential_id}>
                            {item.credential_id}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </Card>
                </Popover>
                <Popover size="sm" square btnContent={<span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />}>
                  <Card contentClass="p-2 flex flex-row items-center space-x-2">
                    <Input
                      class="w-48"
                      placeholder={item.name}
                      title={t("account.passkey.form.name.label")}
                      value={renaming()?.id === item.id ? renaming()?.value : ""}
                      onInput={(event) => setRenaming({ id: item.id, value: event.currentTarget.value })}
                    />
                    <Button
                      size="sm"
                      level="primary"
                      loading={renameMutation.isPending}
                      disabled={renameMutation.isPending || renaming()?.id !== item.id}
                      onClick={() => {
                        const value = renaming()?.id === item.id ? renaming()?.value : "";
                        setRenaming(undefined);
                        renameMutation.mutate({ id: item.id, name: value ?? "" });
                      }}
                    >
                      {t("account.passkey.actions.rename.title")}
                    </Button>
                  </Card>
                </Popover>
                <Button
                  size="sm"
                  level="error"
                  loading={deleteMutation.isPending}
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({ id: item.id })}
                >
                  {t("account.passkey.actions.delete.title")}
                </Button>
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  );
}
