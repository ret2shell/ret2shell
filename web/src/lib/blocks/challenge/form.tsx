import type { Challenge } from "@models/challenge";
import { createForm, getValue, required, setValue } from "@modular-forms/solid";
import { gameStore } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import Input from "@widgets/input";
import Select from "@widgets/select";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { Show, createEffect, untrack } from "solid-js";
import ScorePicker from "./score-picker";

export type ChallengeForm = {
  name: string;
  content: string;
  tag: string;
  initial: number;
  minimum: number;
  decay: number;
  release_at: number | null;
  archive_at: number | null;
};

export function FormBare(props: {
  onDone: (challenge: ChallengeForm) => void;
  editSource?: Challenge;
  loading?: boolean;
  inGame?: boolean;
}) {
  const [form, { Form, Field }] = createForm<ChallengeForm>();
  function onSubmit(result: ChallengeForm) {
    props.onDone(result);
  }
  createEffect(() => {
    if (props.editSource) {
      untrack(() => {
        setValue(form, "name", props.editSource!.name);
        setValue(form, "tag", props.editSource!.tag.map((t) => t.name).join("/"));
        setValue(form, "content", props.editSource!.content || "");
        if (props.editSource?.score_rule) {
          setValue(form, "initial", props.editSource.score_rule.initial);
          setValue(form, "minimum", props.editSource.score_rule.minimum);
          setValue(form, "decay", props.editSource.score_rule.decay);
        } else {
          setValue(form, "initial", 1000);
          setValue(form, "minimum", 500);
          setValue(form, "decay", 10);
        }
        setValue(form, "release_at", props.editSource!.release_at?.toSeconds() ?? null);
        setValue(form, "archive_at", props.editSource!.archive_at?.toSeconds() ?? null);
      });
    } else {
      setValue(form, "initial", 1000);
      setValue(form, "minimum", 500);
      setValue(form, "decay", 15);
    }
  });

  return (
    <Form onSubmit={onSubmit} class="flex flex-col w-full max-w-5xl space-y-2 relative">
      <Field name="name" validate={[required(t("challenge.form.name.required")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
            title={t("challenge.form.name.label")}
            placeholder={t("challenge.form.name.placeholder")}
            {...props}
            value={field.value}
            error={field.error}
            required
          />
        )}
      </Field>
      <Field name="tag" validate={[required(t("challenge.form.tag.required")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--tag-20-regular] w-5 h-5" />}
            title={t("challenge.form.tag.label")}
            placeholder={t("challenge.form.tag.placeholder")}
            {...props}
            value={field.value}
            error={field.error}
            required
          />
        )}
      </Field>
      <Show when={props.inGame}>
        <div class="flex space-y-2 lg:space-x-2 lg:space-y-0 flex-col lg:flex-row">
          <Field name="initial" type="number">
            {(initialField, initialProps) => (
              <Field name="minimum" type="number">
                {(minField, minProps) => (
                  <Field name="decay" type="number">
                    {(decayField, decayProps) => (
                      <>
                        <div class="flex flex-col space-y-2 flex-1">
                          <Input
                            icon={<span class="icon-[fluent--chevron-double-up-20-regular] w-5 h-5" />}
                            title={t("challenge.form.scoreRule.initial.label")}
                            placeholder={t("challenge.form.scoreRule.initial.placeholder")}
                            {...initialProps}
                            value={initialField.value}
                            error={initialField.error}
                            type="number"
                            min={0}
                            max={1500}
                            required
                          />
                          <Input
                            icon={<span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5" />}
                            title={t("challenge.form.scoreRule.minimum.label")}
                            placeholder={t("challenge.form.scoreRule.minimum.placeholder")}
                            {...minProps}
                            value={minField.value}
                            error={minField.error}
                            type="number"
                            min={0}
                            max={1500}
                            required
                          />
                          <Input
                            icon={<span class="icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
                            title={t("challenge.form.scoreRule.decay.label")}
                            placeholder={t("challenge.form.scoreRule.decay.placeholder")}
                            {...decayProps}
                            value={decayField.value}
                            error={decayField.error}
                            type="number"
                            min={1}
                            max={50}
                            required
                          />
                        </div>
                        <ScorePicker
                          class="flex-1"
                          max={initialField.value ?? 0}
                          onChangeMax={(v) => {
                            setValue(form, "initial", v);
                          }}
                          min={minField.value ?? 0}
                          onChangeMin={(v) => {
                            setValue(form, "minimum", v);
                          }}
                          decay={decayField.value || 10}
                          onChangeDecay={(v) => {
                            setValue(form, "decay", v);
                          }}
                        />
                      </>
                    )}
                  </Field>
                )}
              </Field>
            )}
          </Field>
        </div>
      </Show>
      <Show when={props.inGame && (gameStore.current?.timeline_presets?.length ?? 0) > 0}>
        <Field name="release_at" type="number">
          {() => (
            <Field name="archive_at" type="number">
              {() => (
                <>
                  <Select
                    placeholder={t("challenge.form.scoringPeriod.placeholder")}
                    label={t("challenge.form.scoringPeriod.label")}
                    class="flex-1"
                    items={
                      gameStore.current?.timeline_presets?.map((t) => {
                        return {
                          value: t.label,
                          label: `${t.start_at.toFormat("yyyy-MM-dd HH:mm:ss")} - ${t.end_at.toFormat("yyyy-MM-dd HH:mm:ss")}: ${t.label}`,
                        };
                      }) ?? []
                    }
                    value={
                      [
                        gameStore.current?.timeline_presets?.find(
                          (i) =>
                            i.start_at.toSeconds() === getValue(form, "release_at") &&
                            i.end_at.toSeconds() === getValue(form, "archive_at")
                        )?.label ?? "",
                      ].filter((s) => s) ?? []
                    }
                    onValueChange={(v) => {
                      if (v.value[0]) {
                        const item = gameStore.current?.timeline_presets?.find((i) => i.label === v.value[0]);
                        setValue(form, "release_at", item?.start_at.toSeconds() ?? null);
                        setValue(form, "archive_at", item?.end_at.toSeconds() ?? null);
                      } else {
                        setValue(form, "release_at", null);
                        setValue(form, "archive_at", null);
                      }
                    }}
                  />
                </>
              )}
            </Field>
          )}
        </Field>
      </Show>
      <Field name="content" validate={[required(t("challenge.form.content.required")!)]}>
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="h-96"
            lang="markdown"
            placeholder="MARKDOWN"
            title={t("challenge.form.content.label")}
            name="content"
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

export default function (props: {
  onDone: (challenge: ChallengeForm) => void;
  editSource?: Challenge;
  loading?: boolean;
  inGame?: boolean;
}) {
  return (
    <div class="flex-1 w-full relative">
      <div class="absolute top-0 left-0 w-full h-full overflow-hidden">
        <OverlayScrollbarsComponent
          options={{
            scrollbars: {
              theme: `os-theme-${fullTheme()}`,
              autoHide: "scroll",
            },
          }}
          class="relative w-full h-full print:h-auto print:overflow-auto"
          defer
        >
          <div class="flex flex-col p-3 lg:p-6 w-full items-center">
            <h3 class="h-12 w-full max-w-5xl mb-2 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
              <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
              <span>{t("general.actions.create.title")}</span>
            </h3>
            <FormBare {...props} />
          </div>
        </OverlayScrollbarsComponent>
      </div>
    </div>
  );
}
