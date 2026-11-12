import { handleHttpError } from "@api";
import { bindSyncDistribution, importRepository, useUpdateSyncDistributionMutation } from "@api/sync";
import type { SyncDistribution } from "@models/sync";
import { createForm, getValue, pattern, required, setValue, url } from "@modular-forms/solid";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Checkbox from "@widgets/checkbox";
import Input from "@widgets/input";
import { createSignal, Show } from "solid-js";

type DistributionFormType = {
  endpoint: string;
  token: string;
  local_game_id: string;
  interval_seconds: number | undefined;
  enabled: boolean;
};

const gameIdPattern = /^[1-9][0-9]*$/;

function positiveInterval(value: number | undefined): string {
  return !value || Number.isInteger(value) ? "" : t("platform.sync.form.interval.invalid");
}

/**
 * Import / edit form. When `distribution` is absent the form runs a one-shot
 * import: the server discovers the real bucket id and admission HEAD from the
 * source instance, imports the game verbatim and creates the distribution.
 * The token field is intentionally not prefilled in edit mode: an empty value
 * keeps the stored credential, and the API never returns it.
 */
export default function DistributionForm(props: {
  distribution?: SyncDistribution;
  onDone?: () => void;
  loading?: boolean;
}) {
  const editing = () => !!props.distribution;
  const updateMutation = useUpdateSyncDistributionMutation({
    onSuccess: () => props.onDone?.(),
  });
  const [importLog, setImportLog] = createSignal("");
  const [importing, setImporting] = createSignal(false);
  const [importFailed, setImportFailed] = createSignal<string | null>(null);
  const [bindPending, setBindPending] = createSignal(false);
  const [form, { Form, Field }] = createForm<DistributionFormType>({
    initialValues: {
      endpoint: props.distribution?.endpoint ?? "",
      token: "",
      local_game_id: "",
      interval_seconds: props.distribution?.interval_seconds ?? undefined,
      enabled: props.distribution?.enabled ?? true,
    },
  });

  async function onSubmit(result: DistributionFormType) {
    setImportFailed(null);
    if (!editing()) {
      setImportLog("");
      setImporting(true);
      let gameId: number | undefined;
      try {
        const progress = await importRepository({ endpoint: result.endpoint, token: result.token }, (chunk) =>
          setImportLog((previous) => previous + chunk)
        );
        gameId = progress.gameId;
      } catch (err) {
        handleHttpError(err as Error, t("platform.sync.actions.import.status.fail"));
        setImporting(false);
        return;
      }
      setImporting(false);
      if (gameId === undefined) {
        setImportFailed(t("platform.sync.actions.import.status.noGameId"));
        return;
      }
      setValue(form, "token", "");
      props.onDone?.();
      return;
    }

    const distribution = props.distribution!;
    await updateMutation.mutateAsync({
      id: distribution.id,
      req: {
        ...(result.token.trim() !== "" ? { token: result.token.trim() } : {}),
        interval_seconds: result.interval_seconds ?? null,
        enabled: result.enabled,
      },
    });
    setValue(form, "token", "");
  }

  async function bindGame() {
    const distribution = props.distribution!;
    const boundGameId = getValue(form, "local_game_id")?.trim();
    if (!boundGameId) {
      return;
    }
    setBindPending(true);
    try {
      await bindSyncDistribution(distribution.id, Number.parseInt(boundGameId, 10));
    } catch (err) {
      handleHttpError(err as Error, t("platform.sync.actions.bind.status.fail"));
      setBindPending(false);
      return;
    }
    setBindPending(false);
    setValue(form, "local_game_id", "");
    props.onDone?.();
  }

  const pending = () => importing() || props.loading || updateMutation.isPending;

  return (
    <Form onSubmit={onSubmit} class="flex flex-col w-screen max-w-2xl space-y-2">
      <Show when={!editing()}>
        <Field
          name="endpoint"
          validate={[
            required(t("platform.sync.form.endpoint.required")),
            url(t("platform.sync.form.endpoint.invalid")),
          ]}
        >
          {(field, props2) => (
            <Input
              icon={<span class="shrink-0 icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5" />}
              title={t("platform.sync.form.endpoint.label")}
              placeholder={t("platform.sync.form.endpoint.placeholder")}
              autocomplete="off"
              {...props2}
              value={field.value}
              error={field.error}
              required
            />
          )}
        </Field>
        <p class="text-sm opacity-60">{t("platform.sync.form.endpoint.hint")}</p>
      </Show>
      <Field name="token" validate={editing() ? [] : [required(t("platform.sync.form.token.required"))]}>
        {(field, props2) => (
          <Input
            icon={<span class="shrink-0 icon-[fluent--key-20-regular] w-5 h-5" />}
            type="password"
            title={t("platform.sync.form.token.label")}
            placeholder={editing() ? t("platform.sync.form.token.keep") : t("platform.sync.form.token.placeholder")}
            autocomplete="new-password"
            {...props2}
            value={field.value}
            error={field.error}
            required={!editing()}
          />
        )}
      </Field>
      <p class="text-sm opacity-60">{t("platform.sync.form.token.hint")}</p>
      <Show when={editing()}>
        <Field name="interval_seconds" validate={[positiveInterval]}>
          {(field, props2) => (
            <Input
              class="flex-1"
              icon={<span class="shrink-0 icon-[fluent--timer-20-regular] w-5 h-5" />}
              type="number"
              min={1}
              step={1}
              title={t("platform.sync.form.interval.label")}
              placeholder={t("platform.sync.form.interval.placeholder")}
              {...props2}
              value={field.value}
              error={field.error}
            />
          )}
        </Field>
        <Field name="enabled" type="boolean">
          {(field, props2) => (
            <Checkbox
              inputProps={props2}
              title={t("platform.sync.form.enabled.label")}
              checked={field.value ?? false}
              error={field.error}
            >
              <span class="flex-1 text-start">{t("platform.sync.form.enabled.label")}</span>
            </Checkbox>
          )}
        </Field>
        <p class="text-sm opacity-60">{t("platform.sync.form.interval.hint")}</p>
        <Show when={!props.distribution?.managed_game_id}>
          <Field name="local_game_id" validate={[pattern(gameIdPattern, t("platform.sync.form.game.invalid"))]}>
            {(field, props2) => (
              <Input
                icon={<span class="shrink-0 icon-[fluent--trophy-20-regular] w-5 h-5" />}
                type="text"
                inputmode="numeric"
                title={t("platform.sync.form.game.label")}
                placeholder={t("platform.sync.form.game.placeholder")}
                autocomplete="off"
                {...props2}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Button
            type="button"
            level="primary"
            loading={bindPending()}
            disabled={bindPending() || (getValue(form, "local_game_id")?.trim() ?? "") === ""}
            onClick={() => bindGame()}
          >
            <span class="shrink-0 icon-[fluent--link-20-regular] w-5 h-5" />
            <span>{t("platform.sync.form.submit.bind")}</span>
          </Button>
          <p class="text-sm opacity-60">{t("platform.sync.form.game.hint")}</p>
        </Show>
      </Show>
      <Show when={importing() || importLog() !== ""}>
        <div class="card">
          <div class="card-content p-2">
            <h4 class="font-bold text-sm space-x-2 flex items-center">
              <span class="shrink-0 icon-[fluent--window-console-20-regular] w-5 h-5" />
              <span>{t("platform.sync.form.importLog.title")}</span>
            </h4>
            <pre class="text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto m-0 mt-2">{importLog()}</pre>
          </div>
        </div>
      </Show>
      <Show when={importFailed()}>
        <div class="text-error text-sm flex items-center space-x-2">
          <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5" />
          <span>{importFailed()}</span>
        </div>
      </Show>
      <p class="text-sm text-warning flex items-start space-x-2">
        <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5" />
        <span>{t("platform.sync.warnings.import")}</span>
      </p>
      <p class="text-sm opacity-70 flex items-start space-x-2">
        <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5" />
        <span>{t("platform.sync.warnings.authorship")}</span>
      </p>
      <Button type="submit" level="primary" class="mt-2!" loading={pending()} disabled={pending()}>
        {editing() ? t("general.actions.save.title") : t("platform.sync.form.submit.import")}
      </Button>
    </Form>
  );
}
