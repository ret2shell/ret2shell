import { usePlatformConfig, useUpdatePlatformConfigMutation } from "@api/platform";
import type { Config, MediaConfig } from "@models/config";
import { createForm, setValues } from "@modular-forms/solid";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import Input from "@widgets/input";
import Slider from "@widgets/slider";
import { createTrackedEffect, untrack } from "solid-js";

export default function () {
  const config = usePlatformConfig();
  const [form, { Form, Field }] = createForm<MediaConfig>({
    initialValues: {
      path: config.data?.media.path,
      limit: config.data?.media.limit,
      anti_theft: config.data?.media.anti_theft,
    },
  });
  const mutation = useUpdatePlatformConfigMutation();
  createTrackedEffect(() => {
    if (config.data) {
      untrack(() => {
        setValues(form, {
          path: config.data.media.path,
          limit: config.data.media.limit,
          anti_theft: config.data.media.anti_theft,
        });
      });
    }
  });
  async function onSubmit(result: MediaConfig) {
    const mergedConfig = {
      ...config.data,
      media: result,
    } as Config;
    mutation.mutate(mergedConfig);
  }
  return (
    <>
      <Title page={t("media.title")} route="/admin/media" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
        <Form onSubmit={onSubmit} class="w-full max-w-5xl flex flex-col space-y-2">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("media.title")}</span>
          </h3>
          <Field name="path">
            {(field, props) => (
              <Input
                class="flex-1"
                disabled
                title={t("media.form.path.label")}
                placeholder={t("media.form.path.placeholder")}
                icon={<span class="shrink-0 icon-[fluent--server-link-20-regular] w-5 h-5" />}
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
                  title={t("media.form.antiTheft.label")}
                  checked={field.value ?? false}
                  error={field.error}
                >
                  <span class="flex-1 text-start">{t("media.form.antiTheft.label")}</span>
                </Checkbox>
              )}
            </Field>
            <Field name="limit" type="number">
              {(field, props) => (
                <Slider
                  class="flex-1"
                  label={t("media.form.limit.label")}
                  max={1000}
                  min={10}
                  step={10}
                  name={field.name}
                  value={[field.value || 1]}
                  inputProps={props}
                  onValueChange={(e) => {
                    setValues(form, { [field.name]: e.value[0] });
                  }}
                />
              )}
            </Field>
          </div>
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
