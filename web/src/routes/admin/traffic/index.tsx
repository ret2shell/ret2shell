import {
  useDeleteDefaultNodeSelectorMutation,
  useDeleteGlobalTrafficScriptMutation,
  useUpdateDefaultNodeSelectorMutation,
  useUpdateGlobalTrafficScriptMutation,
} from "@api/cluster";
import { usePlatformConfig } from "@api/platform";
import { createForm, setValue } from "@modular-forms/solid";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import { type DiagnosticMarker, EditorBare } from "@widgets/editor";
import FormDraftReset from "@widgets/form-draft-reset";
import Input from "@widgets/input";
import Popover from "@widgets/popover";
import Select from "@widgets/select";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import multiNodeDirect from "./scripts/multi_node_direct.rx";
import singleNodeDirect from "./scripts/single_node_direct.rx";

type PresetTraffic = "single-node-direct" | "multi-node-direct";
type NodeSelectorForm = {
  node_selector: string;
};
type TrafficScriptForm = {
  script: string;
};

const trafficMap = {
  "single-node-direct": singleNodeDirect,
  "multi-node-direct": multiNodeDirect,
};

export default function Traffic() {
  const config = usePlatformConfig();
  const [preset, setPreset] = createSignal(null as PresetTraffic | null);
  const [lint, setLint] = createSignal([] as DiagnosticMarker[]);
  const [nodeSelectorForm, { Form: NodeSelectorForm, Field: NodeSelectorField }] = createForm<NodeSelectorForm>({
    initialValues: {
      node_selector: config.data?.cluster.node_selector || "",
    },
  });
  const [trafficForm, { Form: TrafficForm, Field: TrafficField }] = createForm<TrafficScriptForm>({
    initialValues: {
      script: config.data?.cluster.traffic || "",
    },
  });
  const nodeSelectorRemoteValues = createMemo<NodeSelectorForm>(() => ({
    node_selector: config.data?.cluster.node_selector || "",
  }));
  const trafficRemoteValues = createMemo<TrafficScriptForm>(() => ({
    script: config.data?.cluster.traffic || "",
  }));
  const nodeSelectorDraft = useFormDraft({
    form: nodeSelectorForm,
    key: () => buildFormDraftKey("admin", "node-selector"),
    remoteValues: nodeSelectorRemoteValues,
    enabled: () => !!config.data?.cluster,
  });
  const trafficDraft = useFormDraft({
    form: trafficForm,
    key: () => buildFormDraftKey("admin", "traffic"),
    remoteValues: trafficRemoteValues,
    enabled: () => !!config.data?.cluster,
  });

  createEffect(() => {
    if (preset()) {
      setValue(trafficForm, "script", trafficMap[preset()!]);
    }
  });

  const updateTrafficMutation = useUpdateGlobalTrafficScriptMutation({
    onSuccess: async (v) => {
      setLint(v.lint ?? []);
      await config.refetch();
      trafficDraft.discardDraft();
    },
  });
  const deleteTrafficMutation = useDeleteGlobalTrafficScriptMutation({
    onSuccess: async () => {
      await config.refetch();
      trafficDraft.discardDraft();
    },
  });

  const updateNodeSelectorMutation = useUpdateDefaultNodeSelectorMutation({
    onSuccess: async () => {
      await config.refetch();
      nodeSelectorDraft.discardDraft();
    },
  });
  const deleteNodeSelectorMutation = useDeleteDefaultNodeSelectorMutation({
    onSuccess: async () => {
      await config.refetch();
      nodeSelectorDraft.discardDraft();
    },
  });

  const saving = createMemo(
    () =>
      updateTrafficMutation.isPending ||
      deleteTrafficMutation.isPending ||
      updateNodeSelectorMutation.isPending ||
      deleteNodeSelectorMutation.isPending
  );

  function onSubmitNodeSelector(result: NodeSelectorForm) {
    updateNodeSelectorMutation.mutate({ node_selector: result.node_selector });
  }

  function onSubmitTraffic(result: TrafficScriptForm) {
    updateTrafficMutation.mutate({ traffic: result.script });
  }

  return (
    <>
      <Title page={t("traffic.title")} route="/admin/traffic" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6 relative">
        <div class="flex-1 flex flex-col w-full">
          <h2 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="shrink-0 icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
            <span class="flex-1 text-start">{t("traffic.nodeSelector")}</span>
          </h2>
          <NodeSelectorForm onSubmit={onSubmitNodeSelector} class="flex flex-row space-x-2 py-2 items-center">
            <span class="text-primary">ret.sh.cn/workload = </span>
            <NodeSelectorField name="node_selector">
              {(field, props) => <Input size="sm" class="flex-1" {...props} value={field.value} error={field.error} />}
            </NodeSelectorField>
            <Button size="sm" type="submit" level="primary" loading={saving()} disabled={saving()}>
              {t("general.actions.save.title")}
            </Button>
            <FormDraftReset
              when={nodeSelectorDraft.hasDraft()}
              size="sm"
              loading={saving()}
              disabled={saving()}
              onConfirm={nodeSelectorDraft.discardDraft}
            />
            <Show when={config.data?.cluster.node_selector}>
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
                  <Button
                    type="button"
                    level="primary"
                    size="sm"
                    class="self-end"
                    onClick={() => deleteNodeSelectorMutation.mutate()}
                  >
                    {t("general.actions.yes.title")}
                  </Button>
                </Card>
              </Popover>
            </Show>
          </NodeSelectorForm>
          <Divider />
          <TrafficForm onSubmit={onSubmitTraffic} class="flex-1 flex flex-col">
            <h2 class="h-12 shrink-0 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--cloud-flow-20-regular] w-5 h-5" />
              <span class="flex-1 flex items-center justify-start space-x-2">
                <span>{t("traffic.title")}</span>
                <span class="opacity-60">$GLOBAL/traffic.rx</span>
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
              <Button size="sm" type="submit" level="primary" loading={saving()} disabled={saving()}>
                {t("general.actions.save.title")}
              </Button>
              <FormDraftReset
                when={trafficDraft.hasDraft()}
                size="sm"
                loading={saving()}
                disabled={saving()}
                onConfirm={trafficDraft.discardDraft}
              />
              <Show when={config.data?.cluster.traffic}>
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
                    <Button
                      type="button"
                      level="primary"
                      size="sm"
                      class="self-end"
                      onClick={() => deleteTrafficMutation.mutate()}
                    >
                      {t("general.actions.yes.title")}
                    </Button>
                  </Card>
                </Popover>
              </Show>
            </h2>
            <TrafficField name="script">
              {(field) => (
                <EditorBare
                  class="w-full h-full"
                  form={trafficForm}
                  name={field.name}
                  value={field.value}
                  error={field.error}
                  lineNumbers
                  lang="rune"
                  lints={lint()}
                />
              )}
            </TrafficField>
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
          </TrafficForm>
        </div>
      </div>
    </>
  );
}
