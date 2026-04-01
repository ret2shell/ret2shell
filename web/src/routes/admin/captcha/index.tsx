import { usePlatformConfig, useUpdatePlatformConfigMutation } from "@api/platform";
import type { CaptchaConfig, Config } from "@models/config";
import { createForm, getValue, required, setValues } from "@modular-forms/solid";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Checkbox from "@widgets/checkbox";
import FormDraftReset from "@widgets/form-draft-reset";
import Select from "@widgets/select";
import Slider from "@widgets/slider";
import { createMemo, Show } from "solid-js";

export default function () {
  const config = usePlatformConfig();
  const [form, { Form, Field }] = createForm<CaptchaConfig>({
    initialValues: {
      enabled: config.data?.captcha.enabled,
      difficulty: config.data?.captcha.difficulty,
      validator: config.data?.captcha.validator,
    },
  });
  const remoteValues = createMemo<CaptchaConfig>(() => ({
    enabled: config.data?.captcha.enabled ?? false,
    difficulty: config.data ? config.data.captcha.difficulty : 1,
    validator: config.data?.captcha.validator ?? "none",
  }));
  const mutation = useUpdatePlatformConfigMutation({
    onSuccess: async () => {
      await config.refetch();
      draft.discardDraft();
    },
  });
  const draft = useFormDraft({
    form,
    key: () => buildFormDraftKey("admin", "captcha"),
    remoteValues,
    enabled: () => !!config.data,
  });

  async function onSubmit(result: CaptchaConfig) {
    const mergedConfig = {
      ...config.data,
      captcha: {
        enabled: result.enabled,
        difficulty: result.difficulty,
        validator: result.validator,
      },
    } as Config;
    mutation.mutate(mergedConfig);
  }
  return (
    <>
      <Title page={t("captcha.title")} route="/admin/captcha" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
        <Form onSubmit={onSubmit} class="w-full max-w-5xl flex flex-col space-y-2">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
            <span>{t("captcha.title")}</span>
          </h3>
          <Show when={form.dirty || draft.hasDraft()}>
            <Card level="warning" contentClass="p-2 flex flex-row space-x-2 items-center pl-4">
              <span class="shrink-0 icon-[fluent--warning-20-filled] w-5 h-5" />
              <span class="flex-1 text-start">{t("account.form.saveHint")}</span>
            </Card>
          </Show>
          <div class="flex flex-col space-y-2 lg:flex-row lg:space-y-0 lg:space-x-2 lg:items-end">
            <Field name="enabled" type="boolean">
              {(field, props) => (
                <Checkbox
                  class="flex-1"
                  inputProps={props}
                  checked={field.value}
                  error={field.error}
                  title={t("captcha.form.enabled.label")}
                >
                  <span class="flex-1 text-start">{t("captcha.form.enabled.label")}</span>
                </Checkbox>
              )}
            </Field>
            <Field name="validator" validate={[required(t("captcha.form.validator.required"))]}>
              {(field, props) => (
                <Select
                  name={field.name}
                  label={t("captcha.form.validator.label")}
                  disabled={getValue(form, "enabled") === false}
                  class="flex-1"
                  error={field.error}
                  placeholder={t("captcha.form.validator.placeholder")}
                  items={[
                    {
                      value: "pow",
                      label: t("captcha.form.validator.type.pow"),
                      icon: "icon-[fluent--code-20-regular]",
                    },
                    {
                      value: "image",
                      label: t("captcha.form.validator.type.image"),
                      icon: "icon-[fluent--image-20-regular]",
                    },
                  ]}
                  inputProps={props}
                  value={field.value ? [field.value] : ["1111"]}
                />
              )}
            </Field>
          </div>
          <Field name="difficulty" type="number">
            {(field, props) => (
              <Slider
                disabled={getValue(form, "enabled") === false}
                class="flex-1"
                label={t("captcha.form.difficulty.label")}
                max={10}
                min={1}
                step={1}
                name={field.name}
                value={[field.value || 1]}
                inputProps={props}
                onValueChange={(e) => {
                  setValues(form, { [field.name]: e.value[0] });
                }}
              />
            )}
          </Field>
          <div class="mt-4! flex flex-row space-x-2">
            <Button
              type="submit"
              level="primary"
              class="flex-1"
              loading={config.isLoading || mutation.isPending}
              disabled={config.isLoading || mutation.isPending}
            >
              {t("general.actions.save.title")}
            </Button>
            <FormDraftReset
              when={draft.hasDraft()}
              loading={config.isLoading || mutation.isPending}
              disabled={config.isLoading || mutation.isPending}
              onConfirm={draft.discardDraft}
            />
          </div>
        </Form>
      </div>
    </>
  );
}
