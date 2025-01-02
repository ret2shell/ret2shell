import { handleHttpError } from "@api";
import { getPlatformConfig, updatePlatformConfig } from "@api/platform";
import type { Config, EmailConfig } from "@models/config";
import { createForm, custom, getValue, setValues } from "@modular-forms/solid";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import Divider from "@widgets/divider";
import Editor from "@widgets/editor";
import Input from "@widgets/input";
import Select from "@widgets/select";
import type { HTTPError } from "ky";
import { createSignal, onMount } from "solid-js";

export default function () {
  const [form, { Form, Field }] = createForm<EmailConfig>();
  const [loading, setLoading] = createSignal(false);
  const [config, setConfig] = createSignal(null as null | Config);
  onMount(async () => {
    try {
      const resp = await getPlatformConfig();
      setConfig(resp);
      setValues(form, {
        ...resp.email,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("errors.500")!);
    }
  });

  async function onSubmit(result: EmailConfig) {
    setLoading(true);
    try {
      await updatePlatformConfig({
        ...config()!,
        email: {
          ...config()?.email,
          ...result,
        },
      });
      addToast({
        level: "success",
        description: t("form.saveSuccess")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("form.saveFailed")!);
    }
    setLoading(false);
  }

  return (
    <>
      <Title page={t("admin.email.title")} route="/admin/email" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
        <Form onSubmit={onSubmit} class="w-full max-w-5xl flex flex-col space-y-2">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--mail-20-regular] w-5 h-5" />
            <span>{t("admin.email.title")}</span>
          </h3>
          <Field name="enabled" type="boolean">
            {(field, props) => (
              <Checkbox
                inputProps={props}
                title={t("admin.email.enabled")}
                checked={field.value ?? false}
                error={field.error}
              >
                <span class="flex-1 text-start">{t("admin.email.enabled")}</span>
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
                }, t("admin.email.tlsRequired")!),
              ]}
            >
              {(field, props) => (
                <Select
                  name={field.name}
                  label={t("admin.email.tls")!}
                  disabled={getValue(form, "enabled") === false}
                  class="flex-1 max-w-64"
                  error={field.error}
                  placeholder={t("admin.email.tlsRequired")}
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
                }, t("admin.email.hostRequired")!),
              ]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  disabled={getValue(form, "enabled") === false}
                  title={t("admin.email.host")}
                  placeholder={t("admin.email.host")}
                  icon={<span class="icon-[fluent--server-link-20-regular] w-5 h-5" />}
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
                }, t("admin.email.portRequired")!),
                custom((value) => {
                  if (value && (value < 1 || value > 65535)) {
                    return false;
                  }
                  return true;
                }, t("admin.email.portRangeNotMatch")!),
              ]}
            >
              {(field, props) => (
                <Input
                  type="number"
                  disabled={getValue(form, "enabled") === false}
                  title={t("admin.email.port")}
                  placeholder={t("admin.email.port")}
                  class="w-36"
                  icon={<span class="icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
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
              }, t("admin.email.senderRequired")!),
            ]}
          >
            {(field, props) => (
              <Input
                class="flex-1"
                disabled={getValue(form, "enabled") === false}
                title={t("admin.email.sender")}
                placeholder={t("admin.email.sender")}
                icon={<span class="icon-[fluent--emoji-20-regular] w-5 h-5" />}
                value={field.value}
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
                }, t("admin.email.usernameRequired")!),
              ]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  disabled={getValue(form, "enabled") === false}
                  title={t("admin.email.username")}
                  placeholder={t("admin.email.username")}
                  icon={<span class="icon-[fluent--mail-20-regular] w-5 h-5" />}
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
                }, t("admin.email.passwordRequired")!),
              ]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  disabled={getValue(form, "enabled") === false}
                  type="password"
                  title={t("admin.email.password")}
                  placeholder={t("admin.email.password")}
                  icon={<span class="icon-[fluent--lock-20-regular] w-5 h-5" />}
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
              }, t("admin.email.verifyEmailSubjectRequired")!),
            ]}
          >
            {(field, props) => (
              <Input
                class="flex-1"
                disabled={getValue(form, "enabled") === false}
                title={t("admin.email.verifyEmailSubject")}
                placeholder={t("admin.email.verifyEmailSubject")}
                icon={<span class="icon-[fluent--emoji-20-regular] w-5 h-5" />}
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
              }, t("admin.email.verifyEmailBodyRequired")!),
            ]}
          >
            {(field) => (
              <Editor
                form={form}
                lineNumbers
                class="h-80"
                lang="html"
                placeholder="xHTML (RFC 2557)"
                title={t("admin.email.verifyEmailBody")}
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
              }, t("admin.email.resetEmailSubjectRequired")!),
            ]}
          >
            {(field, props) => (
              <Input
                class="flex-1"
                disabled={getValue(form, "enabled") === false}
                title={t("admin.email.resetEmailSubject")}
                placeholder={t("admin.email.resetEmailSubject")}
                icon={<span class="icon-[fluent--emoji-20-regular] w-5 h-5" />}
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
              }, t("admin.email.resetEmailBodyRequired")!),
            ]}
          >
            {(field) => (
              <Editor
                form={form}
                lineNumbers
                class="h-80"
                lang="html"
                placeholder="xHTML (RFC 2557)"
                title={t("admin.email.resetEmailBody")}
                name="reset_password_email_body"
                value={field.value ?? undefined}
                error={field.error}
              />
            )}
          </Field>
          <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={!config() || loading()}>
            {t("form.save")}
          </Button>
        </Form>
      </div>
    </>
  );
}
