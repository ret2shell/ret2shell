import { handleHttpError } from "@api";
import { useAccountProfile, useChangeProfileMutation, useResendEmailMutation } from "@api/account";
import { uploadMedia } from "@api/media";
import { mediaPath } from "@lib/utils/media";
import { Permission } from "@models/user";
import { createForm, email, getValue, required, setValue } from "@modular-forms/solid";
import { accountStore } from "@storage/account";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Editor from "@widgets/editor";
import FormDraftReset from "@widgets/form-draft-reset";
import Input from "@widgets/input";
import { createMemo, createSignal, Show } from "solid-js";

export type UserForm = {
  nickname: string;
  email: string;
  avatar: string;
  description: string;
};

export default function () {
  const profile = useAccountProfile();
  const [form, { Form, Field }] = createForm<UserForm>({
    initialValues: {
      nickname: profile.data?.nickname,
      email: profile.data?.email || undefined,
      avatar: profile.data?.avatar || undefined,
      description: profile.data?.description || undefined,
    },
  });
  const remoteValues = createMemo<UserForm>(() => ({
    nickname: profile.data?.nickname || "",
    email: profile.data?.email || "",
    avatar: profile.data?.avatar || "",
    description: profile.data?.description || "",
  }));
  const draft = useFormDraft({
    form,
    key: () => buildFormDraftKey("account", "settings", "info"),
    remoteValues,
    enabled: () => !!profile.data,
  });
  const [avatarFile, setAvatarFile] = createSignal(null as File | null);
  const [avatarUploading, setAvatarUploading] = createSignal(false);
  const hasAvatar = createMemo(() => !!getValue(form, "avatar"));
  let avatarInput: HTMLInputElement;
  function handleSelectAvatar() {
    avatarInput!.click();
  }
  function handleSelectedAvatar(event: Event) {
    if (
      event.target &&
      (event.target as HTMLInputElement).files &&
      (event.target as HTMLInputElement).files!.length > 0
    ) {
      setAvatarFile((event.target as HTMLInputElement).files![0]);
      handleUploadAvatar();
    }
  }
  async function handleUploadAvatar() {
    if (avatarFile()) {
      setAvatarUploading(true);
      try {
        const resp = await uploadMedia(avatarFile()!, false);
        setValue(form, "avatar", resp.hash);
      } catch (err) {
        handleHttpError(err as Error, t("general.actions.upload.status.fail"));
      }
      setAvatarUploading(false);
    }
  }

  const resendEmailMutation = useResendEmailMutation();

  const updateMutation = useChangeProfileMutation({
    onSuccess: async () => {
      await profile.refetch();
      draft.discardDraft();
    },
  });

  function onSubmit(result: UserForm) {
    updateMutation.mutate({
      ...profile.data!,
      ...result,
    });
  }

  return (
    <>
      <Title page={t("account.info.title")} route="/account/settings/info" />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <Form onSubmit={onSubmit} class="flex flex-col w-full max-w-5xl space-y-2 relative">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("account.info.title")}</span>
          </h3>
          <Show when={form.dirty || draft.hasDraft()}>
            <Card level="warning" contentClass="p-2 flex flex-row space-x-2 items-center pl-4">
              <span class="shrink-0 icon-[fluent--warning-20-filled] w-5 h-5" />
              <span class="flex-1 text-start">{t("account.form.saveHint")}</span>
            </Card>
          </Show>
          <div class="flex flex-row space-x-4 items-center">
            <div class="flex flex-col space-y-2 flex-1">
              <Input
                icon={<span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5" />}
                title={t("account.form.account.label")}
                placeholder={t("account.form.account.placeholder")}
                value={accountStore.account!}
                disabled
              />
              <Field name="nickname" validate={[required(t("account.form.nickname.required"))]}>
                {(field, props) => (
                  <Input
                    icon={<span class="shrink-0 icon-[fluent--emoji-20-regular] w-5 h-5" />}
                    title={t("account.form.nickname.label")}
                    placeholder={t("account.form.nickname.placeholder")}
                    {...props}
                    value={field.value}
                    error={field.error}
                    required
                  />
                )}
              </Field>
            </div>
            <Field name="avatar">
              {(field, props) => (
                <Avatar
                  class="w-28 h-28 relative m-2"
                  src={(getValue(form, "avatar") && mediaPath(getValue(form, "avatar"))) || undefined}
                  fallback={profile.data?.account}
                >
                  <Button
                    loading={avatarUploading()}
                    disabled={avatarUploading()}
                    type="button"
                    class="opacity-0 hover:opacity-100 bg-layer/80! absolute top-0 left-0 w-full h-full"
                    onClick={() => {
                      if (hasAvatar()) {
                        setAvatarFile(null);
                        setValue(form, "avatar", "");
                      } else {
                        handleSelectAvatar();
                      }
                    }}
                  >
                    <input
                      type="file"
                      class="hidden"
                      id={field.name}
                      {...props}
                      ref={avatarInput!}
                      onChange={handleSelectedAvatar}
                    />
                    <Show
                      when={hasAvatar()}
                      fallback={<span class="shrink-0 icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5" />}
                    >
                      <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5 text-error" />
                    </Show>
                  </Button>
                </Avatar>
              )}
            </Field>
          </div>
          <Field
            name="email"
            validate={[required(t("account.form.email.required")!), email(t("account.form.email.invalid"))]}
          >
            {(field, props) => (
              <Input
                icon={<span class="shrink-0 icon-[fluent--mail-20-regular] w-5 h-5" />}
                title={t("account.form.email.label")}
                placeholder={t("account.form.email.placeholder")}
                autocomplete="email"
                {...props}
                value={field.value}
                error={field.error}
                required
              />
            )}
          </Field>
          <Show when={!accountStore.permissions.includes(Permission.Verified)}>
            <Card level="warning" contentClass="p-2 flex flex-row space-x-2 items-center pl-4">
              <span class="shrink-0 icon-[fluent--warning-20-filled] w-5 h-5 text-warning" />
              <span class="flex-1 text-start">{t("account.status.unverified.message")}</span>
              <Button
                size="sm"
                type="button"
                onClick={() => resendEmailMutation.mutate()}
                loading={resendEmailMutation.isPending}
                disabled={resendEmailMutation.isPending}
              >
                <span>{t("account.status.unverified.action")}</span>
              </Button>
            </Card>
          </Show>
          <Field name="description">
            {(field) => (
              <Editor
                form={form}
                lineNumbers
                class="h-80"
                lang="markdown"
                placeholder="MARKDOWN"
                title={t("account.form.description.label")}
                name="description"
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <div class="mt-4! flex flex-row space-x-2">
            <Button
              type="submit"
              level="primary"
              class="flex-1"
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              {t("general.actions.save.title")}
            </Button>
            <FormDraftReset
              when={draft.hasDraft()}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
              onConfirm={draft.discardDraft}
            />
          </div>
        </Form>
      </div>
    </>
  );
}
