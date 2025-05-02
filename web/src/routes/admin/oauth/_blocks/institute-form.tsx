import type { Institute } from "@models/institute";
import type { OAuthProvider } from "@models/oauth-provider";
import { createForm, required, setValues } from "@modular-forms/solid";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Input from "@widgets/input";
import Select from "@widgets/select";
import { createEffect, untrack } from "solid-js";

type FormType = {
  name: string;
  provider?: string;
  token?: string;
};

export default function InstituteForm(props: {
  oauthServices: OAuthProvider[];
  onDone?: (result: Institute) => void;
  editSource?: Institute;
  loading?: boolean;
}) {
  const [form, { Form, Field }] = createForm<FormType>();
  createEffect(() => {
    if (props.editSource) {
      untrack(() => {
        setValues(form, {
          name: props.editSource!.name,
          provider: props.editSource?.provider || undefined,
          token: props.editSource?.token || undefined,
        });
      });
    }
  });
  function onSubmit(result: FormType) {
    props.onDone?.({
      id: props.editSource?.id || 0,
      name: result.name,
      description: null,
      logo: null,
      provider: result.provider || null,
      token: result.token || null,
    });
  }
  return (
    <Form onSubmit={onSubmit} class="flex flex-col w-96 space-y-2 relative">
      <Field name="name" validate={[required(t("institute.form.name.required")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
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
            label={t("institute.form.provider.label")!}
            class="flex-1"
            error={field.error}
            placeholder={t("institute.form.provider.placeholder")!}
            items={props.oauthServices.map((service) => {
              return {
                value: service.provider,
                label: service.name,
                icon: "icon-[fluent--hat-graduation-20-regular]",
              };
            })}
            value={field.value ? [field.value as string] : undefined}
            inputProps={fieldProps}
          />
        )}
      </Field>
      <Field name="token">
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--key-20-regular] w-5 h-5" />}
            title={t("institute.form.token.label")}
            placeholder={t("institute.form.token.placeholder")}
            {...props}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Button type="submit" level="primary" class="!mt-4" loading={props.loading} disabled={props.loading}>
        {props.editSource ? t("general.actions.save.title") : t("general.actions.create.title")}
      </Button>
    </Form>
  );
}
