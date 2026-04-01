import { handleHttpError } from "@api";
import { useOAuthProvider } from "@api/account";
import { uploadMedia } from "@api/media";
import { mediaPath } from "@lib/utils/media";
import type { OAuthProvider } from "@models/oauth-provider";
import { createForm, getValue, maxLength, minLength, pattern, required, setValue, url } from "@modular-forms/solid";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import FormDraftReset from "@widgets/form-draft-reset";
import Input from "@widgets/input";
import Select from "@widgets/select";
import { createMemo, createSignal, Show } from "solid-js";
import emailScript from "../scripts/email.rx";
import oauth2AuthCodeScript from "../scripts/oauth2_auth_code.rx";
import yaleCasScript from "../scripts/yale_cas.rx";

type FormType = {
  name: string;
  provider: string;
  avatar: string | null;
  script: string;
  portal: string;
};

const presetMap = {
  email: emailScript,
  yale_cas: yaleCasScript,
  oauth2_auth_code: oauth2AuthCodeScript,
};

export default function ProviderForm(props: {
  onDone?: (result: OAuthProvider) => Promise<void>;
  provider?: string;
  loading?: boolean;
}) {
  const oauthProvider = useOAuthProvider({
    service: () => props.provider || "",
    enabled: () => !!props.provider,
  });
  const [form, { Form, Field }] = createForm<FormType>({
    initialValues: {
      name: oauthProvider.data?.item.name || "" || "",
      provider: oauthProvider.data?.item.provider || "",
      avatar: oauthProvider.data?.item.avatar || "",
      script: oauthProvider.data?.item.script || "",
      portal: oauthProvider.data?.item.portal || "",
    },
  });
  const remoteValues = createMemo<FormType>(() => ({
    name: oauthProvider.data?.item.name || "",
    provider: oauthProvider.data?.item.provider || "",
    avatar: oauthProvider.data?.item.avatar || "",
    script: oauthProvider.data?.item.script || "",
    portal: oauthProvider.data?.item.portal || "",
  }));
  const draft = useFormDraft({
    form,
    key: () => (props.provider ? buildFormDraftKey("admin", "oauth", "provider", props.provider) : undefined),
    remoteValues,
    enabled: () => !!props.provider && !!oauthProvider.data,
  });
  const [avatarFile, setAvatarFile] = createSignal(null as File | null);
  const [avatarUploading, setAvatarUploading] = createSignal(false);
  const hasAvatar = createMemo(() => !!getValue(form, "avatar"));
  async function onSubmit(result: FormType) {
    await props.onDone?.({
      id: oauthProvider.data?.item.id || 0,
      name: result.name,
      provider: result.provider,
      avatar: result.avatar,
      script: result.script,
      portal: result.portal,
    });
    draft.discardDraft();
  }
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
        handleHttpError(err as Error, t("general.actions.save.status.fail"));
      }
      setAvatarUploading(false);
    }
  }
  return (
    <Form onSubmit={onSubmit} class="flex flex-col w-screen max-w-5xl space-y-2 relative">
      <div class="flex flex-row space-x-4 items-end">
        <div class="flex flex-col space-y-2 flex-1">
          <Field name="name" validate={[required(t("oauth.form.name.required"))]}>
            {(field, props) => (
              <Input
                icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
                title={t("oauth.form.name.label")}
                placeholder={t("oauth.form.name.placeholder")}
                {...props}
                value={field.value}
                error={field.error}
                required
              />
            )}
          </Field>
          <Field
            name="provider"
            validate={[
              required(t("oauth.form.provider.required")),
              minLength(2, t("oauth.form.provider.minimumLength")),
              maxLength(32, t("oauth.form.provider.maximumLength")),
              // only ascii visible characters, no whitespaces
              pattern(/^[0-9a-z_]*$/, t("oauth.form.provider.invalid")),
            ]}
          >
            {(field, props) => (
              <Input
                icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
                title={t("oauth.form.provider.label")}
                placeholder={t("oauth.form.provider.placeholder")}
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
              class="w-32 h-32 relative"
              src={(getValue(form, "avatar") && mediaPath(getValue(form, "avatar"))) || undefined}
              fallback={getValue(form, "provider")?.toUpperCase()}
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
      <Field name="portal" validate={[url(t("oauth.form.portal.invalid"))]}>
        {(field, props) => (
          <Input
            icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
            title={t("oauth.form.portal.label")}
            placeholder={t("oauth.form.portal.placeholder")}
            {...props}
            value={field.value}
            error={field.error}
            required
          />
        )}
      </Field>
      <header class="flex items-end">
        <h3 class="font-bold text-sm opacity-60 flex-1 text-start flex space-x-4">
          <span>{t("oauth.form.script.label")}</span>
          <span>$GLOBAL/oauth.rx</span>
        </h3>
        <Select
          class="w-60 hidden lg:flex"
          placeholder={t("oauth.form.script.preset.placeholder")}
          size="sm"
          items={[
            {
              label: t("oauth.form.script.preset.email"),
              value: "email",
              icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
            },
            {
              label: t("oauth.form.script.preset.yaleCas"),
              value: "yale_cas",
              icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
            },
            {
              label: t("oauth.form.script.preset.oauth2AuthCode"),
              value: "oauth2_auth_code",
              icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
            },
          ]}
          onValueChange={(e) => {
            setValue(
              form,
              "script",
              e.value.at(0) && Object.keys(presetMap).includes(e.value.at(0)!)
                ? (presetMap[e.value.at(0)! as keyof typeof presetMap] ?? null)
                : null
            );
          }}
        />
      </header>
      <Field name="script" validate={[required(t("oauth.form.script.required"))]}>
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="h-96"
            lang="rune"
            name="script"
            lints={oauthProvider.data?.lint ?? undefined}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <div class="mt-4! flex flex-row space-x-2">
        <Button type="submit" level="primary" class="flex-1" loading={props.loading} disabled={props.loading}>
          {props.provider ? t("general.actions.save.title") : t("general.actions.create.title")}
        </Button>
        <FormDraftReset
          when={draft.hasDraft()}
          loading={props.loading}
          disabled={props.loading}
          onConfirm={draft.discardDraft}
        />
      </div>
    </Form>
  );
}
