import { handleHttpError } from "@api";
import { deleteRegistrarScript, getPlatformConfig, updateRegistrarScript } from "@api/platform";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import { type DiagnosticMarker, EditorBare } from "@widgets/editor";
import Popover from "@widgets/popover";
import Select from "@widgets/select";
import { createEffect, createSignal, onMount, Show } from "solid-js";
import inviteBySuffix from "./scripts/invite_by_suffix.rx";
import limitSuffix from "./scripts/limit_suffix.rx";

export default function Registrar() {
  const [script, setScript] = createSignal("");
  const [lint, setLint] = createSignal(null as DiagnosticMarker[] | null);
  const [saving, setSaving] = createSignal(false);
  type PresetRegistrar = "limit-email-suffix" | "invite-by-suffix";
  const [preset, setPreset] = createSignal<PresetRegistrar | null>(null);
  const presetScripts: Record<PresetRegistrar, string> = {
    "limit-email-suffix": limitSuffix,
    "invite-by-suffix": inviteBySuffix,
  };

  onMount(async () => {
    try {
      const cfg = await getPlatformConfig();
      setScript(cfg.auth?.registrar_script || "");
    } catch (err) {
      handleHttpError(err as Error, t("platform.errors.fetchConfig.title")!);
    }
  });

  createEffect(() => {
    if (preset()) {
      const key = preset()!;
      if (presetScripts[key]) setScript(presetScripts[key]);
    }
  });

  async function handleSave() {
    setSaving(true);
    try {
      const resp = await updateRegistrarScript(script());
      setLint(resp.lint);
      addToast({ level: "success", description: t("general.actions.save.status.success")!, duration: 5000 });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setSaving(false);
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteRegistrarScript();
      setScript("");
      setLint(null);
      addToast({ level: "success", description: t("general.actions.delete.status.success")!, duration: 5000 });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.delete.status.fail")!);
    }
    setSaving(false);
  }

  return (
    <>
      <Title page={t("registrar.title")!} route="/admin/registrar" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6 relative">
        <div class="flex-1 flex flex-col w-full">
          <h2 class="h-12 shrink-0 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--mail-inbox-20-regular] w-5 h-5" />
            <span class="flex-1 flex items-center justify-start space-x-2">
              <span>{t("registrar.script")}</span>
              <span class="opacity-60">$GLOBAL/registrar.rx</span>
            </span>
            <Select
              class="w-60 hidden lg:flex"
              placeholder={t("registrar.preset.title")!}
              size="sm"
              items={[
                {
                  label: t("registrar.preset.limitSuffix")!,
                  value: "limit-email-suffix",
                  icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
                },
                {
                  label: t("registrar.preset.inviteBySuffix")!,
                  value: "invite-by-suffix",
                  icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
                },
              ]}
              onValueChange={(e) => setPreset((e.value.at(0) as PresetRegistrar) || null)}
            />
            <Button size="sm" level="primary" onClick={handleSave} loading={saving()}>
              {t("general.actions.save.title")}
            </Button>
            <Show when={script().length > 0}>
              <Popover
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
                  <Button level="primary" size="sm" class="self-end" onClick={handleDelete}>
                    {t("general.actions.yes.title")}
                  </Button>
                </Card>
              </Popover>
            </Show>
          </h2>
          <EditorBare
            class="w-full h-full"
            lineNumbers
            lang="rust"
            value={script()}
            lints={lint() ?? []}
            onValueChanged={(e) => setScript(e)}
          />
          <footer class="min-h-12 border-t border-t-layer-content/10 flex flex-col lg:flex-row flex-wrap justify-start space-x-2 items-center gap-y-2 py-2">
            <span class="text-primary icon-[fluent--info-16-regular]" />
            <span class="text-primary">{lint()?.filter((v) => v.kind === "info").length ?? 0}</span>
            <span class="text-warning icon-[fluent--warning-16-regular]" />
            <span class="text-warning">{lint()?.filter((v) => v.kind === "warning").length ?? 0}</span>
            <span class="text-error icon-[fluent--warning-16-regular]" />
            <span class="text-error">{lint()?.filter((v) => v.kind === "error").length ?? 0}</span>
            <div class="flex-1" />
            <a href="https://rune-rs.github.io/" class="text-primary hover:underline">
              Rune Grammar <span class="icon-[fluent--open-12-regular]" />
            </a>
            <span>&nbsp;&nbsp;</span>
            <a href="https://github.com/ret2shell/ret2script" class="text-primary hover:underline">
              Ret2Script <span class="icon-[fluent--open-12-regular]" />
            </a>
          </footer>
        </div>
      </div>
    </>
  );
}
