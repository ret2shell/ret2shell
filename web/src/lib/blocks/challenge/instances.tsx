import { api_root, inflyClient } from "@api";
import {
  useChallenge,
  useChallengeEnv,
  useChallengeInstance,
  useDeleteChallengeEnvMutation,
  useUpdateChallengeEnvMutation,
} from "@api/challenge";
import {
  useGame,
  useRefreshRegistryMutation,
  useRegistryConfig,
  useRegistryImageTags,
  useRegistryRepositories,
} from "@api/game";
import { Popover as ArkPopover } from "@ark-ui/solid";
import UploadButton from "@blocks/upload-button";
import type { ChallengeImage } from "@models/challenge";
import { createForm, getValue, pattern, required, setValue, setValues } from "@modular-forms/solid";
import { A } from "@solidjs/router";
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
import RangeSlider from "@widgets/range-slider";
import Select from "@widgets/select";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import type { ChallengeWidgetProps } from ".";

const CONTAINER_NAME_PATTERN = /^(?=.{3,40}$)[a-z](?:[a-z0-9-]*[a-z0-9])$/;

function CreateForm(fnProps: { gameId: number; challengeId: number; onDone?: () => void }) {
  const [form, { Form, Field }] = createForm<ChallengeImage>({
    initialValues: {
      cpu: 0.5,
      cpu_req: 0.01,
      mem: "128Mi",
      mem_req: "32Mi",
      storage: "1024Mi",
      storage_req: "64Mi",
    },
  });
  const [searchedRepo, setSearchedRepo] = createSignal("");
  const [selected, setSelected] = createSignal(false);

  const game = useGame({ id: () => fnProps.gameId });
  const challenge = useChallenge({
    game_id: () => fnProps.gameId,
    challenge_id: () => fnProps.challengeId,
  });
  const challengeEnv = useChallengeEnv({
    game_id: () => fnProps.gameId,
    challenge_id: () => fnProps.challengeId,
  });

  const repos = useRegistryRepositories({ game_id: () => fnProps.gameId });
  const registryConfig = useRegistryConfig({ game_id: () => fnProps.gameId });

  const tags = useRegistryImageTags({
    game_id: () => fnProps.gameId,
    repo: () => searchedRepo(),
    enabled: () => searchedRepo().length > 0 && selected(),
  });

  function sanitizeChallengeImage(image: ChallengeImage): ChallengeImage {
    return {
      ...image,
      description: image.description || null,
      service_type: null,
      protocol: image.protocol || null,
      app_protocol: image.app_protocol || null,
      port: image.port && !Number.isNaN(image.port) && image.port > 0 && image.port < 65536 ? image.port : null,
    };
  }

  const addMutation = useUpdateChallengeEnvMutation({
    onSuccess: () => {
      setValues(form, {
        name: "",
        tag: "",
        cpu: 0.5,
        cpu_req: 0.01,
        mem: "128Mi",
        mem_req: "32Mi",
        storage: "1024Mi",
        storage_req: "64Mi",
        port: null,
        protocol: null,
        app_protocol: null,
        description: "",
      });
      challengeEnv.refetch();
      fnProps.onDone?.();
    },
  });

  const refreshMutation = useRefreshRegistryMutation({
    onSuccess: () => {
      repos.refetch();
      tags.refetch();
    },
  });

  return (
    <Form
      onSubmit={(form) =>
        addMutation.mutate({
          game_id: challenge.data!.game_id,
          challenge_id: challenge.data!.id,
          env: {
            internet: challengeEnv.data?.internet || false,
            restricted: challengeEnv.data?.restricted ?? null,
            images: [...(challengeEnv.data?.images || []), sanitizeChallengeImage(form)],
            pull_secret: challengeEnv.data?.pull_secret || null,
          },
        })
      }
      class="flex flex-col space-y-2"
    >
      <div class="flex flex-row space-x-2">
        <Field
          name="name"
          validate={[
            required(t("challenge.instance.image.form.containerName.required")),
            pattern(CONTAINER_NAME_PATTERN, t("challenge.instance.image.form.containerName.mustBeValidName")),
          ]}
        >
          {(field, props) => (
            <Input
              class="flex-1"
              icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
              title={t("challenge.instance.image.form.containerName.label")}
              placeholder={t("challenge.instance.image.form.containerName.placeholder")}
              {...props}
              value={field.value}
              error={field.error}
              required
            />
          )}
        </Field>
        <Field name="tag" validate={[required(t("challenge.instance.image.form.tag.required"))]}>
          {(field, props) => (
            <Show
              when={registryConfig.data?.enabled}
              fallback={
                <div class="flex-1 flex flex-row space-x-2">
                  <Input
                    class="flex-1"
                    icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
                    title={t("challenge.instance.image.form.tag.label")}
                    placeholder={t("challenge.instance.image.form.tag.placeholder")}
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
                          title={t("challenge.instance.image.form.restrict.message")}
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
                      icon={<span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />}
                      title={t("challenge.instance.image.form.tag.label")}
                      placeholder={t("challenge.instance.image.form.tag.placeholder")}
                      error={field.error}
                      required
                      value={searchedRepo()}
                      onInput={(e) => {
                        setSearchedRepo(e.target.value);
                        setSelected(false);
                        setValue(form, "tag", "");
                      }}
                      extraBtn={
                        <Button
                          square
                          class="rounded-l-none!"
                          onClick={() =>
                            refreshMutation.mutate({
                              game_id: fnProps.gameId,
                            })
                          }
                          type="button"
                        >
                          <span class="shrink-0 icon-[fluent--arrow-sync-20-regular] w-5 h-5" />
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
                          <Show when={repos.isLoading}>
                            <LoadingTips />
                          </Show>
                          <For each={repos.data?.filter((repo) => repo.includes(searchedRepo())) ?? []}>
                            {(repo) => (
                              <Button
                                class="btn-sm"
                                ghost
                                justify="start"
                                type="button"
                                onClick={() => {
                                  setSearchedRepo(repo);
                                  setSelected(true);
                                  setValue(form, "tag", "");
                                }}
                              >
                                <span class="shrink-0 icon-[fluent--beaker-20-regular] w-5 h-5" />
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
                  label={t("challenge.instance.image.form.version.label")}
                  error={field.error}
                  class="flex-1"
                  placeholder={t("challenge.instance.image.form.version.placeholder")}
                  items={
                    tags.data?.map((tag) => ({
                      value: tag,
                      label: tag,
                      icon: "icon-[fluent--tag-20-regular]",
                    })) ?? []
                  }
                  // inputProps={props}
                  onValueChange={(e) => {
                    setValue(
                      form,
                      "tag",
                      `${registryConfig.data?.external}/${game.data?.bucket}/${searchedRepo()}:${e.value.at(0)}`
                    );
                  }}
                />
                <Field name="restricted" type="boolean">
                  {(field, props) => (
                    <div class="flex flex-col space-y-1">
                      <header class="label">CAP</header>
                      <IconCheckbox
                        inputProps={props}
                        title={t("challenge.instance.image.form.restrict.message")}
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
            </Show>
          )}
        </Field>
      </div>
      <div class="flex flex-row space-x-2">
        <Field
          name="description"
          validate={[
            (value) => {
              if (
                !value?.trim() &&
                [getValue(form, "protocol"), getValue(form, "app_protocol"), getValue(form, "port")].some(Boolean)
              ) {
                return t("challenge.instance.image.form.service.description.requiredWhenHavePort");
              }
              return "";
            },
          ]}
        >
          {(field, props) => (
            <Input
              class="flex-1"
              icon={<span class="shrink-0 icon-[fluent--text-20-regular] w-5 h-5" />}
              title={t("challenge.instance.image.form.service.description.label")}
              placeholder={t("challenge.instance.image.form.service.description.placeholder")}
              {...props}
              value={field.value ?? ""}
              error={field.error}
            />
          )}
        </Field>
        <Field
          name="protocol"
          validate={[
            (value) => {
              if (
                !value &&
                [getValue(form, "description"), getValue(form, "app_protocol"), getValue(form, "port")].some(Boolean)
              ) {
                return t("challenge.instance.image.form.service.protocol.requiredWhenHavePort");
              }
              return "";
            },
          ]}
        >
          {(field, props) => (
            <Select
              label={t("challenge.instance.image.form.service.protocol.label")}
              class="flex-1"
              placeholder={t("challenge.instance.image.form.service.protocol.placeholder")}
              items={[
                {
                  value: "tcp",
                  label: t("challenge.instance.image.form.service.protocol.items.tcp"),
                  icon: "icon-[fluent--globe-20-regular]",
                },
                {
                  value: "stcp",
                  label: t("challenge.instance.image.form.service.protocol.items.stcp"),
                  icon: "icon-[fluent--globe-20-regular]",
                },
                {
                  value: "udp",
                  label: t("challenge.instance.image.form.service.protocol.items.udp"),
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
          name="app_protocol"
          validate={[
            (value) => {
              if (
                !value &&
                [getValue(form, "description"), getValue(form, "protocol"), getValue(form, "port")].some(Boolean)
              ) {
                return t("challenge.instance.image.form.service.appProtocol.requiredWhenHavePort");
              }
              return "";
            },
          ]}
        >
          {(field, props) => (
            <Select
              label={t("challenge.instance.image.form.service.appProtocol.label")}
              class="flex-1"
              placeholder={t("challenge.instance.image.form.service.appProtocol.placeholder")}
              items={[
                {
                  value: "raw",
                  label: t("challenge.instance.image.form.service.appProtocol.items.raw"),
                  icon: "icon-[fluent--globe-20-regular]",
                },
                {
                  value: "http",
                  label: t("challenge.instance.image.form.service.appProtocol.items.http"),
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
                return t("challenge.instance.image.form.service.port.mustBeInRange");
              }
              if (value && challengeEnv.data?.images?.some((image) => image.port && image.port === value)) {
                return t("challenge.instance.image.form.service.port.conflict");
              }
              if (
                !value &&
                [getValue(form, "description"), getValue(form, "protocol"), getValue(form, "app_protocol")].some(
                  Boolean
                )
              ) {
                return t("challenge.instance.image.form.service.port.required");
              }
              return "";
            },
          ]}
        >
          {(field, props) => (
            <Input
              class="flex-1"
              icon={<span class="shrink-0 icon-[fluent--cloud-link-20-regular] w-5 h-5" />}
              title={t("challenge.instance.image.form.service.port.label")}
              placeholder={t("challenge.instance.image.form.service.port.placeholder")}
              type="number"
              {...props}
              value={field.value ?? ""}
              error={field.error}
            />
          )}
        </Field>
      </div>
      <Show when={getValue(form, "protocol") === "udp"}>
        <Card level="warning" contentClass="p-2 flex flex-row space-x-2 items-center">
          <span class="shrink-0 icon-[fluent--info-20-regular] w-5 h-5" />
          <span>{t("challenge.instance.image.form.service.protocol.udpNotWorkingWithWsrx")}</span>
        </Card>
      </Show>
      <div class="flex flex-row space-x-2">
        <Field name="cpu" type="number" validate={[required(t("challenge.instance.image.form.service.cpu.required"))]}>
          {(field1) => (
            <Field
              name="cpu_req"
              type="number"
              validate={[required(t("challenge.instance.image.form.service.cpu.required"))]}
            >
              {(field2) => (
                <RangeSlider
                  class="flex-1"
                  label={t("challenge.instance.image.form.service.cpu.label")}
                  max={4}
                  min={0.01}
                  step={0.01}
                  name={field1.name}
                  value={[field2.value || 0.01, field1.value || 0.5]}
                  onValueChange={(details) => {
                    const value = details.value;
                    setValue(form, "cpu", value[1]);
                    setValue(form, "cpu_req", value[0]);
                  }}
                />
              )}
            </Field>
          )}
        </Field>
        <Field name="mem" validate={[required(t("challenge.instance.image.form.service.mem.required"))]}>
          {(field1) => (
            <Field name="mem_req" validate={[required(t("challenge.instance.image.form.service.mem.required"))]}>
              {(field2) => (
                <RangeSlider
                  class="flex-1"
                  label={`${t("challenge.instance.image.form.service.mem.label")} (MB)`}
                  max={4096}
                  min={32}
                  step={32}
                  name={field1.name}
                  value={[
                    Number.parseInt(field2.value?.replace("Mi", "") || "32", 10) || 32,
                    Number.parseInt(field1.value?.replace("Mi", "") || "128", 10) || 128,
                  ]}
                  onValueChange={(e) => {
                    setValue(form, "mem", `${e.value[1]}Mi`);
                    setValue(form, "mem_req", `${e.value[0]}Mi`);
                  }}
                />
              )}
            </Field>
          )}
        </Field>
        <Field name="storage" validate={[required(t("challenge.instance.image.form.service.storage.required"))]}>
          {(field1) => (
            <Field
              name="storage_req"
              validate={[required(t("challenge.instance.image.form.service.storage.required"))]}
            >
              {(field2) => (
                <RangeSlider
                  class="flex-1"
                  label={`${t("challenge.instance.image.form.service.storage.label")} (MB)`}
                  max={20480}
                  min={32}
                  step={32}
                  name={field1.name}
                  value={[
                    Number.parseInt(field2.value?.replace("Mi", "") || "64", 10) || 64,
                    Number.parseInt(field1.value?.replace("Mi", "") || "1024", 10) || 1024,
                  ]}
                  onValueChange={(e) => {
                    setValue(form, "storage", `${e.value[1]}Mi`);
                    setValue(form, "storage_req", `${e.value[0]}Mi`);
                  }}
                />
              )}
            </Field>
          )}
        </Field>
      </div>
      <Button
        type="submit"
        level="primary"
        class="mt-4!"
        loading={addMutation.isPending}
        disabled={addMutation.isPending}
      >
        {t("general.actions.add.title")}
      </Button>
    </Form>
  );
}

function InstanceList(props: ChallengeWidgetProps) {
  const pods = useChallengeInstance({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });
  const refreshTimer = setInterval(() => {
    pods.refetch();
  }, 30 * 1000);
  onCleanup(() => {
    clearInterval(refreshTimer);
  });
  return (
    <ul class="flex flex-col">
      <For
        each={pods.data ?? []}
        fallback={
          <div class="h-12 flex flex-row space-x-2 items-center opacity-60 border-b border-b-layer-content/10">
            <span class="shrink-0 icon-[fluent--emoji-sad-20-regular] w-5 h-5" />
            <span>{t("challenge.instance.empty")}</span>
          </div>
        }
      >
        {(pod) => (
          <li class="h-12 flex flex-row space-x-2 items-center border-b border-b-layer-content/10">
            <span class="shrink-0 icon-[fluent--cube-20-regular] w-5 h-5" />
            <span>{pod.metadata?.name}</span>
            <A
              class="hover:underline flex items-center space-x-2"
              href={`/users/${pod.metadata?.labels?.["ret.sh.cn/user"]}`}
            >
              <span class="shrink-0 icon-[fluent--person-20-regular] w-5 h-5" />
              <span>{pod.metadata?.annotations?.["ret.sh.cn/user"]}</span>
            </A>
            <A
              class="hover:underline flex items-center space-x-2"
              href={`/games/${props.gameId}/teams/${pod.metadata?.labels?.["ret.sh.cn/team"]}`}
            >
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{pod.metadata?.annotations?.["ret.sh.cn/team"]}</span>
            </A>
            <span class="flex-1" />
            <span class="opacity-60">{pod.status?.phase}</span>
            <Popover
              btnContent={<span class="shrink-0 icon-[fluent--production-20-regular] w-5 h-5" />}
              ghost
              square
              size="sm"
            >
              <Card contentClass="py-2 px-4 flex flex-col max-w-xl">
                <Show when={pod.metadata}>
                  <div class="py-2 flex flex-row space-x-2 items-center border-b border-b-layer-content/5">
                    <span class="shrink-0 icon-[fluent--clock-20-regular] w-5 h-5" />
                    <span>
                      {DateTime.fromISO(pod.metadata?.creationTimestamp || "").toFormat("yyyy-MM-dd HH:mm:ss")}
                    </span>
                  </div>
                </Show>
                <For each={pod.status?.containerStatuses || []}>
                  {(container) => (
                    <div class="py-2 flex flex-row space-x-2 items-center border-b border-b-layer-content/5">
                      <span class="shrink-0 icon-[fluent--cube-20-regular] w-5 h-5" />
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

export default function (props: ChallengeWidgetProps) {
  let pullSecretInput: HTMLInputElement;
  const challenge = useChallenge({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });
  const challengeEnv = useChallengeEnv({
    game_id: () => props.gameId,
    challenge_id: () => props.challengeId,
  });

  const registryConfig = useRegistryConfig({ game_id: () => props.gameId });
  const repos = useRegistryRepositories({ game_id: () => props.gameId });
  const updateMutation = useUpdateChallengeEnvMutation({
    onSuccess: () => {
      inflyClient.invalidateQueries({
        queryKey: ["game", props.gameId, "challenge", props.challengeId],
      });
    },
  });

  async function onToggleInternet() {
    updateMutation.mutate({
      game_id: challenge.data!.game_id,
      challenge_id: challenge.data!.id,
      env: {
        internet: !(challengeEnv.data?.internet || false),
        restricted: challengeEnv.data?.restricted ?? null,
        images: challengeEnv.data?.images || [],
        pull_secret: challengeEnv.data?.pull_secret || null,
      },
    });
  }
  async function onToggleRestricted() {
    updateMutation.mutate({
      game_id: challenge.data!.game_id,
      challenge_id: challenge.data!.id,
      env: {
        internet: challengeEnv.data?.internet || false,
        restricted: !(challengeEnv.data?.restricted ?? false),
        images: challengeEnv.data?.images || [],
        pull_secret: challengeEnv.data?.pull_secret || null,
      },
    });
  }

  async function onDeleteImage(name: string) {
    updateMutation.mutate({
      game_id: challenge.data!.game_id,
      challenge_id: challenge.data!.id,
      env: {
        internet: challengeEnv.data?.internet || false,
        restricted: challengeEnv.data?.restricted ?? null,
        images: challengeEnv.data?.images?.filter((image) => image.name !== name) || [],
        pull_secret: challengeEnv.data?.pull_secret || null,
      },
    });
  }

  const deleteMutation = useDeleteChallengeEnvMutation({
    onSuccess: () => {
      challengeEnv.refetch();
    },
  });
  async function onDeleteEnv() {
    deleteMutation.mutate({
      game_id: challenge.data!.game_id,
      challenge_id: challenge.data!.id,
    });
  }

  async function onSavePullSecret(n: string) {
    updateMutation.mutate({
      game_id: challenge.data!.game_id,
      challenge_id: challenge.data!.id,
      env: {
        internet: challengeEnv.data?.internet || false,
        restricted: challengeEnv.data?.restricted ?? null,
        images: challengeEnv.data?.images || [],
        pull_secret: n ?? null,
      },
    });
  }

  const [formOpen, setFormOpen] = createSignal(false);
  return (
    <div class="flex-1 flex flex-col space-y-2 p-3 lg:p-6">
      <header class="min-h-12 border-b border-b-layer-content/15 flex flex-row items-center flex-wrap justify-end space-x-2 font-bold py-2 gap-y-2">
        <span class="flex flex-row space-x-2 items-center overflow-hidden">
          <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
          <span class="flex-1 truncate text-start">{t("challenge.instance.image.label")}</span>
        </span>
        <span class="flex-1" />
        <Show when={registryConfig.data?.enabled}>
          <span class="truncate font-bold">{t("challenge.instance.image.upload")}:</span>
        </Show>
        <span class="flex flex-row justify-end items-center flex-wrap gap-y-2 gap-x-2">
          <Show when={registryConfig.data?.enabled}>
            <UploadButton
              size="sm"
              url={`${api_root}/game/${props.gameId}/registry`}
              onDone={() => {
                addToast({
                  level: "success",
                  description: t("general.actions.upload.status.success"),
                  duration: 5000,
                });
                repos.refetch();
              }}
            />
          </Show>
          <Dialog
            size="sm"
            btnContent={<span>{t("general.actions.add.title")}</span>}
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
              gameId={props.gameId}
              challengeId={props.challengeId}
              onDone={() => {
                setFormOpen(false);
              }}
            />
          </Dialog>
          <Show when={challengeEnv.data}>
            <Popover level="error" size="sm" btnContent={<span>{t("general.actions.delete.title")}</span>}>
              <Card contentClass="p-2 flex flex-col space-x-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                  <span>{t("challenge.instance.delete")}</span>
                </span>
                <Button level="primary" size="sm" class="self-end" onClick={onDeleteEnv}>
                  {t("general.actions.yes.title")}
                </Button>
              </Card>
            </Popover>
          </Show>
        </span>
      </header>
      <div class="grid grid-cols-fit-xs max-w-full gap-2">
        <Checkbox
          checked={challengeEnv.data?.internet}
          onChange={() => {
            onToggleInternet();
          }}
        >
          <span class="flex-1 text-start">{t("challenge.instance.internet")}</span>
        </Checkbox>
        <Checkbox
          checked={challengeEnv.data?.restricted ?? false}
          onChange={() => {
            onToggleRestricted();
          }}
        >
          <span class="flex-1 text-start">{t("challenge.instance.restrict")}</span>
        </Checkbox>
        <Input
          class="flex-1"
          icon={<span class="shrink-0 icon-[fluent--lock-20-regular] w-5 h-5" />}
          placeholder={t("challenge.instance.registrySecret")}
          ref={pullSecretInput!}
          value={challengeEnv.data?.pull_secret || ""}
          extraBtn={
            <Button
              class="rounded-l-none!"
              onClick={() => {
                onSavePullSecret(pullSecretInput!.value);
              }}
            >
              <span> {t("general.actions.save.title")}</span>
            </Button>
          }
        />
      </div>
      <Show when={challengeEnv.data?.images.every((image) => !image.port)}>
        <Card level="warning" contentClass="p-2 flex space-x-2 items-center">
          <span class="shrink-0 icon-[fluent--warning-20-filled] w-5 h-5 text-warning" />
          <p class="font-bold">{`${t("challenge.instance.errors.noExportedServices.title")}: ${t("challenge.instance.errors.noExportedServices.message")}`}</p>
        </Card>
      </Show>
      <For
        each={challengeEnv.data?.images || []}
        fallback={
          <div class="h-12 flex flex-row space-x-2 items-center opacity-60 border-b border-b-layer-content/10">
            <span class="shrink-0 icon-[fluent--emoji-sad-20-regular] w-5 h-5" />
            <span>{t("challenge.instance.image.empty")}</span>
          </div>
        }
      >
        {(image) => (
          <div class="py-2 flex flex-col space-y-1 border-b border-b-layer-content/10">
            <div class="flex flex-row space-x-2 items-center">
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{image.name}</span>
              <span class="opacity-60 flex-1 text-end truncate" title={image.tag}>
                {image.tag}
              </span>
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
                  <Button level="primary" size="sm" class="self-end" onClick={() => onDeleteImage(image.name)}>
                    {t("general.actions.yes.title")}
                  </Button>
                </Card>
              </Popover>
            </div>
            <div class="flex flex-row space-x-2 items-center opacity-80">
              <span class="shrink-0 icon-[fluent--cloud-link-20-regular] w-5 h-5" />
              <Show when={image.port} fallback={<span class="font-bold opacity-60">N/A</span>}>
                <span class="text-warning font-bold">
                  {image.protocol || image.service_type || "tcp"}:{image.port} ({image.app_protocol || "raw"})
                </span>
                <span>({image.description})</span>
              </Show>
              <span class="flex-1" />
              <span class="shrink-0 icon-[fluent--engine-20-regular] w-5 h-5" />
              <span class="font-bold opacity-60">
                CPU: {image.cpu_req} - {image.cpu}
              </span>
              <span class="shrink-0 icon-[fluent--box-20-regular] w-5 h-5" />
              <span class="font-bold opacity-60">
                Memory: {image.mem_req} - {image.mem}
              </span>
              <span class="shrink-0 icon-[fluent--archive-20-regular] w-5 h-5" />
              <span class="font-bold opacity-60">
                Storage: {image.storage_req} - {image.storage || "3Gi"}
              </span>
            </div>
          </div>
        )}
      </For>
      <Show when={challengeEnv.data}>
        <header class="h-12 border-b border-b-layer-content/15 flex flex-row items-center space-x-2 font-bold">
          <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
          <span class="flex-1 text-start">{t("challenge.instance.runningContainers")}</span>
        </header>
        <InstanceList gameId={props.gameId} challengeId={props.challengeId} />
      </Show>
    </div>
  );
}
