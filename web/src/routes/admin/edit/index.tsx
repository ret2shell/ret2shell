import { handleHttpError } from "@api";
import { getPlatformConfig, updatePlatformConfig } from "@api/platform";
import LogoAnimate from "@assets/animates/logo-animate";
import type { Config } from "@models/config";
import { createForm, custom, setValues } from "@modular-forms/solid";
import { Title } from "@storage/header";
import { platformStore, setPlatformStore } from "@storage/platform";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import Input from "@widgets/input";
import type { HTTPError } from "ky";
import { createSignal, onMount } from "solid-js";

type PlatformConfigForm = {
  name?: string;
  footer_info?: string;
  footer_url?: string;
  subject_info?: string;
  subject_url?: string;
  record?: string;
  hide_maker: boolean;
  highlight_banner?: string;
};

export default function () {
  const [form, { Form, Field }] = createForm<PlatformConfigForm>();
  const [loading, setLoading] = createSignal(false);
  const [config, setConfig] = createSignal(null as null | Config);
  async function onSubmit(result: PlatformConfigForm) {
    setLoading(true);
    if (!config()) {
      addToast({
        level: "error",
        description: t("platform.errors.fetchConfig.title")!,
        duration: 5000,
      });
      return;
    }
    const mergedConfig = {
      ...config(),
      server: {
        ...config()!.server,
        name: result.name,
        footer_info: result.footer_info,
        footer_url: result.footer_url,
        subject_info: result.subject_info,
        subject_url: result.subject_url,
        record: result.record,
        hide_maker: result.hide_maker,
        highlight_banner: result.highlight_banner,
      },
    } as Config;
    try {
      await updatePlatformConfig(mergedConfig);
      setConfig(mergedConfig);
      setPlatformStore({ config: mergedConfig.server });
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setLoading(false);
  }
  onMount(async () => {
    try {
      const resp = await getPlatformConfig();
      setConfig(resp);
      setValues(form, {
        name: resp.server.name || "",
        footer_info: resp.server.footer_info || "",
        footer_url: resp.server.footer_url || "",
        subject_info: resp.server.subject_info || "",
        subject_url: resp.server.subject_url || "",
        record: resp.server.record || "",
        hide_maker: resp.server.hide_maker || false,
        highlight_banner: resp.server.highlight_banner || "",
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("platform.errors.fetchConfig.title")!);
    }
  });
  return (
    <>
      <Title page={t("platform.form.title")} route="/admin/edit" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
        <Form onSubmit={onSubmit} class="w-full max-w-5xl flex flex-col space-y-2">
          <div class="p-6 flex items-center justify-center">
            <LogoAnimate width={128} height={128} />
          </div>
          <Field name="name">
            {(field, props) => (
              <Input
                icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                placeholder={t("platform.name")}
                title={t("platform.form.name.label")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="footer_info">
            {(field, props) => (
              <Input
                icon={<span class="icon-[fluent--phone-footer-arrow-down-20-regular] w-5 h-5" />}
                placeholder={t("platform.form.footerInfo.placeholder")}
                title={t("platform.form.footerInfo.label")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="footer_url">
            {(field, props) => (
              <Input
                icon={<span class="icon-[fluent--link-20-regular] w-5 h-5" />}
                placeholder={t("platform.form.footerUrl.placeholder")}
                title={t("platform.form.footerUrl.label")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="subject_info">
            {(field, props) => (
              <Input
                icon={<span class="icon-[fluent--subtitles-20-regular] w-5 h-5" />}
                placeholder={t("platform.subject")}
                title={t("platform.form.subjectInfo.label")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="subject_url">
            {(field, props) => (
              <Input
                icon={<span class="icon-[fluent--link-20-regular] w-5 h-5" />}
                placeholder="https://github.com/ret2shell"
                title={t("platform.form.subjectUrl.label")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="highlight_banner">
            {(field, props) => (
              <Input
                icon={<span class="icon-[fluent--image-20-regular] w-5 h-5" />}
                placeholder={t("platform.form.highlightBanner.placeholder")}
                title={t("platform.form.highlightBanner.label")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <div class="flex flex-row space-x-2">
            <Field name="record">
              {(field, props) => (
                <Input
                  class="flex-1"
                  icon={<span class="icon-[fluent--record-20-regular] w-5 h-5" />}
                  placeholder={t("platform.form.record.placeholder")}
                  title={t("platform.form.record.label")}
                  {...props}
                  value={field.value}
                  error={field.error}
                />
              )}
            </Field>
            <Field
              name="hide_maker"
              type="boolean"
              validate={[
                custom((value) => {
                  if (platformStore.license?.level !== "enterprise" && value) {
                    return false;
                  }
                  return true;
                }, t("platform.form.hideMaker.disabled")!),
              ]}
            >
              {(field, props) => (
                <Checkbox
                  inputProps={props}
                  checked={platformStore.license?.level !== "enterprise" ? false : field.value}
                  error={field.error}
                  title={t("platform.form.hideMaker.label")}
                  disabled={platformStore.license?.level !== "enterprise"}
                >
                  <span class="flex-1 text-start">{t("platform.form.hideMaker.label")}</span>
                </Checkbox>
              )}
            </Field>
          </div>
          <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={!config() || loading()}>
            {t("general.actions.save.title")}
          </Button>
        </Form>
      </div>
    </>
  );
}
