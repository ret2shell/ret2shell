import type { Institute } from "@models/institute";
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
  oauthServices: string[];
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
      <Field name="name" validate={[required(t("admin.institute.nameRequired")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
            title={t("admin.institute.name")}
            placeholder={t("admin.institute.name")}
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
            label={t("admin.institute.provider")!}
            class="flex-1"
            error={field.error}
            placeholder={t("admin.institute.providerNeeded")}
            items={props.oauthServices.map((service) => {
              return {
                value: service,
                /* @ts-expect-error key is dynamic */
                label: t(`account.oauth.${service}.title`) as string,
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
            title={t("admin.institute.token")}
            placeholder={t("admin.institute.token")}
            {...props}
            value={field.value}
            error={field.error}
          />
        )}
      </Field>
      <Button type="submit" level="primary" class="!mt-4" loading={props.loading} disabled={props.loading}>
        {props.editSource ? t("form.save") : t("form.create")}
      </Button>
    </Form>
  );
}
