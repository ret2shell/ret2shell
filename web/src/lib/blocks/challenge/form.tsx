import type { Challenge } from "@models/challenge";
import { createForm, getValue, required, setValue } from "@modular-forms/solid";
import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Editor from "@widgets/editor";
import Input from "@widgets/input";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { Show, createEffect, untrack } from "solid-js";
import ScorePicker from "./score-picker";
import Select from "@widgets/select";
import { gameStore } from "@storage/game";

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
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("game.challenge.create")}</span>
      </h3>
      <Field name="name" validate={[required(t("game.challenge.nameRequired")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
            title={t("game.challenge.name")}
            placeholder={t("game.challenge.name")}
            {...props}
            value={field.value}
            error={field.error}
            required
          />
        )}
      </Field>
      <Field name="tag" validate={[required(t("game.challenge.tagRequired")!)]}>
        {(field, props) => (
          <Input
            icon={<span class="icon-[fluent--tag-20-regular] w-5 h-5" />}
            title={t("game.challenge.tag")}
            placeholder={t("game.challenge.tagPlaceholder")}
            {...props}
            value={field.value}
            error={field.error}
            required
          />
        )}
      </Field>
      <Show when={props.inGame}>
        <div class="flex space-y-2 xl:space-x-2 xl:space-y-0 flex-col xl:flex-row">
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
                            title={t("game.challenge.maxScore")}
                            placeholder={t("game.challenge.maxScore")}
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
                            title={t("game.challenge.minScore")}
                            placeholder={t("game.challenge.minScore")}
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
                            title={t("game.challenge.scoreDecay")}
                            placeholder={t("game.challenge.scoreDecay")}
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
                    placeholder={t("game.challenge.releasePeriodPlaceholder")}
                    label={t("game.challenge.releasePeriod")}
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
      <Field name="content" validate={[required(t("game.challenge.contentRequired")!)]}>
        {(field) => (
          <Editor
            form={form}
            lineNumbers
            class="h-96"
            lang="markdown"
            placeholder="MARKDOWN"
            title={t("game.challenge.content")}
            name="content"
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
            <FormBare {...props} />
          </div>
        </OverlayScrollbarsComponent>
      </div>
    </div>
  );
}
