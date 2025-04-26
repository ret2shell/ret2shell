import { handleHttpError } from "@api";
import { getPlatformConfig, updatePlatformConfig } from "@api/platform";
import type { Config, MediaConfig } from "@models/config";
import { createForm, setValues } from "@modular-forms/solid";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import Input from "@widgets/input";
import Slider from "@widgets/slider";
import type { HTTPError } from "ky";
import { createSignal, onMount } from "solid-js";

export default function () {
  const [form, { Form, Field }] = createForm<MediaConfig>();
  const [loading, setLoading] = createSignal(false);
  const [config, setConfig] = createSignal(null as null | Config);
  onMount(async () => {
    try {
      const resp = await getPlatformConfig();
      setConfig(resp);
      setValues(form, {
        path: resp.media.path,
        limit: resp.media.limit,
        anti_theft: resp.media.anti_theft,
      });
    } catch (err) {
      handleHttpError(err as Error, t("errors.500")!);
    }
  });
  async function onSubmit(result: MediaConfig) {
    setLoading(true);
    if (!config()) {
      addToast({
        level: "error",
        description: t("admin.platform.fetchNotReady")!,
        duration: 5000,
      });
      return;
    }
    const mergedConfig = {
      ...config(),
      media: result,
    } as Config;
    try {
      await updatePlatformConfig(mergedConfig);
      setConfig(mergedConfig);
      addToast({
        level: "success",
        description: t("admin.platform.updateSuccess")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("admin.platform.updateFailed")!);
    }
    setLoading(false);
  }
  return (
    <>
      <Title page={t("admin.media.title")} route="/admin/media" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
        <Form onSubmit={onSubmit} class="w-full max-w-5xl flex flex-col space-y-2">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("admin.media.title")}</span>
          </h3>
          <Field name="path">
            {(field, props) => (
              <Input
                class="flex-1"
                disabled
                title={t("admin.media.path")}
                placeholder={t("admin.media.path")}
                icon={<span class="icon-[fluent--server-link-20-regular] w-5 h-5" />}
                value={field.value}
                error={field.error}
                {...props}
              />
            )}
          </Field>
          <div class="flex flex-col space-y-2 lg:flex-row lg:space-y-0 lg:space-x-2 lg:items-end">
            <Field name="anti_theft" type="boolean">
              {(field, props) => (
                <Checkbox
                  inputProps={props}
                  title={t("admin.media.antiTheft")}
                  checked={field.value ?? false}
                  error={field.error}
                >
                  <span class="flex-1 text-start">{t("admin.media.antiTheft")}</span>
                </Checkbox>
              )}
            </Field>
            <Field name="limit" type="number">
              {(field, props) => (
                <Slider
                  class="flex-1"
                  label={t("admin.media.limit")!}
                  max={1000}
                  min={10}
                  step={10}
                  name={field.name}
                  value={[field.value || 1]}
                  inputProps={props}
                  onValueChange={(e: { value: [number] }) => {
                    setValues(form, { [field.name]: e.value[0] });
                  }}
                />
              )}
            </Field>
          </div>
          <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={!config() || loading()}>
            {t("form.save")}
          </Button>
        </Form>
      </div>
    </>
  );
}
