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
      class="h-14 flex flex-row items-center border-b border-b-layer-content/10 space-x-2"
      onSubmit={(result) => registerMutation.mutate({ name: result.name })}
    >
      <Field name="name">
        {(field, fieldProps) => (
          <Input
            class="flex-1"
            placeholder={t("account.passkey.form.name.placeholder")}
            title={t("account.passkey.form.name.label")}
            {...fieldProps}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Button type="submit" level="primary" loading={registerMutation.isPending} disabled={registerMutation.isPending}>
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
      class="p-2 flex flex-row items-center space-x-2"
      onSubmit={(result) => renameMutation.mutate({ id: props.item.id, name: result.name })}
    >
      <Field name="name">
        {(field, fieldProps) => (
          <Input
            class="w-48"
            placeholder={props.item.name}
            title={t("account.passkey.form.name.label")}
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
        loading={renameMutation.isPending}
        disabled={renameMutation.isPending}
      >
        {t("account.passkey.actions.rename.title")}
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
                  <Card>
                    <RenamePasskeyForm item={item} onRenamed={() => passkeys.refetch()} />
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
