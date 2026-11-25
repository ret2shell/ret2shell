import {
  useDeletePasskeyMutation,
  usePasskeys,
  useRegisterPasskeyMutation,
  useRenamePasskeyMutation,
} from "@api/account";
import type { Passkey } from "@models/passkey";
import { createForm, setValues } from "@modular-forms/solid";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Input from "@widgets/input";
import Popover from "@widgets/popover";
import { DateTime } from "luxon";
import { For, Show } from "solid-js";

function formatTime(time: DateTime | string | number | null | undefined): string {
  if (time === null || time === undefined) {
    return "-";
  }
  // `luxonReviver` turns every numeric `*_at` field from the API into a
  // `DateTime`; raw JSON numbers and ISO strings stay supported as a fallback.
  if (DateTime.isDateTime(time)) {
    return time.toFormat("yyyy-MM-dd HH:mm");
  }
  const parsed = typeof time === "number" ? DateTime.fromSeconds(time) : DateTime.fromISO(time);
  return parsed.isValid ? parsed.toFormat("yyyy-MM-dd HH:mm") : "-";
}

type PasskeyNameForm = {
  name: string;
};

function RegisterPasskeyForm(props: { onRegistered: () => void }) {
  const [form, { Form, Field }] = createForm<PasskeyNameForm>();
  const registerMutation = useRegisterPasskeyMutation({
    onSuccess: () => {
      setValues(form, { name: "" });
      props.onRegistered();
    },
  });

  return (
    <Form
      class="flex flex-col gap-2 py-4 border-b border-b-layer-content/10 sm:flex-row sm:items-end"
      onSubmit={(result) => registerMutation.mutate({ name: result.name })}
    >
      <Field name="name">
        {(field, fieldProps) => (
          <Input
            class="flex-1"
            title={t("account.passkey.form.name.label")}
            placeholder={t("account.passkey.form.name.placeholder")}
            {...fieldProps}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Button
        type="submit"
        level="primary"
        class="w-full shrink-0 sm:w-auto"
        loading={registerMutation.isPending}
        disabled={registerMutation.isPending}
      >
        <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
        <span>{t("account.passkey.actions.add.title")}</span>
      </Button>
    </Form>
  );
}

function RenamePasskeyForm(props: { item: Passkey; onRenamed: () => void }) {
  const [, { Form, Field }] = createForm<PasskeyNameForm>({
    initialValues: { name: props.item.name },
  });
  const renameMutation = useRenamePasskeyMutation({
    onSuccess: () => {
      props.onRenamed();
    },
  });

  return (
    <Form
      class="flex flex-col gap-2 p-2 sm:flex-row sm:items-end"
      onSubmit={(result) => renameMutation.mutate({ id: props.item.id, name: result.name })}
    >
      <Field name="name">
        {(field, fieldProps) => (
          <Input
            class="w-full sm:w-48"
            size="sm"
            title={t("account.passkey.form.name.label")}
            placeholder={t("account.passkey.form.name.placeholder")}
            {...fieldProps}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Button
        type="submit"
        size="sm"
        level="primary"
        class="w-full shrink-0 sm:w-auto"
        loading={renameMutation.isPending}
        disabled={renameMutation.isPending}
      >
        {t("general.actions.save.title")}
      </Button>
    </Form>
  );
}

export default function () {
  const passkeys = usePasskeys();
  const deleteMutation = useDeletePasskeyMutation({
    onSuccess: () => {
      passkeys.refetch();
    },
  });

  return (
    <>
      <Title page={t("account.passkey.title")} route="/account/settings/passkey" />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <div class="flex flex-col w-full max-w-5xl relative">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--person-passkey-20-regular] w-5 h-5" />
            <span>{t("account.passkey.title")}</span>
          </h3>

          <RegisterPasskeyForm onRegistered={() => passkeys.refetch()} />

          <Show when={passkeys.data?.length === 0}>
            <div class="flex flex-col items-center justify-center gap-2 py-12 opacity-60">
              <span class="icon-[fluent--person-passkey-20-regular] w-8 h-8" />
              <span>{t("account.passkey.empty")}</span>
            </div>
          </Show>

          <For each={passkeys.data}>
            {(item) => (
              <div class="flex flex-row items-center gap-2 py-3 border-b border-b-layer-content/10">
                <span class="shrink-0 icon-[fluent--person-passkey-20-regular] w-5 h-5" />
                <div class="flex flex-col flex-1 min-w-0">
                  <span class="truncate font-bold">{item.name === "" ? t("account.passkey.unnamed") : item.name}</span>
                  <span class="truncate text-xs opacity-60">
                    {t("account.passkey.info.last_used_at")}: {formatTime(item.last_used_at)}
                  </span>
                </div>
                <Popover
                  size="sm"
                  ghost
                  square
                  btnContent={<span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5" />}
                >
                  <Card contentClass="max-w-lg p-2">
                    <table>
                      <tbody>
                        <tr class="h-10 align-middle text-start border-b border-b-layer-content/15">
                          <td class="text-start font-bold px-2">{t("account.passkey.info.created_at")}</td>
                          <td class="text-start px-2">{formatTime(item.created_at)}</td>
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
                <Popover
                  size="sm"
                  ghost
                  square
                  title={t("account.passkey.actions.rename.title")}
                  btnContent={<span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />}
                >
                  <Card contentClass="p-0">
                    <RenamePasskeyForm item={item} onRenamed={() => passkeys.refetch()} />
                  </Card>
                </Popover>
                <Popover
                  size="sm"
                  ghost
                  square
                  title={t("account.passkey.actions.delete.title")}
                  btnContent={<span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />}
                >
                  <Card contentClass="p-2 flex flex-row items-center space-x-2">
                    <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5 text-error" />
                    <span>{t("general.actions.delete.message")}</span>
                    <Button
                      level="error"
                      size="sm"
                      title={t("general.actions.confirm.title")}
                      loading={deleteMutation.isPending}
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate({ id: item.id })}
                    >
                      <span>{t("general.actions.confirm.title")}</span>
                    </Button>
                  </Card>
                </Popover>
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  );
}
