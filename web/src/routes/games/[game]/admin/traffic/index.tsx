import {
  useDeleteGameNodeSelectorMutation,
  useDeleteGameTrafficMutation,
  useGame,
  useUpdateGameNodeSelectorMutation,
  useUpdateGameTrafficMutation,
} from "@api/game";
import { useParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import { type DiagnosticMarker, EditorBare } from "@widgets/editor";
import Input from "@widgets/input";
import Popover from "@widgets/popover";
import Select from "@widgets/select";
import { createMemo, createSignal, createTrackedEffect, Show } from "solid-js";
import multiNodeDirect from "./scripts/multi_node_direct.rx";
import singleNodeDirect from "./scripts/single_node_direct.rx";

type PresetTraffic = "single-node-direct" | "multi-node-direct";

const trafficMap = {
  "single-node-direct": singleNodeDirect,
  "multi-node-direct": multiNodeDirect,
};

export default function Traffic() {
  const params = useParams();
  const gameId = createMemo(() => Number.parseInt(params.game ?? "", 10) || -1);
  const game = useGame({ id: gameId, enabled: () => gameId() > 0 });

  const [preset, setPreset] = createSignal(null as PresetTraffic | null);

  const [script, setScript] = createSignal("");
  const [lint, setLint] = createSignal(null as DiagnosticMarker[] | null);
  const [nodeSelector, setNodeSelector] = createSignal("");

  const hasTraffic = createMemo(() => !!game.data?.traffic);
  const hasNodeSelector = createMemo(() => !!game.data?.node_selector);

  const updateTrafficMutation = useUpdateGameTrafficMutation({
    onSuccess: (resp) => {
      setLint(resp.lint);
      game.refetch();
    },
  });
  const deleteTrafficMutation = useDeleteGameTrafficMutation({
    onSuccess: () => {
      setLint(null);
      game.refetch();
    },
  });
  const updateNodeSelectorMutation = useUpdateGameNodeSelectorMutation({
    onSuccess: () => {
      game.refetch();
    },
  });
  const deleteNodeSelectorMutation = useDeleteGameNodeSelectorMutation({
    onSuccess: () => {
      game.refetch();
    },
  });

  const saving = createMemo(
    () =>
      updateTrafficMutation.isPending ||
      deleteTrafficMutation.isPending ||
      updateNodeSelectorMutation.isPending ||
      deleteNodeSelectorMutation.isPending
  );
  createTrackedEffect(() => {
    if (preset()) {
      setScript(trafficMap[preset()!]);
    }
  });

  createTrackedEffect(() => {
    if (game.data) {
      setScript(game.data.traffic || "");
      setNodeSelector(game.data.node_selector || "");
    }
  });

  async function handleUpdateTraffic() {
    if (!game.data) return;
    updateTrafficMutation.mutate({ game_id: game.data.id, traffic: script() });
  }

  async function handleDeleteTraffic() {
    if (!game.data) return;
    deleteTrafficMutation.mutate({ game_id: game.data.id });
  }

  async function handleUpdateNodeSelector() {
    if (!game.data) return;
    updateNodeSelectorMutation.mutate({ game_id: game.data.id, node_selector: nodeSelector() });
  }

  async function handleDeleteNodeSelector() {
    if (!game.data) return;
    deleteNodeSelectorMutation.mutate({ game_id: game.data.id });
  }
  return (
    <>
      <Title page={t("traffic.title")} route={`/games/${gameId()}/admin/traffic`} />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6 lg:pb-3 relative">
        <div class="flex-1 flex flex-col w-full">
          <h2 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <span class="flex-1 text-start">{t("traffic.nodeSelector")}</span>
          </h2>
          <div class="flex flex-row space-x-2 py-2 items-center">
            <span class="text-primary">ret.sh.cn/workload = </span>
            <Input size="sm" class="flex-1" value={nodeSelector()} onInput={(e) => setNodeSelector(e.target.value)} />
            <Button size="sm" level="primary" onClick={handleUpdateNodeSelector} loading={saving()}>
              {t("general.actions.save.title")}
            </Button>
            <Show when={hasNodeSelector()}>
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
                  <Button level="primary" size="sm" class="self-end" onClick={handleDeleteNodeSelector}>
                    {t("general.actions.yes.title")}
                  </Button>
                </Card>
              </Popover>
            </Show>
          </div>
          <Divider />
          <h2 class="h-12 shrink-0 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <span class="flex-1 flex items-center justify-start space-x-2">
              <span>{t("traffic.title")}</span>
              <span class="opacity-60">$GAME/traffic.rx</span>
            </span>
            <Select
              class="w-60 hidden lg:flex"
              placeholder={t("traffic.preset.title")}
              size="sm"
              items={[
                {
                  label: t("traffic.preset.singleNodeDirectScript"),
                  value: "single-node-direct",
                  icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
                },
                {
                  label: t("traffic.preset.multiNodeDirectScript"),
                  value: "multi-node-direct",
                  icon: "icon-[fluent--number-symbol-20-regular] w-5 h-5",
                },
              ]}
              onValueChange={(e) => {
                setPreset((e.value.at(0) as PresetTraffic) || null);
              }}
            />
            <Button size="sm" level="primary" onClick={handleUpdateTraffic} loading={saving()}>
              {t("general.actions.save.title")}
            </Button>
            <Show when={hasTraffic()}>
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
                  <Button level="primary" size="sm" class="self-end" onClick={handleDeleteTraffic}>
                    {t("general.actions.yes.title")}
                  </Button>
                </Card>
              </Popover>
            </Show>
          </h2>
          <EditorBare
            class="w-full h-full"
            lineNumbers
            lang="rune"
            value={script()}
            lints={lint() ?? []}
            onValueChanged={(e) => {
              setScript(e);
            }}
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
