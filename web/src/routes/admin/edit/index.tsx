import { useGames } from "@api/game";
import { usePlatformConfig, usePlatformInfo, useUpdatePlatformConfigMutation } from "@api/platform";
import LogoAnimate from "@assets/animates/logo-animate";
import type { Config } from "@models/config";
import { createForm, setValues } from "@modular-forms/solid";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import FormDraftReset from "@widgets/form-draft-reset";
import Input from "@widgets/input";
import Select from "@widgets/select";
import { DateTime } from "luxon";
import { createMemo } from "solid-js";

type PlatformConfigForm = {
  name?: string;
  footer_info?: string;
  footer_url?: string;
  subject_info?: string;
  subject_url?: string;
  record?: string;
  hide_maker: boolean;
  highlight_banner?: string;
  zen_game?: number | null;
};

export default function () {
  const config = usePlatformConfig();
  const info = usePlatformInfo();
  const [form, { Form, Field }] = createForm<PlatformConfigForm>({
    initialValues: {
      ...JSON.parse(JSON.stringify(config.data?.server || {})),
    },
  });
  const remoteValues = createMemo<PlatformConfigForm>(() => ({
    name: config.data?.server.name || "",
    footer_info: config.data?.server.footer_info || "",
    footer_url: config.data?.server.footer_url || "",
    subject_info: config.data?.server.subject_info || "",
    subject_url: config.data?.server.subject_url || "",
    record: config.data?.server.record || "",
    hide_maker: false,
    highlight_banner: config.data?.server.highlight_banner || "",
    zen_game: config.data?.server.zen_game || null,
  }));
  const games = useGames({
    weight: () => 3,
  });
  const mutation = useUpdatePlatformConfigMutation({
    onSuccess: async () => {
      await Promise.all([config.refetch(), info.refetch()]);
      draft.discardDraft();
    },
  });
  async function onSubmit(result: PlatformConfigForm) {
    const mergedConfig = {
      ...config.data,
      server: {
        ...config.data?.server,
        name: result.name,
        footer_info: result.footer_info,
        footer_url: result.footer_url,
        subject_info: result.subject_info,
        subject_url: result.subject_url,
        record: result.record,
        hide_maker: false,
        highlight_banner: result.highlight_banner,
        zen_game: result.zen_game,
      },
    } as Config;
    mutation.mutate(mergedConfig);
  }
  const draft = useFormDraft({
    form,
    key: () => buildFormDraftKey("admin", "edit"),
    remoteValues,
    enabled: () => !!config.data,
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
                icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
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
                icon={<span class="shrink-0 icon-[fluent--phone-footer-arrow-down-20-regular] w-5 h-5" />}
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
                icon={<span class="shrink-0 icon-[fluent--link-20-regular] w-5 h-5" />}
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
                icon={<span class="shrink-0 icon-[fluent--subtitles-20-regular] w-5 h-5" />}
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
                icon={<span class="shrink-0 icon-[fluent--link-20-regular] w-5 h-5" />}
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
                icon={<span class="shrink-0 icon-[fluent--image-20-regular] w-5 h-5" />}
                placeholder={t("platform.form.highlightBanner.placeholder")}
                title={t("platform.form.highlightBanner.label")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Field name="zen_game" type="number">
            {(field, props) => (
              <Select
                name={field.name}
                label={t("platform.form.zenGame.label")}
                class="flex-1"
                error={field.error}
                placeholder={t("platform.form.zenGame.placeholder")}
                items={
                  games.data?.[0]
                    .filter((g) => g.archive_at > DateTime.now())
                    .map((game) => ({
                      value: game.id.toString(),
                      label: `${game.name} => ~ ${game.archive_at.toFormat("yyyy-MM-dd HH:mm:ss")}`,
                      icon: "icon-[fluent--flag-20-regular]",
                    })) ?? []
                }
                inputProps={props}
                value={field.value ? [field.value.toString()] : []}
                onValueChange={(val) => {
                  const gameId = val.value.length > 0 ? Number.parseInt(val.value[0], 10) : null;
                  setValues(form, { zen_game: gameId });
                }}
              />
            )}
          </Field>
          <Field name="record">
            {(field, props) => (
              <Input
                class="flex-1"
                icon={<span class="shrink-0 icon-[fluent--record-20-regular] w-5 h-5" />}
                placeholder={t("platform.form.record.placeholder")}
                title={t("platform.form.record.label")}
                {...props}
                value={field.value}
                error={field.error}
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
