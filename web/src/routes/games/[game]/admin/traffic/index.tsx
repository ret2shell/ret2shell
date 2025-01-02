import { fullTheme, t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Popover from "@widgets/popover";
import Select from "@widgets/select";
import { createEffect, createSignal, Show } from "solid-js";
import singleNodeDirect from "./scripts/single_node_direct.rx";
import multiNodeDirect from "./scripts/multi_node_direct.rx";
import { EditorBare } from "@widgets/editor";
import { gameStore, setGameStore } from "@storage/game";
import { deleteGameNodeSelector, deleteGameTraffic, updateGameNodeSelector, updateGameTraffic } from "@api/game";
import { addToast } from "@storage/toast";
import { handleHttpError } from "@api";
import Input from "@widgets/input";
import Splitter from "@widgets/splitter";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { AnsiUp } from "ansi_up";
import Divider from "@widgets/divider";
import { Title } from "@storage/header";

type PresetTraffic = "single-node-direct" | "multi-node-direct";

const trafficMap = {
  "single-node-direct": singleNodeDirect,
  "multi-node-direct": multiNodeDirect,
};

export default function Traffic() {
  const [preset, setPreset] = createSignal(null as PresetTraffic | null);

  const [script, setScript] = createSignal("");
  const [lint, setLint] = createSignal(null as string | null);
  const [nodeSelector, setNodeSelector] = createSignal("");
  const [renderedLint, setRenderedLint] = createSignal(null as string | null);
  const [saving, setSaving] = createSignal(false);
  const ansi_up = new AnsiUp();
  ansi_up.use_classes = true;
  createEffect(() => {
    if (preset()) {
      setScript(trafficMap[preset()!]);
    }
  });

  createEffect(() => {
    if (gameStore.current) {
      setScript(gameStore.current.traffic || "");
      setNodeSelector(gameStore.current.node_selector || "");
    }
  });

  async function handleUpdateTraffic() {
    if (gameStore.current) {
      setSaving(true);
      try {
        const resp = await updateGameTraffic(gameStore.current.id, script());
        setLint(resp.lint);
        if (resp.lint) {
          setRenderedLint(ansi_up.ansi_to_html(resp.lint));
        }
        addToast({
          level: "success",
          description: t("form.saveSuccess")!,
          duration: 5000,
        });
        setGameStore({ current: { ...gameStore.current, traffic: script() } });
      } catch (err) {
        handleHttpError(err as Error, t("form.saveFailed")!);
      }
      setSaving(false);
    }
  }

  async function handleDeleteTraffic() {
    if (gameStore.current) {
      setSaving(true);
      try {
        await deleteGameTraffic(gameStore.current.id);
        setLint(null);
        addToast({
          level: "success",
          description: t("form.deleteSuccess")!,
          duration: 5000,
        });
        setGameStore({ current: { ...gameStore.current, traffic: "" } });
      } catch (err) {
        handleHttpError(err as Error, t("form.deleteFailed")!);
      }
      setSaving(false);
    }
  }

  async function handleUpdateNodeSelector() {
    if (gameStore.current) {
      setSaving(true);
      try {
        await updateGameNodeSelector(gameStore.current.id, nodeSelector());
        addToast({
          level: "success",
          description: t("form.saveSuccess")!,
          duration: 5000,
        });
        setGameStore({ current: { ...gameStore.current, node_selector: nodeSelector() } });
      } catch (err) {
        handleHttpError(err as Error, t("form.saveFailed")!);
      }
      setSaving(false);
    }
  }

  async function handleDeleteNodeSelector() {
    if (gameStore.current) {
      setSaving(true);
      try {
        await deleteGameNodeSelector(gameStore.current.id);
        addToast({
          level: "success",
          description: t("form.deleteSuccess")!,
          duration: 5000,
        });
        setGameStore({ current: { ...gameStore.current, node_selector: "" } });
      } catch (err) {
        handleHttpError(err as Error, t("form.deleteFailed")!);
      }
      setSaving(false);
    }
  }
  return (
    <>
      <Title page={t("game.admin.traffic.title")} route={`/games/${gameStore.current?.id}/admin/traffic`} />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6 relative">
        <div class="flex-1 flex flex-col w-full">
          <h2 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <span class="flex-1 text-start">{t("game.admin.traffic.nodeSelector")}</span>
          </h2>
          <div class="flex flex-row space-x-2 py-2 items-center">
            <span class="text-primary">ret.sh.cn/workload = </span>
            <Input size="sm" class="flex-1" value={nodeSelector()} onInput={(e) => setNodeSelector(e.target.value)} />
            <Button size="sm" level="primary" onClick={handleUpdateNodeSelector} loading={saving()}>
              {t("form.save")}
            </Button>
            <Show when={gameStore.current?.node_selector}>
              <Popover
                level="error"
                ghost
                size="sm"
                square
                btnContent={<span class="icon-[fluent--delete-20-regular] w-5 h-5" />}
              >
                <Card contentClass="p-2 flex flex-col space-y-2 max-w-96">
                  <span class="inline-block space-x-2">
                    <span class="icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                    <span>{t("game.admin.traffic.deleteTips")}</span>
                  </span>
                  <Button level="primary" size="sm" class="self-end" onClick={handleDeleteNodeSelector}>
                    {t("platform.accept")}
                  </Button>
                </Card>
              </Popover>
            </Show>
          </div>
          <Divider />
          <h2 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <span class="flex-1 flex items-center justify-start space-x-2">
              <span>{t("game.admin.traffic.title")}</span>
              <span class="opacity-60">$GAME/traffic.rx</span>
            </span>
            <Select
              class="w-60 hidden lg:flex"
              placeholder={t("game.admin.traffic.selectPresetScripts")}
              size="sm"
              items={[
                {
                  label: t("game.admin.traffic.singleNodeDirectScript")!,
                  value: "single-node-direct",
                  icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
                },
                {
                  label: t("game.admin.traffic.multiNodeDirectScript")!,
                  value: "multi-node-direct",
                  icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
                },
              ]}
              onValueChange={(e) => {
                setPreset((e.value.at(0) as PresetTraffic) || null);
              }}
            />
            <Button size="sm" level="primary" onClick={handleUpdateTraffic} loading={saving()}>
              {t("form.save")}
            </Button>
            <Show when={gameStore.current?.traffic}>
              <Popover
                level="error"
                ghost
                size="sm"
                square
                btnContent={<span class="icon-[fluent--delete-20-regular] w-5 h-5" />}
              >
                <Card contentClass="p-2 flex flex-col space-y-2 max-w-96">
                  <span class="inline-block space-x-2">
                    <span class="icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                    <span>{t("game.admin.traffic.deleteTips")}</span>
                  </span>
                  <Button level="primary" size="sm" class="self-end" onClick={handleDeleteTraffic}>
                    {t("platform.accept")}
                  </Button>
                </Card>
              </Popover>
            </Show>
          </h2>{" "}
          <Splitter
            orientation="vertical"
            size={[
              { id: "a", size: 80, minSize: 24 },
              { id: "b", size: 20, minSize: 10 },
            ]}
            class="flex-1"
            startPanel={() => (
              <EditorBare
                class="w-full h-full"
                lineNumbers
                lang="rust"
                value={script()}
                onValueChanged={(e) => {
                  setScript(e);
                }}
              />
            )}
            endPanel={() => (
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
                <Show
                  when={lint()}
                  fallback={
                    <p class="flex flex-row space-x-2 items-center text-success p-3 lg:p-6">
                      <span class="icon-[fluent--thumb-like-20-regular] w-5 h-5" />
                      <span>0 warning(s), error(s).</span>
                    </p>
                  }
                >
                  <div class="p-3 lg:p-6">
                    <pre innerHTML={renderedLint() ?? undefined} />
                  </div>
                </Show>
              </OverlayScrollbarsComponent>
            )}
          />
        </div>
      </div>
    </>
  );
}
