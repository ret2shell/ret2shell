import { usePlatformConfig, useUpdatePlatformConfigMutation } from "@api/platform";
import type { EmailConfig } from "@models/config";
import { createForm, custom, getValue, setValues } from "@modular-forms/solid";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import Divider from "@widgets/divider";
import Editor from "@widgets/editor";
import Input from "@widgets/input";
import Select from "@widgets/select";
import { createEffect, untrack } from "solid-js";

export default function () {
  const config = usePlatformConfig();
  const [form, { Form, Field }] = createForm<EmailConfig>({
    initialValues: {
      ...config.data?.email,
    },
  });
  const mutation = useUpdatePlatformConfigMutation({
    onSuccess: () => {
      config.refetch();
    },
  });
  createEffect(() => {
    if (config.data) {
      untrack(() => {
        setValues(form, {
          ...config.data.email,
        });
      });
    }
  });

  async function onSubmit(result: EmailConfig) {
    if (config.data)
      mutation.mutate({
        ...config.data,
        email: {
          ...config.data.email,
          ...result,
        },
      });
  }

  return (
    <>
      <Title page={t("platform.email.title")} route="/admin/email" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
        <Form onSubmit={onSubmit} class="w-full max-w-5xl flex flex-col space-y-2">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--mail-20-regular] w-5 h-5" />
            <span>{t("platform.email.title")}</span>
          </h3>
          <Field name="enabled" type="boolean">
            {(field, props) => (
              <Checkbox
                inputProps={props}
                title={t("platform.email.form.enabled")}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start">{t("platform.email.form.enabled")}</span>
              </Checkbox>
            )}
          </Field>
          <div class="flex flex-row space-x-2">
            <Field
              name="tls"
              validate={[
                custom((value) => {
                  if (!value && getValue(form, "enabled")) {
                    return false;
                  }
                  return true;
                }, t("platform.email.form.tls.required")),
              ]}
            >
              {(field, props) => (
                <Select
                  name={field.name}
                  label={t("platform.email.form.tls.label")}
                  disabled={getValue(form, "enabled") === false}
                  class="flex-1 max-w-64"
                  error={field.error}
                  placeholder={t("platform.email.form.tls.placeholder")}
                  items={[
                    {
                      value: "none",
                      label: "None",
                      icon: "icon-[fluent--emoji-sad-20-regular]",
                    },
                    {
                      value: "tls",
                      label: "TLS",
                      icon: "icon-[fluent--lock-20-regular]",
                    },
                    {
                      value: "starttls",
                      label: "StartTLS",
                      icon: "icon-[fluent--lock-20-regular]",
                    },
                  ]}
                  value={field.value ? [field.value as string] : undefined}
                  inputProps={props}
                />
              )}
            </Field>
            <Field
              name="host"
              validate={[
                custom((value) => {
                  if (!value && getValue(form, "enabled")) {
                    return false;
                  }
                  return true;
                }, t("platform.email.form.host.required")),
              ]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  disabled={getValue(form, "enabled") === false}
                  title={t("platform.email.form.host.label")}
                  placeholder={t("platform.email.form.host.placeholder")}
                  icon={<span class="shrink-0 icon-[fluent--server-link-20-regular] w-5 h-5" />}
                  value={field.value}
                  error={field.error}
                  {...props}
                />
              )}
            </Field>
            <Field
              name="port"
              type="number"
              validate={[
                custom((value) => {
                  if (!value && getValue(form, "port")) {
                    return false;
                  }
                  return true;
                }, t("platform.email.form.port.required")),
                custom((value) => {
                  if (value && (value < 1 || value > 65535)) {
                    return false;
                  }
                  return true;
                }, t("platform.email.form.port.invalid")),
              ]}
            >
              {(field, props) => (
                <Input
                  type="number"
                  disabled={getValue(form, "enabled") === false}
                  title={t("platform.email.form.port.label")}
                  placeholder={t("platform.email.form.port.placeholder")}
                  class="w-36"
                  icon={<span class="shrink-0 icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
                  value={field.value}
                  error={field.error}
                  {...props}
                />
              )}
            </Field>
          </div>
          <Field
            name="sender"
            validate={[
              custom((value) => {
                if (!value && getValue(form, "enabled")) {
                  return false;
                }
                return true;
              }, t("platform.email.form.sender.required")),
            ]}
          >
            {(field, props) => (
              <Input
                class="flex-1"
                disabled={getValue(form, "enabled") === false}
                title={t("platform.email.form.sender.label")}
                placeholder={t("platform.email.form.sender.placeholder")}
                icon={<span class="shrink-0 icon-[fluent--emoji-20-regular] w-5 h-5" />}
                value={field.value}
                error={field.error}
                {...props}
              />
            )}
          </Field>
          <Field name="sender_address">
            {(field, props) => (
              <Input
                class="flex-1"
                disabled={getValue(form, "enabled") === false}
                title={t("platform.email.form.senderAddress.label")}
                placeholder={t("platform.email.form.senderAddress.placeholder")}
                icon={<span class="shrink-0 icon-[fluent--mail-20-regular] w-5 h-5" />}
                value={field.value ?? undefined}
                error={field.error}
                {...props}
              />
            )}
          </Field>
          <div class="flex flex-col lg:flex-row lg:space-x-2 space-y-2 lg:space-y-0">
            <Field
              name="username"
              validate={[
                custom((value) => {
                  if (!value && getValue(form, "enabled")) {
                    return false;
                  }
                  return true;
                }, t("platform.email.form.username.required")),
              ]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  disabled={getValue(form, "enabled") === false}
                  title={t("platform.email.form.username.label")}
                  placeholder={t("platform.email.form.username.placeholder")}
                  icon={<span class="shrink-0 icon-[fluent--mail-20-regular] w-5 h-5" />}
                  value={field.value}
                  error={field.error}
                  {...props}
                />
              )}
            </Field>
            <Field
              name="password"
              validate={[
                custom((value) => {
                  if (!value && getValue(form, "enabled")) {
                    return false;
                  }
                  return true;
                }, t("platform.email.form.password.required")),
              ]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  disabled={getValue(form, "enabled") === false}
                  type="password"
                  title={t("platform.email.form.password.label")}
                  placeholder={t("platform.email.form.password.placeholder")}
                  icon={<span class="shrink-0 icon-[fluent--lock-20-regular] w-5 h-5" />}
                  value={field.value}
                  error={field.error}
                  {...props}
                />
              )}
            </Field>
          </div>
          <Divider direction="horizontal" />
          <Field
            name="verify_email_subject"
            validate={[
              custom((value) => {
                if (!value && getValue(form, "enabled")) {
                  return false;
                }
                return true;
              }, t("platform.email.form.verifyEmailSubject.required")),
            ]}
          >
            {(field, props) => (
              <Input
                class="flex-1"
                disabled={getValue(form, "enabled") === false}
                title={t("platform.email.form.verifyEmailSubject.label")}
                placeholder={t("platform.email.form.verifyEmailSubject.placeholder")}
                icon={<span class="shrink-0 icon-[fluent--emoji-20-regular] w-5 h-5" />}
                value={field.value ?? undefined}
                error={field.error}
                {...props}
              />
            )}
          </Field>
          <Field
            name="verify_email_body"
            validate={[
              custom((value) => {
                if (!value && getValue(form, "enabled")) {
                  return false;
                }
                return true;
              }, t("platform.email.form.verifyEmailBody.required")),
            ]}
          >
            {(field) => (
              <Editor
                form={form}
                lineNumbers
                class="h-80"
                lang="html"
                placeholder="xHTML (RFC 2557)"
                title={t("platform.email.form.verifyEmailBody.label")}
                name="verify_email_body"
                value={field.value ?? undefined}
                error={field.error}
              />
            )}
          </Field>
          <Divider direction="horizontal" />
          <Field
            name="reset_password_email_subject"
            validate={[
              custom((value) => {
                if (!value && getValue(form, "enabled")) {
                  return false;
                }
                return true;
              }, t("platform.email.form.resetPasswordEmailSubject.required")),
            ]}
          >
            {(field, props) => (
              <Input
                class="flex-1"
                disabled={getValue(form, "enabled") === false}
                title={t("platform.email.form.resetPasswordEmailSubject.label")}
                placeholder={t("platform.email.form.resetPasswordEmailSubject.placeholder")}
                icon={<span class="shrink-0 icon-[fluent--emoji-20-regular] w-5 h-5" />}
                value={field.value ?? undefined}
                error={field.error}
                {...props}
              />
            )}
          </Field>
          <Field
            name="reset_password_email_body"
            validate={[
              custom((value) => {
                if (!value && getValue(form, "enabled")) {
                  return false;
                }
                return true;
              }, t("platform.email.form.resetPasswordEmailBody.required")),
            ]}
          >
            {(field) => (
              <Editor
                form={form}
                lineNumbers
                class="h-80"
                lang="html"
                placeholder="xHTML (RFC 2557)"
                title={t("platform.email.form.resetPasswordEmailBody.label")}
                name="reset_password_email_body"
                value={field.value ?? undefined}
                error={field.error}
              />
            )}
          </Field>
          <Button
            type="submit"
            level="primary"
            class="mt-4!"
            loading={config.isLoading || mutation.isPending}
            disabled={config.isLoading || mutation.isPending}
          >
            {t("general.actions.save.title")}
          </Button>
        </Form>
      </div>
    </>
  );
}
