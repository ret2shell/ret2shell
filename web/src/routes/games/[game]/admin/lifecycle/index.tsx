import { useDeleteGameLifecycleMutation, useGame, useUpdateGameLifecycleMutation } from "@api/game";
import { type LifecyclePreset, lifecyclePresetEntries, lifecyclePresetMap } from "@lib/lifecycle/presets";
import { createForm, setValue } from "@modular-forms/solid";
import { useParams } from "@solidjs/router";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import { type DiagnosticMarker, EditorBare } from "@widgets/editor";
import FormDraftReset from "@widgets/form-draft-reset";
import Popover from "@widgets/popover";
import Select from "@widgets/select";
import { createEffect, createMemo, createSignal, Show } from "solid-js";

type LifecycleForm = {
  script: string;
};

export default function Lifecycle() {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });

  const [preset, setPreset] = createSignal(null as LifecyclePreset | null);
  const [lint, setLint] = createSignal([] as DiagnosticMarker[]);
  const [form, { Form, Field }] = createForm<LifecycleForm>({
    initialValues: {
      script: game.data?.lifecycle || "",
    },
  });
  const remoteValues = createMemo<LifecycleForm>(() => ({
    script: game.data?.lifecycle || "",
  }));
  const draft = useFormDraft({
    form,
    key: () => buildFormDraftKey("games", gameId(), "admin", "lifecycle"),
    remoteValues,
    enabled: () => gameId() > 0 && !!game.data,
  });
  const presetItems = createMemo(() =>
    lifecyclePresetEntries.map((preset) => ({
      label: t(preset.labelKey),
      value: preset.value,
      icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
    }))
  );

  createEffect(() => {
    if (preset()) {
      setValue(form, "script", lifecyclePresetMap[preset()!]);
    }
  });

  const hasLifecycle = createMemo(() => !!game.data?.lifecycle);

  const updateLifecycleMutation = useUpdateGameLifecycleMutation({
    onSuccess: async (resp) => {
      setLint(resp.lint ?? []);
      await game.refetch();
      draft.discardDraft();
    },
  });
  const deleteLifecycleMutation = useDeleteGameLifecycleMutation({
    onSuccess: async () => {
      setLint([]);
      await game.refetch();
      draft.discardDraft();
    },
  });

  const saving = createMemo(() => updateLifecycleMutation.isPending || deleteLifecycleMutation.isPending);

  async function handleUpdateLifecycle(result: LifecycleForm) {
    if (!game.data) return;
    updateLifecycleMutation.mutate({ game_id: game.data.id, lifecycle: result.script });
  }

  async function handleDeleteLifecycle() {
    if (!game.data) return;
    deleteLifecycleMutation.mutate({ game_id: game.data.id });
  }

  return (
    <>
      <Title page={t("lifecycle.title")} route={`/games/${gameId()}/admin/lifecycle`} />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6 lg:pb-3 relative">
        <Form onSubmit={handleUpdateLifecycle} class="flex-1 flex flex-col w-full">
          <h2 class="h-12 shrink-0 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--script-20-regular] w-5 h-5" />
            <span class="flex-1 flex items-center justify-start space-x-2">
              <span>{t("lifecycle.title")}</span>
              <span class="opacity-60">$GAME/lifecycle.rx</span>
            </span>
            <Select
              class="w-60 hidden lg:flex"
              placeholder={t("lifecycle.preset.title")}
              size="sm"
              items={presetItems()}
              onValueChange={(e) => {
                setPreset((e.value.at(0) as LifecyclePreset) || null);
              }}
            />
            <Button size="sm" type="submit" level="primary" loading={saving()} disabled={saving()}>
              {t("general.actions.save.title")}
            </Button>
            <FormDraftReset
              when={draft.hasDraft()}
              size="sm"
              loading={saving()}
              disabled={saving()}
              onConfirm={draft.discardDraft}
            />
            <Show when={hasLifecycle()}>
              <Popover
                type="button"
                level="error"
                ghost
                size="sm"
                square
                btnContent={<span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />}
              >
                <Card contentClass="p-2 flex flex-col space-y-2 max-w-96">
                  <span class="inline-block space-x-2">
                    <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                    <span>{t("general.actions.delete.message")}</span>
                  </span>
                  <Button type="button" level="primary" size="sm" class="self-end" onClick={handleDeleteLifecycle}>
                    {t("general.actions.yes.title")}
                  </Button>
                </Card>
              </Popover>
            </Show>
          </h2>
          <Field name="script">
            {(field) => (
              <EditorBare
                class="w-full h-full"
                form={form}
                name={field.name}
                value={field.value}
                error={field.error}
                lineNumbers
                lang="rune"
                lints={lint()}
              />
            )}
          </Field>
          <footer class="min-h-12 border-t border-t-layer-content/10 flex flex-col lg:flex-row flex-wrap justify-start space-x-2 items-center gap-y-2 py-2">
            <span class="text-primary icon-[fluent--info-16-regular]" />
            <span class="text-primary">{lint()?.filter((v) => v.kind === "info").length ?? 0}</span>
            <span class="text-warning icon-[fluent--warning-16-regular]" />
            <span class="text-warning">{lint()?.filter((v) => v.kind === "warning").length ?? 0}</span>
            <span class="text-error icon-[fluent--warning-16-regular]" />
            <span class="text-error">{lint()?.filter((v) => v.kind === "error").length ?? 0}</span>
            <span class="text-xs opacity-60">{t("lifecycle.functions")}</span>
            <div class="flex-1" />
            <a href="https://rune-rs.github.io/" class="text-primary hover:underline">
              Rune Grammar <span class="icon-[fluent--open-12-regular]" />
            </a>
            <span>&nbsp;&nbsp;</span>
            <a href="https://github.com/ret2shell/ret2script" class="text-primary hover:underline">
              Ret2Script <span class="icon-[fluent--open-12-regular]" />
            </a>
          </footer>
        </Form>
      </div>
    </>
  );
}
