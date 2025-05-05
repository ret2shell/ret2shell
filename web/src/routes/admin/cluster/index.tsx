import { handleHttpError } from "@api";
import { getClusterConfig, getClusterNodes } from "@api/cluster";
import Spin from "@assets/animates/spin";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import Button from "@widgets/button";
import Divider from "@widgets/divider";
import LoadingTips from "@widgets/loading-tips";
import clsx from "clsx";
import type { Node } from "kubernetes-types/core/v1";
import { DateTime } from "luxon";
import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";

export default function () {
  const [available, setAvailable] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [since, setSince] = createSignal("");
  const [clusterDNS, setClusterDNS] = createSignal("");
  const [clusterDomain, setClusterDomain] = createSignal("");
  const [clusterNodes, setClusterNodes] = createSignal([] as Node[]);

  onMount(async () => {
    try {
      const resp = await getClusterConfig();
      setAvailable(true);
      for (const c of resp.items) {
        if (c.data?.since) {
          setSince(c.data.since);
        }
        if (c.data?.clusterDNS) {
          setClusterDNS(c.data.clusterDNS);
        }
        if (c.data?.clusterDomain) {
          setClusterDomain(c.data.clusterDomain);
        }
      }
    } catch {
      setAvailable(false);
    }
    setLoading(false);

    try {
      const resp = await getClusterNodes();
      setClusterNodes(resp.items);
    } catch (err) {
      handleHttpError(err as Error, t("cluster.errors.fetchNodes.title")!);
    }
  });

  const [shownNode, setShownNode] = createSignal(null as Node | null);
  return (
    <>
      <Title page={t("cluster.title")} route="/admin/cluster" />
      <div class="flex-1 flex flex-col p-3 lg:p-6">
        <div class="h-32 lg:h-48 flex flex-row items-center">
          <div class="h-full aspect-square flex items-center justify-center">
            <Switch>
              <Match when={loading()}>
                <Spin width={24} height={24} />
              </Match>
              <Match when={available()}>
                <span class="icon-[meteocons--compass] w-full h-full" />
              </Match>
              <Match when={true}>
                <span class="icon-[meteocons--code-red-fill] w-full h-full" />
              </Match>
            </Switch>
          </div>
          <h1 class="flex flex-col justify-center space-y-2">
            <span class="text-3xl lg:text-5xl font-bold">{t("cluster.title")}</span>
            <Switch>
              <Match when={loading()}>
                <LoadingTips />
              </Match>
              <Match when={available()}>
                <span class="text-info">{t("cluster.status.available.title")}</span>
              </Match>
              <Match when={true}>
                <span class="text-warning">{t("cluster.status.unavailable.title")}</span>
              </Match>
            </Switch>
          </h1>
        </div>
        <Divider />
        <Show when={loading()}>
          <div class="h-20 lg:h-12 flex flex-row space-x-4 items-center px-4">
            <LoadingTips />
          </div>
          <Divider />
        </Show>
        <Show when={available()}>
          <div class="h-20 lg:h-12 flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4 justify-center items-center px-3">
            <span class="lg:flex-1 opacity-60">
              Since {since()}, {DateTime.fromFormat(since(), "yyyy-MM-dd").diffNow().negate().toFormat("hh")} hours
              online
            </span>
            <span class="flex flex-row items-center space-x-4">
              <span>{clusterDomain()}</span>
              <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5 opacity-60" />
              <span class="text-warning">{clusterDNS()}</span>
            </span>
          </div>
          <Divider />
          <div class="flex flex-row flex-wrap py-2">
            <For each={clusterNodes()}>
              {(node) => (
                <Button
                  class="m-1 min-w-fit !h-auto py-2"
                  level={shownNode()?.metadata?.name === node.metadata?.name ? "primary" : undefined}
                  onClick={() => setShownNode(node)}
                >
                  <span
                    class={clsx(
                      node.metadata?.labels?.["node-role.kubernetes.io/master"] === "true"
                        ? "icon-[fluent--brain-circuit-20-regular]"
                        : "icon-[fluent--production-20-regular]",
                      "w-8 h-8",
                      shownNode()?.metadata?.name === node.metadata?.name ? "text-primary-content" : "text-success"
                    )}
                  />
                  <div class="flex flex-col justify-center items-start min-w-fit">
                    <span class="font-bold">{node.metadata?.name}</span>
                    <span class="opacity-60">{node.metadata?.creationTimestamp}</span>
                  </div>
                </Button>
              )}
            </For>
          </div>
          <Divider />
          <Show
            when={shownNode()}
            fallback={
              <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                <span class="icon-[fluent--organization-20-regular] w-24 h-24" />
                <span>{t("cluster.selectNode")}</span>
              </div>
            }
          >
            <div class="h-12 flex flex-row items-center space-x-2 px-3">
              <span class="icon-[fluent--organization-20-regular] w-5 h-5" />
              <span class="font-bold flex-1 text-start">{shownNode()?.metadata?.name}</span>
              <span class="opacity-60 hidden lg:inline">
                <span>Online at: </span>
                <span>
                  {DateTime.fromISO(shownNode()!.metadata!.creationTimestamp!).toFormat("yyyy-MM-dd HH:mm:ss")}
                </span>
              </span>
              <Button size="sm" square title={t("cluster.actions.refreshNode.title")}>
                <span class="icon-[fluent--arrow-clockwise-20-regular] w-5 h-5" />
              </Button>
              <Button size="sm" square title={t("cluster.actions.updateNode.title")}>
                <span class="icon-[fluent--arrow-circle-up-20-regular] w-5 h-5" />
              </Button>
              <Button size="sm" square level="error" title={t("cluster.actions.disconnectNode.title")}>
                <span class="icon-[fluent--stop-20-regular] w-5 h-5" />
              </Button>
            </div>
            <Divider />
            <div class="p-3 lg:p-6 flex flex-col">
              <h3 class="text-center font-bold">{t("cluster.nodeInfo.title")}</h3>
              <table>
                <tbody>
                  <For each={Object.entries(shownNode()!.status!.nodeInfo!)}>
                    {([key, value]) => (
                      <tr class="border-b border-b-layer-content/10">
                        <td class="font-bold opacity-60 p-2">{`${t(`cluster.nodeInfo.${key}`) as string}`}</td>
                        <td class="p-2">{value}</td>
                      </tr>
                    )}
                  </For>
                  <tr class="border-b border-b-layer-content/10">
                    <td class="font-bold opacity-60 p-2">Provider ID</td>
                    <td class="p-2">{shownNode()?.spec?.providerID}</td>
                  </tr>
                  <tr class="border-b border-b-layer-content/10">
                    <td class="font-bold opacity-60 p-2">Addresses</td>
                    <td class="p-2">
                      {shownNode()
                        ?.status!.addresses!.map((a) => a.address)
                        .join(", ")}
                    </td>
                  </tr>
                  <tr class="border-b border-b-layer-content/10">
                    <td class="font-bold opacity-60 p-2">Pod CIDRs</td>
                    <td class="p-2">{shownNode()?.spec?.podCIDRs?.join(", ")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="flex flex-col">
              <h3 class="text-center font-bold">{t("cluster.nodeResources.title")}</h3>
              <div class="flex flex-col lg:flex-row p-3 lg:p-6">
                <table class="flex-1">
                  <tbody>
                    <For each={Object.entries(shownNode()!.status!.capacity!)}>
                      {([key, value]) => (
                        <tr class="border-b border-b-layer-content/10">
                          <td class="font-bold opacity-60 p-2">Capacity {key}</td>
                          <td class="p-2">{value}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
                <table class="flex-1">
                  <tbody>
                    <For each={Object.entries(shownNode()!.status!.allocatable!)}>
                      {([key, value]) => (
                        <tr class="border-b border-b-layer-content/10">
                          <td class="font-bold opacity-60 p-2">Allocatable {key}</td>
                          <td class="p-2">{value}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </>
  );
}
