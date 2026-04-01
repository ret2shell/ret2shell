import { useOAuthProviders } from "@api/account";
import type { Institute } from "@models/institute";
import { createForm, required } from "@modular-forms/solid";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import FormDraftReset from "@widgets/form-draft-reset";
import Input from "@widgets/input";
import Select from "@widgets/select";
import { createMemo } from "solid-js";

type FormType = {
  name: string;
  provider?: string;
  token?: string;
};

export default function InstituteForm(props: {
  onDone?: (result: Institute) => Promise<void>;
  editSource?: Institute;
  loading?: boolean;
}) {
  const oauthProviders = useOAuthProviders();
  const [form, { Form, Field }] = createForm<FormType>({
    initialValues: {
      name: props.editSource?.name,
      provider: props.editSource?.provider || undefined,
      token: props.editSource?.token || undefined,
    },
  });
  const remoteValues = createMemo<FormType>(() => ({
    name: props.editSource?.name || "",
    provider: props.editSource?.provider || undefined,
    token: props.editSource?.token || undefined,
  }));
  const draft = useFormDraft({
    form,
    key: () => (props.editSource ? buildFormDraftKey("admin", "oauth", "institute", props.editSource.id) : undefined),
    remoteValues,
    enabled: () => !!props.editSource,
  });
  async function onSubmit(result: FormType) {
    await props.onDone?.({
      id: props.editSource?.id || 0,
      name: result.name,
      description: null,
      logo: null,
      provider: result.provider || null,
      token: result.token || null,
    });
    draft.discardDraft();
  }
  return (
    <Form onSubmit={onSubmit} class="flex flex-col w-96 space-y-2 relative">
      <Field name="name" validate={[required(t("institute.form.name.required"))]}>
        {(field, props) => (
          <Input
            icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
            title={t("institute.form.name.label")}
            placeholder={t("institute.form.name.placeholder")}
            {...props}
            value={field.value}
            error={field.error}
            required
          />
        )}
      </Field>
      <Field name="provider">
        {(field, fieldProps) => (
          <Select
            name={field.name}
            label={t("institute.form.provider.label")}
            class="flex-1"
            error={field.error}
            placeholder={t("institute.form.provider.placeholder")}
            items={
              oauthProviders.data?.map((service) => {
                return {
                  value: service.provider,
                  label: service.name,
                  icon: "icon-[fluent--hat-graduation-20-regular]",
                };
              }) || []
            }
            value={field.value ? [field.value as string] : undefined}
            inputProps={fieldProps}
          />
        )}
      </Field>
      <Field name="token">
        {(field, props) => (
          <Input
            icon={<span class="shrink-0 icon-[fluent--key-20-regular] w-5 h-5" />}
            title={t("institute.form.token.label")}
            placeholder={t("institute.form.token.placeholder")}
            {...props}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <div class="mt-4! flex flex-row space-x-2">
        <Button type="submit" level="primary" class="flex-1" loading={props.loading} disabled={props.loading}>
          {props.editSource ? t("general.actions.save.title") : t("general.actions.create.title")}
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
