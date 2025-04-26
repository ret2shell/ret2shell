import { api_root, handleHttpError } from "@api";
import {
  deleteChallengeEnv,
  getChallengeInstance,
  getRegistryConfig,
  getRegistryImageTags,
  getRegistryRepositories,
  refreshRegistry,
  updateChallengeEnv,
} from "@api/game";
import { Popover as ArkPopover } from "@ark-ui/solid";
import UploadButton from "@blocks/upload-button";
import { wsrx } from "@lib/wsrx";
import type { Challenge, ChallengeImage } from "@models/challenge";
import type { RegistryConfig } from "@models/config";
import { createForm, getValue, pattern, required, setValue, setValues } from "@modular-forms/solid";
import { A } from "@solidjs/router";
import { challengeStore, refreshChallengeAssets } from "@storage/challenge";
import { gameStore } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Checkbox from "@widgets/checkbox";
import Dialog from "@widgets/dialog";
import IconCheckbox from "@widgets/icon-checkbox";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Popover from "@widgets/popover";
import Select from "@widgets/select";
import Slider from "@widgets/slider";
import type { Pod } from "kubernetes-types/core/v1";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";

function CreateForm(fnProps: {
  repos: string[];
  refreshRepos?: () => Promise<void>;
  registryConfig: RegistryConfig | null;
  onDone?: () => void;
}) {
  const [loading, setLoading] = createSignal(false);

  const [tags, setTags] = createSignal<string[]>([]);
  const [form, { Form, Field }] = createForm<ChallengeImage>();
  setValue(form, "cpu", 0.5);
  setValue(form, "mem", "128Mi");
  const [searchedRepo, setSearchedRepo] = createSignal("");
  const [selected, setSelected] = createSignal(false);
  async function fetchTags(repo: string) {
    if (!fnProps.registryConfig?.enabled) {
      return;
    }
    setLoading(true);
    try {
      setTags(await getRegistryImageTags(gameStore.current!.id, repo));
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.fetchEnvImagesFailed")!);
    }
    setLoading(false);
  }
  const [adding, setAdding] = createSignal(false);
  function sanitizeChallengeImage(image: ChallengeImage): ChallengeImage {
    return {
      ...image,
      description: image.description || null,
      service_type: image.service_type || null,
      port: image.port && !Number.isNaN(image.port) && image.port > 0 && image.port < 65536 ? image.port : null,
    };
  }
  async function onSubmit(result: ChallengeImage) {
    setAdding(true);
    try {
      await updateChallengeEnv(challengeStore!.current!.game_id, challengeStore!.current!.id, {
        internet: challengeStore.env?.internet || false,
        restricted: challengeStore.env?.restricted ?? null,
        images: [...(challengeStore.env?.images || []), sanitizeChallengeImage(result)],
        pull_secret: challengeStore.env?.pull_secret || null,
      });
      addToast({
        level: "success",
        description: t("game.challenge.addEnvSuccess")!,
        duration: 5000,
      });
      setValues(form, {
        name: "",
        tag: "",
        cpu: 0.5,
        mem: "128Mi",
        port: null,
        service_type: null,
        description: "",
      });
      refreshChallengeAssets();
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.addEnvFailed")!);
    }
    setAdding(false);
    fnProps.onDone?.();
  }

  async function onRefreshRegistry() {
    if (gameStore.current) {
      try {
        await refreshRegistry(gameStore.current.id);
        await fnProps.refreshRepos?.();
      } catch (err) {
        handleHttpError(err as Error, t("game.challenge.refreshRegistryFailed")!);
      }
    }
  }

  return (
    <Form onSubmit={onSubmit} class="flex flex-col space-y-2">
      <div class="flex flex-row space-x-2">
        <Field
          name="name"
          validate={[
            required(t("game.challenge.envContainerNameRequired")!),
            pattern(/^[a-z\-]{3,40}$/, t("game.challenge.envContainerNameFormat")!),
          ]}
        >
          {(field, props) => (
            <Input
              class="flex-1"
              icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
              title={t("game.challenge.envContainerName")}
              placeholder={t("game.challenge.envContainerName")}
              {...props}
              value={field.value}
              error={field.error}
              required
            />
          )}
        </Field>
        <Field name="tag" validate={[required(t("game.challenge.envContainerTagRequired")!)]}>
          {(field, props) => (
            <Show
              when={fnProps.registryConfig?.enabled}
              fallback={
                <div class="flex-1 flex flex-row space-x-2">
                  <Input
                    class="flex-1"
                    icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                    title={t("game.challenge.envContainerTag")}
                    placeholder={t("game.challenge.envContainerTag")}
                    error={field.error}
                    required
                    {...props}
                    value={field.value}
                  />
                  <Field name="restricted" type="boolean">
                    {(field, props) => (
                      <div class="flex flex-col space-y-1">
                        <header class="label">CAP</header>
                        <IconCheckbox
                          inputProps={props}
                          title={t("game.challenge.dropCap")}
                          checked={field.value ?? false}
                          uncheckedIcon="icon-[fluent--live-20-regular]"
                          checkedIcon="icon-[fluent--live-off-20-filled]"
                          error={field.error}
                          name="restricted"
                        />
                      </div>
                    )}
                  </Field>
                </div>
              }
            >
              <>
                <input hidden {...props} value={field.value} class="hidden" />
                <div class="flex-1 relative">
                  <ArkPopover.Root
                    autoFocus={false}
                    open={!!searchedRepo() && !selected()}
                    closeOnInteractOutside={false}
                  >
                    <ArkPopover.Anchor class="w-full">
                      <Input
                        class="w-full"
                        icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                        title={t("game.challenge.envContainerTag")}
                        placeholder={t("game.challenge.envContainerTag")}
                        error={field.error}
                        required
                        value={searchedRepo()}
                        onInput={(e) => {
                          setSearchedRepo(e.target.value);
                          setSelected(false);
                          setValue(form, "tag", "");
                        }}
                        extraBtn={
                          <Button square class="!rounded-l-none" onClick={onRefreshRegistry} type="button">
                            <span class="icon-[fluent--arrow-sync-20-regular] w-5 h-5" />
                          </Button>
                        }
                      />
                    </ArkPopover.Anchor>
                    <ArkPopover.Positioner class="w-full">
                      <ArkPopover.Content class="popover card w-full z-50">
                        <OverlayScrollbarsComponent
                          options={{
                            scrollbars: {
                              theme: `os-theme-${fullTheme()}`,
                              autoHide: "scroll",
                            },
                          }}
                          class="relative w-full print:h-auto print:overflow-auto max-h-48"
                          defer
                        >
                          <div class="card-content p-2 flex flex-col space-y-2">
                            <Show when={loading()}>
                              <LoadingTips />
                            </Show>
                            <For each={fnProps.repos.filter((repo) => repo.includes(searchedRepo()))}>
                              {(repo) => (
                                <Button
                                  class="btn-sm"
                                  ghost
                                  justify="start"
                                  type="button"
                                  onClick={() => {
                                    setSearchedRepo(repo);
                                    setSelected(true);
                                    fetchTags(repo);
                                  }}
                                >
                                  <span class="icon-[fluent--beaker-20-regular] w-5 h-5" />
                                  <span>{repo}</span>
                                </Button>
                              )}
                            </For>
                          </div>
                        </OverlayScrollbarsComponent>
                      </ArkPopover.Content>
                    </ArkPopover.Positioner>
                  </ArkPopover.Root>
                </div>
                <div class="flex-1 flex flex-row space-x-2">
                  <Select
                    label={t("game.challenge.envContainerTagVersion")!}
                    error={field.error}
                    class="flex-1"
                    placeholder={t("game.challenge.selectEnvContainerTagVersion")}
                    items={
                      tags().map((tag) => ({
                        value: tag,
                        label: tag,
                        icon: "icon-[fluent--tag-20-regular]",
                      })) || []
                    }
                    // inputProps={props}
                    onValueChange={(e) => {
                      setValue(
                        form,
                        "tag",
                        `${fnProps.registryConfig?.external}/${gameStore.current!.bucket}/${searchedRepo()}:${e.value.at(0)}`
                      );
                    }}
                  />
                  <Field name="restricted" type="boolean">
                    {(field, props) => (
                      <div class="flex flex-col space-y-1">
                        <header class="label">CAP</header>
                        <IconCheckbox
                          inputProps={props}
                          title={t("game.challenge.dropCap")}
                          checked={field.value ?? false}
                          uncheckedIcon="icon-[fluent--live-20-regular]"
                          checkedIcon="icon-[fluent--live-off-20-filled]"
                          error={field.error}
                          name="restricted"
                        />
                      </div>
                    )}
                  </Field>
                </div>
              </>
            </Show>
          )}
        </Field>
      </div>
      <div class="flex flex-row space-x-2">
        <Field
          name="description"
          validate={[
            (value) => {
              if (!value?.trim() && [getValue(form, "service_type"), getValue(form, "port")].some(Boolean)) {
                return t("game.challenge.envContainerDescriptionRequired")!;
              }
              return "";
            },
          ]}
        >
          {(field, props) => (
            <Input
              class="flex-1"
              icon={<span class="icon-[fluent--text-20-regular] w-5 h-5" />}
              title={t("game.challenge.envContainerDescription")}
              placeholder={t("game.challenge.envContainerDescription")}
              {...props}
              value={field.value ?? ""}
              error={field.error}
            />
          )}
        </Field>
        <div class="flex flex-row space-x-2 flex-1">
          <Field
            name="service_type"
            validate={[
              (value) => {
                if (!value && [getValue(form, "description"), getValue(form, "port")].some(Boolean)) {
                  return t("game.challenge.selectEnvContainerServiceType")!;
                }
                return "";
              },
            ]}
          >
            {(field, props) => (
              <Select
                label={t("game.challenge.envContainerServiceType")}
                class="flex-1"
                placeholder={t("game.challenge.selectEnvContainerServiceType")}
                items={[
                  {
                    value: "http",
                    label: "HTTP",
                    icon: "icon-[fluent--globe-20-regular]",
                  },
                  {
                    value: "tcp",
                    label: "TCP",
                    icon: "icon-[fluent--globe-20-regular]",
                  },
                ]}
                value={field.value ? [field.value as string] : []}
                inputProps={props}
                error={field.error}
              />
            )}
          </Field>
          <Field
            name="port"
            type="number"
            validate={[
              (value) => {
                if ((value || value === 0) && (value < 1 || value > 65535)) {
                  return t("game.challenge.envContainerPortValidation")!;
                }
                if (value && challengeStore.env?.images?.some((image) => image.port && image.port === value)) {
                  return t("game.challenge.envContainerPortConflict")!;
                }
                if (!value && [getValue(form, "description"), getValue(form, "service_type")].some(Boolean)) {
                  return t("game.challenge.envContainerPortRequired")!;
                }
                return "";
              },
            ]}
          >
            {(field, props) => (
              <Input
                class="flex-1"
                icon={<span class="icon-[fluent--cloud-link-20-regular] w-5 h-5" />}
                title={t("game.challenge.envContainerPort")}
                placeholder={t("game.challenge.envContainerPort")}
                type="number"
                {...props}
                value={field.value ?? ""}
                error={field.error}
              />
            )}
          </Field>
        </div>
      </div>
      <div class="flex flex-row space-x-2">
        <Field name="cpu" type="number" validate={[required(t("game.challenge.envContainerCpuRequired")!)]}>
          {(field, props) => (
            <Slider
              class="flex-1"
              label={t("game.challenge.envContainerCpu")}
              max={4}
              min={0.1}
              step={0.1}
              inputProps={props}
              name={field.name}
              value={[field.value || 0.1]}
              onValueChange={(e: { value: [number] }) => {
                setValue(form, "cpu", e.value[0]);
              }}
            />
          )}
        </Field>
        <Field name="mem" validate={[required(t("game.challenge.envContainerMemRequired")!)]}>
          {(field, props) => (
            <>
              <Slider
                class="flex-1"
                label={`${t("game.challenge.envContainerMem")} (MB)`}
                max={4096}
                min={32}
                step={32}
                name={field.name}
                value={[Number.parseInt(field.value?.replace("Mi", "") || "32") || 32]}
                onValueChange={(e: { value: [number] }) => {
                  setValue(form, "mem", `${e.value[0]}Mi`);
                }}
              />
              <input hidden {...props} value={field.value} class="hidden" />
            </>
          )}
        </Field>
        <Field name="storage" validate={[required(t("game.challenge.envContainerStorageRequired")!)]}>
          {(field, props) => (
            <>
              <Slider
                class="flex-1"
                label={`${t("game.challenge.envContainerStorage")} (GB)`}
                max={20}
                min={1}
                step={1}
                name={field.name}
                value={[Number.parseInt(field.value?.replace("Gi", "") || "3") || 3]}
                onValueChange={(e: { value: [number] }) => {
                  setValue(form, "storage", `${e.value[0]}Gi`);
                }}
              />
              <input hidden {...props} value={field.value || "3Gi"} class="hidden" />
            </>
          )}
        </Field>
      </div>
      <Button type="submit" level="primary" class="!mt-4" loading={adding()} disabled={adding()}>
        {t("form.add")}
      </Button>
    </Form>
  );
}

function InstanceList() {
  const [pods, setPods] = createSignal<Pod[]>([]);
  async function refreshPods() {
    setPods(await getChallengeInstance(challengeStore!.current!.game_id, challengeStore!.current!.id));
  }
  const launchedInstances = createMemo(() => {
    if (challengeStore.current && challengeStore.env) {
      return wsrx.instances().find((s) => s.challenge_id === challengeStore.current!.id) ?? null;
    }
    return null;
  });
  createEffect(async () => {
    if (challengeStore.current) {
      untrack(async () => {
        try {
          await refreshPods();
        } catch (err) {
          handleHttpError(err as Error, t("game.challenge.fetchEnvInstancesFailed")!);
        }
      });
      if (launchedInstances()) {
        await refreshPods();
      }
    }
  });
  const refreshTimer = setInterval(() => {
    refreshPods();
  }, 30 * 1000);
  onCleanup(() => {
    clearInterval(refreshTimer);
  });
  return (
    <ul class="flex flex-col">
      <For
        each={pods()}
        fallback={
          <div class="h-12 flex flex-row space-x-2 items-center opacity-60 border-b border-b-layer-content/10">
            <span class="icon-[fluent--emoji-sad-20-regular] w-5 h-5" />
            <span>{t("game.challenge.noEnvInstances")}</span>
          </div>
        }
      >
        {(pod) => (
          <li class="h-12 flex flex-row space-x-2 items-center border-b border-b-layer-content/10">
            <span class="icon-[fluent--cube-20-regular] w-5 h-5" />
            <span>{pod.metadata?.name}</span>
            <A
              class="hover:underline flex items-center space-x-2"
              href={`/users/${pod.metadata?.labels?.["ret.sh.cn/user"]}`}
            >
              <span class="icon-[fluent--person-20-regular] w-5 h-5" />
              <span>{pod.metadata?.annotations?.["ret.sh.cn/user"]}</span>
            </A>
            <A
              class="hover:underline flex items-center space-x-2"
              href={`/games/${gameStore.current?.id}/teams/${pod.metadata?.labels?.["ret.sh.cn/team"]}`}
            >
              <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{pod.metadata?.annotations?.["ret.sh.cn/team"]}</span>
            </A>
            <span class="flex-1" />
            <span class="opacity-60">{pod.status?.phase}</span>
            <Popover btnContent={<span class="icon-[fluent--production-20-regular] w-5 h-5" />} ghost square size="sm">
              <Card contentClass="py-2 px-4 flex flex-col max-w-xl">
                <Show when={pod.metadata}>
                  <div class="py-2 flex flex-row space-x-2 items-center border-b border-b-layer-content/5">
                    <span class="icon-[fluent--clock-20-regular] w-5 h-5" />
                    <span>{DateTime.fromISO(pod.metadata!.creationTimestamp!).toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                  </div>
                </Show>
                <For each={pod.status?.containerStatuses || []}>
                  {(container) => (
                    <div class="py-2 flex flex-row space-x-2 items-center border-b border-b-layer-content/5">
                      <span class="icon-[fluent--cube-20-regular] w-5 h-5" />
                      <span class="flex-1 truncate">{container.name}</span>
                      <div class="w-16" />
                      <Switch>
                        <Match when={container.state?.running}>
                          <span class="text-success">Running {container.state?.running?.startedAt}</span>
                        </Match>
                        <Match when={container.state?.waiting}>
                          <span class="text-error" title={container.state?.waiting?.message}>
                            Waiting {container.state?.waiting?.reason}
                          </span>
                        </Match>
                      </Switch>
                    </div>
                  )}
                </For>
              </Card>
            </Popover>
          </li>
        )}
      </For>
    </ul>
  );
}

export default function (_props: {
  onStateChange?: (challenge?: Challenge) => void;
  inGame?: boolean;
}) {
  const [registryConfig, setRegistryConfig] = createSignal<RegistryConfig | null>(null);
  let pullSecretInput: HTMLInputElement;
  onMount(async () => {
    try {
      setRegistryConfig(await getRegistryConfig(gameStore.current!.id));
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.fetchEnvRegistryConfigFailed")!);
    }
  });
  const [repos, setRepos] = createSignal<string[]>([]);
  async function fetchRepos() {
    try {
      setRepos(await getRegistryRepositories(gameStore.current!.id));
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.fetchEnvImagesFailed")!);
    }
  }
  createEffect(() => {
    if (challengeStore.current) {
      untrack(fetchRepos);
    }
  });
  async function onToggleInternet() {
    try {
      await updateChallengeEnv(challengeStore!.current!.game_id, challengeStore!.current!.id, {
        internet: !challengeStore.env?.internet,
        restricted: challengeStore.env?.restricted ?? null,
        images: challengeStore.env?.images || [],
        pull_secret: challengeStore.env?.pull_secret || null,
      });
      addToast({
        level: "success",
        description: t("game.challenge.toggleEnvInternetSuccess")!,
        duration: 5000,
      });
      refreshChallengeAssets();
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.toggleEnvInternetFailed")!);
    }
  }
  async function onToggleRestricted() {
    try {
      await updateChallengeEnv(challengeStore!.current!.game_id, challengeStore!.current!.id, {
        internet: challengeStore.env?.internet || false,
        restricted: !challengeStore.env?.restricted,
        images: challengeStore.env?.images || [],
        pull_secret: challengeStore.env?.pull_secret || null,
      });
      addToast({
        level: "success",
        description: t("game.challenge.toggleEnvInternetSuccess")!,
        duration: 5000,
      });
      refreshChallengeAssets();
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.toggleEnvInternetFailed")!);
    }
  }
  async function onDeleteImage(name: string) {
    try {
      await updateChallengeEnv(challengeStore!.current!.game_id, challengeStore!.current!.id, {
        internet: challengeStore.env?.internet || false,
        restricted: challengeStore.env?.restricted ?? null,
        images: challengeStore.env?.images?.filter((image) => image.name !== name) || [],
        pull_secret: challengeStore.env?.pull_secret || null,
      });
      addToast({
        level: "success",
        description: t("game.challenge.deleteEnvImageSuccess")!,
        duration: 5000,
      });
      refreshChallengeAssets();
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.deleteEnvImageFailed")!);
    }
  }
  async function onDeleteEnv() {
    try {
      await deleteChallengeEnv(challengeStore!.current!.game_id, challengeStore!.current!.id);
      addToast({
        level: "success",
        description: t("game.challenge.deleteEnvSuccess")!,
        duration: 5000,
      });
      refreshChallengeAssets();
    } catch (err) {
      handleHttpError(err as Error, t("game.challenge.deleteEnvFailed")!);
    }
  }
  async function onSavePullSecret(n: string) {
    try {
      await updateChallengeEnv(challengeStore!.current!.game_id, challengeStore!.current!.id, {
        internet: challengeStore.env?.internet || false,
        restricted: challengeStore.env?.restricted ?? null,
        images: challengeStore.env?.images || [],
        pull_secret: n ?? null,
      });
      addToast({
        level: "success",
        description: t("form.saveSuccess")!,
        duration: 5000,
      });
      refreshChallengeAssets();
    } catch (err) {
      handleHttpError(err as Error, t("form.saveFailed")!);
    }
  }
  const [formOpen, setFormOpen] = createSignal(false);
  return (
    <div class="flex-1 flex flex-col space-y-2 p-3 lg:p-6">
      <header class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 font-bold py-2 gap-y-2">
        <span class="flex flex-row space-x-2 items-center overflow-hidden">
          <span class="icon-[fluent--settings-20-regular] w-5 h-5 shrink-0" />
          <span class="flex-1 truncate text-start">{t("game.challenge.envImages")}</span>
        </span>
        <span class="flex-1" />
        <Show when={registryConfig()?.enabled}>
          <span class="truncate font-bold">{t("game.challenge.uploadImageToRegistry")}:</span>
        </Show>
        <span class="flex flex-row justify-end items-center flex-wrap gap-y-2 gap-x-2">
          <Show when={registryConfig()?.enabled}>
            <UploadButton
              size="sm"
              url={`${api_root}/game/${gameStore.current!.id}/registry`}
              onDone={() => {
                addToast({
                  level: "success",
                  description: t("game.challenge.uploadImageToRegistrySuccess")!,
                  duration: 5000,
                });
                fetchRepos();
              }}
            />
          </Show>
          <Dialog
            size="sm"
            btnContent={<span>{t("game.challenge.addEnvImage")}</span>}
            stretched
            open={formOpen()}
            onOpenChange={(details) => {
              setFormOpen(details.open);
            }}
            // onClick={() => {
            //   setFormOpen(true);
            // }}
          >
            <CreateForm
              repos={repos()}
              registryConfig={registryConfig()}
              refreshRepos={fetchRepos}
              onDone={() => {
                setFormOpen(false);
              }}
            />
          </Dialog>
          <Show when={challengeStore.env}>
            <Popover level="error" size="sm" btnContent={<span>{t("game.challenge.deleteEnv")}</span>}>
              <Card contentClass="p-2 flex flex-col space-x-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                  <span>{t("game.challenge.deleteEnvTips")}</span>
                </span>
                <Button level="primary" size="sm" class="self-end" onClick={onDeleteEnv}>
                  {t("platform.accept")}
                </Button>
              </Card>
            </Popover>
          </Show>
        </span>
      </header>
      <div class="grid grid-cols-fit-xs max-w-full gap-2">
        <Checkbox
          checked={challengeStore.env?.internet}
          onChange={() => {
            onToggleInternet();
          }}
        >
          <span class="flex-1 text-start">{t("game.challenge.envHasInternet")}</span>
        </Checkbox>
        <Checkbox
          checked={challengeStore.env?.restricted ?? false}
          onChange={() => {
            onToggleRestricted();
          }}
        >
          <span class="flex-1 text-start">{t("game.challenge.dropCap")}</span>
        </Checkbox>
        <Input
          class="flex-1"
          icon={<span class="icon-[fluent--lock-20-regular] w-5 h-5" />}
          placeholder={t("game.challenge.pullSecret")}
          ref={pullSecretInput!}
          value={challengeStore.env?.pull_secret || ""}
          extraBtn={
            <Button
              class="!rounded-l-none"
              onClick={() => {
                onSavePullSecret(pullSecretInput!.value);
              }}
            >
              <span> {t("form.save")}</span>
            </Button>
          }
        />
      </div>
      <Show when={challengeStore.env?.images.every((image) => !image.port)}>
        <Card level="warning" contentClass="p-2 flex space-x-2 items-center">
          <span class="icon-[fluent--warning-20-filled] w-5 h-5 text-warning shrink-0" />
          <p class="font-bold">{t("game.challenge.serviceMinimumRequired")}</p>
        </Card>
      </Show>
      <For
        each={challengeStore.env?.images || []}
        fallback={
          <div class="h-12 flex flex-row space-x-2 items-center opacity-60 border-b border-b-layer-content/10">
            <span class="icon-[fluent--emoji-sad-20-regular] w-5 h-5" />
            <span>{t("game.challenge.noEnvImages")}</span>
          </div>
        }
      >
        {(image) => (
          <div class="py-2 flex flex-col space-y-1 border-b border-b-layer-content/10">
            <div class="flex flex-row space-x-2 items-center">
              <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{image.name}</span>
              <span class="opacity-60 flex-1 text-end truncate" title={image.tag}>
                {image.tag}
              </span>
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
                    <span>{t("game.challenge.deleteEnvImageTips")}</span>
                  </span>
                  <Button level="primary" size="sm" class="self-end" onClick={() => onDeleteImage(image.name)}>
                    {t("platform.accept")}
                  </Button>
                </Card>
              </Popover>
            </div>
            <div class="flex flex-row space-x-2 items-center opacity-80">
              <span class="icon-[fluent--cloud-link-20-regular] w-5 h-5" />
              <Show when={image.port} fallback={<span class="font-bold opacity-60">N/A</span>}>
                <span class="text-warning font-bold">
                  {image.service_type}:{image.port}
                </span>
                <span>({image.description})</span>
              </Show>
              <span class="flex-1" />
              <span class="icon-[fluent--engine-20-regular] w-5 h-5" />
              <span class="font-bold opacity-60">CPU: {image.cpu}</span>
              <span class="icon-[fluent--box-20-regular] w-5 h-5" />
              <span class="font-bold opacity-60">Memory: {image.mem}</span>
            </div>
          </div>
        )}
      </For>
      <Show when={challengeStore.env}>
        <header class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2 font-bold">
          <span class="icon-[fluent--settings-20-regular] w-5 h-5 shrink-0" />
          <span class="flex-1 text-start">{t("game.challenge.envInstances")}</span>
        </header>
        <InstanceList />
      </Show>
    </div>
  );
}
