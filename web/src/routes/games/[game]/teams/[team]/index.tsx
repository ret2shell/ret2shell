import { useInstitutes } from "@api/account";
import { useGame } from "@api/game";
import {
  useCreateTeamExtraMutation,
  useDeleteTeamMutation,
  useLeaveSelfTeamMutation,
  useSelfTeam,
  useTeamExtras,
  useTeamInfo,
  useTeamMembers,
  useTeamSolves,
  useUpdateSelfTeamMutation,
  useUpdateTeamInfoMutation,
} from "@api/team";
import SidebarLayout from "@blocks/sidebar-layout";
import type { Team } from "@models/team";
import { clearError, createForm, maxLength, required, reset as resetForm } from "@modular-forms/solid";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useNavigate, useParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { buildFormDraftKey, useFormDraft } from "@storage/form";
import { isAdminOfGame } from "@storage/game";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Chart from "@widgets/chart";
import Clipboard from "@widgets/clipboard";
import FormDraftReset from "@widgets/form-draft-reset";
import Input from "@widgets/input";
import Popover from "@widgets/popover";
import Select from "@widgets/select";
import clsx from "clsx";
import { HTTPError } from "ky";
import { DateTime } from "luxon";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Transition } from "solid-transition-group";
import Sidebar from "./_blocks/sidebar";

type TeamAdminUpdateForm = {
  name: string;
  tag: string;
  state: string;
  institute_id: string;
};

function AdminManagement(props: { gameId: number; team: Team | null; onDone?: (team: Team) => Promise<void> }) {
  const navigate = useNavigate();
  const institutes = useInstitutes();
  const [form, { Form, Field }] = createForm<TeamAdminUpdateForm>({
    initialValues: {
      name: props.team?.name || "",
      tag: props.team?.tag || "",
      institute_id: props.team?.institute_id?.toString() || "0",
      state: props.team?.state.toString() || "0",
    },
  });
  const remoteValues = createMemo<TeamAdminUpdateForm>(() => ({
    name: props.team?.name || "",
    tag: props.team?.tag || "",
    institute_id: props.team?.institute_id?.toString() || "0",
    state: props.team?.state.toString() || "0",
  }));
  const draft = useFormDraft({
    form,
    key: () => (props.team ? buildFormDraftKey("games", props.gameId, "teams", props.team.id, "admin") : undefined),
    remoteValues,
    enabled: () => !!props.team,
  });
  const institutesSelect = createMemo(() => {
    const result = [] as { value: string; label: string; icon: string }[];
    result.push({
      value: "0",
      label: t("institute.empty"),
      icon: "icon-[fluent--earth-20-regular] w-5 h-5",
    });
    for (const institute of institutes.data ?? []) {
      result.push({
        value: institute.id.toString(),
        label: institute.name,
        icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
      });
    }
    return result;
  });

  const updateMutation = useUpdateTeamInfoMutation({
    onSuccess: async (team) => {
      await props.onDone?.(team);
      draft.discardDraft();
    },
  });

  function onSubmit(result: TeamAdminUpdateForm) {
    if (!props.team) return;
    updateMutation.mutate({
      game_id: props.gameId,
      team_id: props.team.id,
      team: {
        ...props.team,
        name: result.name,
        tag: result.tag || null,
        state: Number.parseInt(result.state, 10),
        institute_id: Number.parseInt(result.institute_id, 10) || null,
      },
    });
  }

  const deleteMutation = useDeleteTeamMutation({
    onSuccess: () => {
      navigate(`/games/${props.gameId}/scoreboard`);
    },
  });

  function handleDeleteTeam() {
    if (!props.team) return;
    deleteMutation.mutate({ game_id: props.gameId, team_id: props.team.id });
  }
  return (
    <>
      <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
        <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("team.selfManagement")}</span>
      </h3>
      <section class="flex flex-col space-y-2 mt-2">
        <div class="flex flex-col space-y-1">
          <header class="label">{t("team.token")}</header>
          <Clipboard value={props.team?.token || undefined} />
        </div>
        <Form class="flex flex-col space-y-2" onSubmit={onSubmit}>
          <div class="flex flex-row space-x-2">
            <Field
              name="name"
              validate={[required(t("team.form.name.required")!), maxLength(32, t("team.form.name.maximumLength"))]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  icon={<span class="shrink-0 icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
                  title={t("team.form.name.label")}
                  placeholder={t("team.form.name.placeholder")}
                  {...props}
                  value={field.value}
                  error={field.error}
                  required
                />
              )}
            </Field>
            <Field name="institute_id">
              {(field, props) => (
                <Select
                  class="flex-1 min-w-0"
                  label={t("team.form.institute.label")}
                  placeholder={t("team.form.institute.placeholder")}
                  items={institutesSelect()}
                  name={field.name}
                  error={field.error}
                  inputProps={props}
                  value={field.value ? [field.value.toString()] : undefined}
                />
              )}
            </Field>
            <Field name="state">
              {(field, props) => (
                <Select
                  class="flex-1 min-w-0"
                  label={t("team.status.title")}
                  items={[
                    {
                      value: "0",
                      label: t("team.status.banned.title"),
                      icon: "icon-[fluent--dismiss-circle-20-regular] w-5 h-5 text-error",
                    },
                    {
                      value: "1",
                      label: t("team.status.pending.title"),
                      icon: "icon-[fluent--question-circle-20-regular] w-5 h-5 text-warning",
                    },
                    {
                      value: "2",
                      label: t("team.status.hidden.title"),
                      icon: "icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning",
                    },
                    {
                      value: "3",
                      label: t("team.status.passed.title"),
                      icon: "icon-[fluent--checkmark-circle-20-regular] w-5 h-5 text-success",
                    },
                  ]}
                  name={field.name}
                  error={field.error}
                  inputProps={props}
                  value={field.value ? [field.value.toString()] : undefined}
                />
              )}
            </Field>
          </div>
          <Field name="tag" validate={[maxLength(32, t("team.form.tag.maximumLength"))]}>
            {(field, props) => (
              <Input
                class="flex-1"
                icon={<span class="shrink-0 icon-[fluent--tag-20-regular] w-5 h-5" />}
                title={t("team.form.tag.label")}
                placeholder={t("team.form.tag.placeholder")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <div class="mt-4! flex flex-row space-x-2">
            <Button
              type="submit"
              level="primary"
              class="flex-1"
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              {t("general.actions.save.title")}
            </Button>
            <FormDraftReset
              when={draft.hasDraft()}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
              onConfirm={draft.discardDraft}
            />
            <Popover
              type="button"
              level="error"
              ghost
              size="sm"
              square
              title={t("general.actions.delete.title")}
              btnContent={<span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />}
            >
              <Card contentClass="p-2 flex flex-col space-y-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                  <span>{t("general.actions.delete.message")}</span>
                </span>
                <Button
                  level="primary"
                  size="sm"
                  class="self-end"
                  onClick={handleDeleteTeam}
                  loading={deleteMutation.isPending}
                >
                  {t("general.actions.yes.title")}
                </Button>
              </Card>
            </Popover>
          </div>
        </Form>
      </section>
      <div class="h-16" />
    </>
  );
}

type TeamSelfUpdateForm = {
  name: string;
  tag: string;
  institute_id: string;
};

function SelfManagement(props: { gameId: number; onDone?: (team: Team) => Promise<void>; onLeft?: () => void }) {
  const game = useGame({ id: () => props.gameId, enabled: () => !!props.gameId });
  const institutes = useInstitutes();
  const team = useSelfTeam({ game_id: () => props.gameId });
  const members = useTeamMembers({
    game_id: () => props.gameId,
    team_id: () => team.data?.id || 0,
    enabled: () => !!team.data,
  });
  const [form, { Form, Field }] = createForm<TeamSelfUpdateForm>({
    initialValues: {
      name: team.data?.name,
      tag: team.data?.tag || "",
      institute_id: team.data?.institute_id?.toString() || "0",
    },
  });
  const remoteValues = createMemo<TeamSelfUpdateForm>(() => ({
    name: team.data?.name || "",
    tag: team.data?.tag || "",
    institute_id: team.data?.institute_id?.toString() || "0",
  }));
  const draft = useFormDraft({
    form,
    key: () => (team.data ? buildFormDraftKey("games", props.gameId, "teams", team.data.id, "self") : undefined),
    remoteValues,
    enabled: () => !!team.data,
  });
  const institutesSelect = createMemo(() => {
    const result = [] as { value: string; label: string; icon: string }[];
    result.push({
      value: "0",
      label: t("institute.empty"),
      icon: "icon-[fluent--earth-20-regular] w-5 h-5",
    });
    const institute_id = members.data?.at(0)?.institute_id ?? null;
    if (!institute_id) return result;
    for (const member of members.data ?? []) {
      if (member.institute_id !== institute_id) {
        return result;
      }
    }
    result.push({
      value: institute_id.toString(),
      label: institutes.data?.find((i) => i.id === institute_id)?.name || "Unknown",
      icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
    });
    return result;
  });

  const updateMutation = useUpdateSelfTeamMutation({
    onSuccess: async (team) => {
      await props.onDone?.(team);
      draft.discardDraft();
    },
  });

  function onSubmit(result: TeamSelfUpdateForm) {
    updateMutation.mutate({
      game_id: props.gameId,
      team: {
        name: result.name,
        tag: result.tag || null,
        institute_id: Number.parseInt(result.institute_id, 10) || null,
      },
    });
  }

  const leaveMutation = useLeaveSelfTeamMutation({
    onSuccess: () => {
      props.onLeft?.();
    },
  });

  function handleLeaveTeam() {
    leaveMutation.mutate({ game_id: props.gameId });
  }

  return (
    <>
      <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
        <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("team.selfManagement")}</span>
      </h3>
      <section class="flex flex-col space-y-2 mt-2">
        <div class="flex flex-col space-y-1">
          <header class="label">{t("team.token")}</header>
          <Clipboard value={team.data?.token || undefined} />
        </div>
        <Form class="flex flex-col space-y-2" onSubmit={onSubmit}>
          <div class="flex flex-row space-x-2">
            <Field
              name="name"
              validate={[required(t("team.form.name.required")!), maxLength(32, t("team.form.name.maximumLength"))]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  icon={<span class="shrink-0 icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
                  title={t("team.form.name.label")}
                  placeholder={t("team.form.name.placeholder")}
                  {...props}
                  value={field.value}
                  error={field.error}
                  required
                  disabled={game.data?.team_size === 1}
                />
              )}
            </Field>
            <Field name="institute_id">
              {(field, props) => (
                <Select
                  class="flex-1 min-w-0"
                  label={t("team.form.institute.label")}
                  placeholder={t("team.form.institute.placeholder")}
                  items={institutesSelect()}
                  name={field.name}
                  error={field.error}
                  inputProps={props}
                  // onValueChange={(v) => {
                  //   setValue(form, "institute_id", (v.value.at(0) && Number.parseInt(v.value.at(0)!)) || 0);
                  // }}
                  value={field.value ? [field.value.toString()] : undefined}
                />
              )}
            </Field>
          </div>
          <Field name="tag" validate={[maxLength(32, t("team.form.tag.maximumLength"))]}>
            {(field, props) => (
              <Input
                class="flex-1"
                icon={<span class="shrink-0 icon-[fluent--tag-20-regular] w-5 h-5" />}
                title={t("team.form.tag.label")}
                placeholder={t("team.form.tag.placeholder")}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <div class="mt-4! flex flex-row space-x-2">
            <Button
              type="submit"
              level="primary"
              class="flex-1"
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              {t("general.actions.save.title")}
            </Button>
            <FormDraftReset
              when={draft.hasDraft()}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
              onConfirm={draft.discardDraft}
            />
            <Popover
              type="button"
              level="error"
              ghost
              size="sm"
              title={t("general.actions.leave.title")}
              square
              btnContent={<span class="shrink-0 icon-[fluent--arrow-exit-20-regular] w-5 h-5" />}
            >
              <Card contentClass="p-2 flex flex-col space-y-2 max-w-96">
                <span class="inline-block space-x-2">
                  <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                  <span>{t("general.actions.leave.message")}</span>
                </span>
                <Button
                  level="primary"
                  size="sm"
                  class="self-end"
                  onClick={handleLeaveTeam}
                  loading={leaveMutation.isPending}
                >
                  {t("general.actions.yes.title")}
                </Button>
              </Card>
            </Popover>
          </div>
        </Form>
      </section>
      <div class="h-16" />
    </>
  );
}
type CreateExtraForm = {
  reason: string;
  score: number;
};

function ExtraForm(props: { team: Team | null; onDone?: () => void }) {
  const [form, { Form, Field }] = createForm<CreateExtraForm>({
    initialValues: {
      score: 0,
    },
  });

  const ptsInputIcon = ["icon-[fluent--subtract-20-regular]", "icon-[fluent--add-20-regular]"];
  const [ptsInputIconIndex, setPtsInputIconIndex] = createSignal(1);

  const params = useParams();
  const gameId = () => Number.parseInt(params.game || "0", 10) || 0;
  const createExtraMutation = useCreateTeamExtraMutation({
    onSuccess: () => {
      resetForm(form, {
        initialValues: {
          reason: "",
          score: 0,
        },
      });
      props.onDone?.();
    },
  });

  function onSubmit(result: CreateExtraForm) {
    if (!props.team) return;
    createExtraMutation.mutate({
      game_id: gameId(),
      team_id: props.team.id,
      extra: {
        id: 0,
        created_at: DateTime.now(),
        reason: result.reason,
        score: result.score * (ptsInputIconIndex() === 0 ? -1 : 1),
        hint_id: null,
        challenge_id: null,
        team_id: props.team.id,
      },
    });
  }

  return (
    <Form onSubmit={onSubmit} class="min-h-12 border-b border-b-layer-content/10 flex flex-1 items-center space-x-2">
      <span class="shrink-0 icon-[fluent--add-circle-20-regular] w-5 h-5 text-info" />
      <Field name="reason" validate={[required(t("team.form.extraReason.required"))]}>
        {(field, props) => (
          <Input
            type="text"
            value={field.value}
            error={field.error}
            {...props}
            required
            noLabel
            placeholder={t("team.form.extraReason.placeholder")}
            class="flex-1"
            size="sm"
            onBlur={(e) => {
              clearError(form, "reason");
              return props.onBlur(e);
            }}
          />
        )}
      </Field>
      <Field name="score" type="number" validate={[required(t("team.form.extraScore.required"))]}>
        {(field, props) => (
          <Input
            type="text" // use text, we will convert to number manually
            value={field.value}
            error={field.error}
            {...props}
            required
            onInput={(e) => {
              // set num to `null` for prevValue
              const setNumber = (num: number | null, str: string, _switch: boolean) => {
                if (_switch) {
                  setPtsInputIconIndex(ptsInputIconIndex() === 0 ? 1 : 0);
                }
                e.currentTarget.value = str;
                Object.defineProperty(e.currentTarget, "valueAsNumber", {
                  writable: true,
                });
                e.currentTarget.valueAsNumber = num || 0;
                Object.freeze(e.currentTarget.valueAsNumber);
              };
              // manually parse number
              function parseNumber(_v: string): [number | null, string, boolean] {
                let value = _v;
                if (value === "0-") return [0, "0", true];
                const neg = (/^(-*)/.exec(value)?.[1].length ?? 0) % 2 === 1;
                value = value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
                const n = Number.parseInt(value, 10);
                return [!Number.isNaN(n) ? n : 0, value, neg];
              }
              setNumber(...parseNumber(e.currentTarget.value));
              return props.onInput(e);
            }}
            noLabel
            placeholder={t("team.form.extraScore.placeholder")}
            class="w-32"
            size="sm"
            icon={<span class={ptsInputIcon[ptsInputIconIndex()]} />}
          />
        )}
      </Field>
      <span class="font-bold opacity-60">pts</span>
      <span class="w-8" />
      <Button
        size="sm"
        level="primary"
        type="submit"
        loading={createExtraMutation.isPending}
        disabled={createExtraMutation.isPending}
      >
        <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
        <span>{t("general.actions.create.title")}</span>
      </Button>
    </Form>
  );
}

export default function () {
  const params = useParams();
  const gameId = () => Number.parseInt(params.game || "0", 10) || 0;
  const teamId = () => Number.parseInt(params.team || "0", 10) || 0;
  const navigate = useNavigate();

  const game = useGame({
    id: gameId,
    enabled: () => gameId() > 0,
  });

  const team = useTeamInfo({
    game_id: gameId,
    team_id: teamId,
    ex: () => true,
    enabled: () => gameId() > 0 && teamId() > 0,
    onError: (err) => {
      if (err instanceof HTTPError && err.response.status === 404) {
        navigate("/sigtrap/404");
      }
      return false;
    },
  });

  const members = useTeamMembers({
    game_id: gameId,
    team_id: teamId,
    enabled: () => gameId() > 0 && teamId() > 0,
  });

  const solves = useTeamSolves({
    game_id: gameId,
    team_id: teamId,
    enabled: () => gameId() > 0 && teamId() > 0,
  });

  const sortedSolves = createMemo(() => {
    return [...(solves.data ?? [])].sort((a, b) => a.created_at.toMillis() - b.created_at.toMillis());
  });

  const extras = useTeamExtras({
    game_id: gameId,
    team_id: teamId,
    enabled: () => gameId() > 0 && teamId() > 0,
  });

  const selfTeam = useSelfTeam({
    game_id: gameId,
    enabled: () => gameId() > 0 && !!accountStore.id,
    silenced: true,
  });

  const isSelfTeam = createMemo(() => !!selfTeam.data && !!team.data && selfTeam.data.id === team.data.id);

  const teamChartSeries = () => {
    return [
      {
        name: team.data?.name || "unknown",
        type: "line",
        step: "end",
        data: team.data?.history.map((h) => [h.changed_at.toMillis(), h.score]),
      },
    ];
  };
  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);

  return (
    <>
      <Title
        page={team.data?.name ?? t("team.title")}
        route={`/games/${gameId()}/teams/${team.data?.id ?? teamId()}`}
      />
      <SidebarLayout
        leftBar={() => <Sidebar team={team.data ?? null} members={members.data ?? []} loading={members.isLoading} />}
        showLeftBar={showSidebar()}
      >
        <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
          <div class="flex flex-col w-full max-w-5xl">
            <Show when={isSelfTeam()}>
              <SelfManagement
                gameId={gameId()}
                onDone={async () => {
                  await Promise.all([selfTeam.refetch(), team.refetch()]);
                }}
                onLeft={() => {
                  navigate(`/games/${gameId()}`);
                }}
              />
            </Show>
            <Show when={isAdminOfGame(game.data)}>
              <AdminManagement
                gameId={gameId()}
                team={team.data ?? null}
                onDone={async () => {
                  await Promise.all([team.refetch(), members.refetch(), solves.refetch(), extras.refetch()]);
                }}
              />
            </Show>
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--data-trending-20-regular] w-5 h-5" />
              <span>{t("team.scoreChart")}</span>
            </h3>
            <section class="w-full h-64 lg:h-96">
              <Chart
                option={{
                  grid: {
                    left: "72px",
                    right: "24px",
                    bottom: "80px",
                    top: "48px",
                  },
                  tooltip: {
                    trigger: "axis",
                    axisPointer: {
                      type: "line",
                      label: {
                        precision: 0,
                      },
                      snap: true,
                    },
                    borderColor: "transparent",
                  },
                  dataZoom: [
                    {
                      type: "slider",
                      filterMode: "none",
                      show: true,
                    },
                  ],
                  toolbox: {},
                  xAxis: {
                    type: "time",
                  },
                  yAxis: {
                    type: "value",
                    min: () => 0,
                    max: (value: { min: number; max: number }) => {
                      if (value.max < 100) return 100;
                      return Math.ceil(value.max + value.max * 0.1);
                    },
                    axisLabel: {
                      fontFamily: "Reverier Mono",
                    },
                  },
                  series: teamChartSeries(),
                }}
              />
            </section>
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{t("team.solves")}</span>
            </h3>
            <section class="flex flex-col">
              <For
                each={sortedSolves()}
                fallback={
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                    <span class="shrink-0 icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                    <span>{t("team.noSolves")}</span>
                  </div>
                }
              >
                {(submission) => (
                  <A
                    class="h-12 flex items-center border-b border-b-layer-content/10 hover:bg-layer-content/5 space-x-2"
                    href={`/games/${gameId()}/challenges?challenge=${submission.challenge_id}`}
                  >
                    <span class="shrink-0 icon-[fluent--checkmark-circle-20-regular] w-5 h-5 text-success" />
                    <span class="flex-1 text-start truncate">
                      {t("team.solvesJournal", {
                        challenge: submission.challenge_name!,
                        user: submission.user_name!,
                      })}
                    </span>
                    <span class="text-success font-bold">{submission.score} pts</span>
                    <span class="opacity-60">{submission.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                  </A>
                )}
              </For>
            </section>
            <div class="h-16" />
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="shrink-0 icon-[fluent--trophy-20-regular] w-5 h-5" />
              <span>{t("team.extras")}</span>
            </h3>
            <section class="flex flex-col">
              <For
                each={extras.data ?? []}
                fallback={
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                    <span class="shrink-0 icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                    <span>{t("team.noExtras")}</span>
                  </div>
                }
              >
                {(extra) => (
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 hover:bg-layer-content/5 space-x-2">
                    <Show
                      when={extra.score > 0}
                      fallback={
                        <span class="shrink-0 icon-[fluent--arrow-circle-down-double-20-regular] w-5 h-5 text-warning" />
                      }
                    >
                      <span class="shrink-0 icon-[fluent--checkmark-circle-20-regular] w-5 h-5 text-success" />
                    </Show>
                    <span class="flex-1 text-start truncate">{extra.reason}</span>
                    <span class={clsx("font-bold", extra.score > 0 ? "text-success" : "text-warning")}>
                      {extra.score} pts
                    </span>
                    <span class="opacity-60">{extra.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                  </div>
                )}
              </For>
              <Show when={isAdminOfGame(game.data)}>
                <ExtraForm
                  team={team.data ?? null}
                  onDone={() => {
                    extras.refetch();
                    setTimeout(() => {
                      team.refetch();
                    }, 500);
                  }}
                />
              </Show>
            </section>
            <div class="h-24" />
          </div>
        </div>
      </SidebarLayout>
      <Transition name="slide-fade-right">
        <Show when={!matches.lg}>
          <Button
            class="fixed bottom-3 right-3 z-30"
            square
            onClick={() => setShowSidebar(!showSidebar())}
            type="button"
          >
            <span
              class={clsx(
                "transition-transform",
                showSidebar() ? "rotate-90" : "rotate-0",
                showSidebar() ? "icon-[fluent--dismiss-20-regular]" : "icon-[fluent--people-team-20-regular]",
                "w-5 h-5"
              )}
            />
          </Button>
        </Show>
      </Transition>
    </>
  );
}
