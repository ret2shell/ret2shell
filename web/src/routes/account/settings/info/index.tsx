import { handleHttpError } from "@api";
import { changeProfile, resendEmail } from "@api/account";
import { uploadMedia } from "@api/media";
import { mediaPath } from "@lib/utils/media";
import { Permission } from "@models/user";
import { createForm, email, required, setValue, setValues } from "@modular-forms/solid";
import { accountStore, refreshUser, setAccountStore } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Editor from "@widgets/editor";
import Input from "@widgets/input";
import { Show, createEffect, createSignal, untrack } from "solid-js";

export type UserForm = {
  nickname: string;
  email: string;
  avatar: string;
  description: string;
};

export default function () {
  const [form, { Form, Field }] = createForm<UserForm>();
  createEffect(() => {
    if (accountStore.info) {
      untrack(() => {
        setValues(form, {
          nickname: accountStore.info?.nickname || "",
          email: accountStore.info?.email || "",
          avatar: accountStore.info?.avatar || "",
          description: accountStore.info?.description || "",
        });
        setAvatarSet(!!accountStore.info?.avatar);
      });
    }
  });
  const [loading, setLoading] = createSignal(false);
  const [avatarFile, setAvatarFile] = createSignal(null as File | null);
  const [avatarSet, setAvatarSet] = createSignal(false);
  const [avatarUploading, setAvatarUploading] = createSignal(false);
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
        if (accountStore.info)
          setAccountStore({
            info: {
              ...accountStore.info,
              avatar: resp.hash,
            },
          });
        setValue(form, "avatar", resp.hash);
        setAvatarSet(true);
      } catch (err) {
        handleHttpError(err as Error, t("general.actions.upload.status.fail")!);
      }
      setAvatarUploading(false);
    }
  }
  async function handleResendVerifyEmail() {
    try {
      await resendEmail();
      addToast({
        level: "success",
        description: t("general.actions.send.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.send.status.fail")!);
    }
  }
  async function onSubmit(result: UserForm) {
    setLoading(true);
    try {
      await changeProfile({
        ...accountStore.info!,
        ...result,
      });
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
      refreshUser();
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setLoading(false);
  }
  return (
    <>
      <Title page={t("account.info.title")} route="/account/settings/info" />
      <div class="flex flex-col p-3 lg:p-6 w-full items-center">
        <Form onSubmit={onSubmit} class="flex flex-col w-full max-w-5xl space-y-2 relative">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("account.info.title")}</span>
          </h3>
          <div class="flex flex-row space-x-4 items-center">
            <div class="flex flex-col space-y-2 flex-1">
              <Input
                icon={<span class="icon-[fluent--person-20-regular] w-5 h-5" />}
                title={t("account.form.account.label")}
                placeholder={t("account.form.account.placeholder")}
                value={accountStore.account!}
                disabled
              />
              <Field name="nickname" validate={[required(t("account.form.nickname.required")!)]}>
                {(field, props) => (
                  <Input
                    icon={<span class="icon-[fluent--emoji-20-regular] w-5 h-5" />}
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
                  src={(accountStore.info?.avatar && mediaPath(accountStore.info?.avatar)) || undefined}
                  fallback={accountStore.info?.account}
                >
                  <Button
                    loading={avatarUploading()}
                    disabled={avatarUploading()}
                    type="button"
                    class="opacity-0 hover:opacity-100 !bg-layer/80 absolute top-0 left-0 w-full h-full"
                    onClick={() => {
                      if (avatarSet()) {
                        setAvatarSet(false);
                        setAvatarFile(null);
                        setValue(form, "avatar", "");
                        setAccountStore({
                          info: {
                            ...accountStore.info!,
                            avatar: "",
                          },
                        });
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
                      when={accountStore.info?.avatar}
                      fallback={<span class="icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5" />}
                    >
                      <span class="icon-[fluent--delete-20-regular] w-5 h-5 text-error" />
                    </Show>
                  </Button>
                </Avatar>
              )}
            </Field>
          </div>
          <Field
            name="email"
            validate={[required(t("account.form.email.required")!), email(t("account.form.email.invalid")!)]}
          >
            {(field, props) => (
              <Input
                icon={<span class="icon-[fluent--mail-20-regular] w-5 h-5" />}
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
              <span class="icon-[fluent--warning-20-filled] w-5 h-5 text-warning" />
              <span class="flex-1 text-start">{t("account.status.unverified.message")}</span>
              <Button size="sm" type="button" onClick={handleResendVerifyEmail}>
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
          <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
            {t("general.actions.save.title")}
          </Button>
        </Form>
      </div>
    </>
  );
}
