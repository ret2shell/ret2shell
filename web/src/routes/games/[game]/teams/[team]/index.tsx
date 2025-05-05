import { handleHttpError } from "@api";
import {
  createTeamExtra,
  getTeamExtras,
  getTeamInfo,
  getTeamMembers,
  getTeamSolves,
  updateSelfteam,
  updateTeamInfo,
} from "@api/game";
import SidebarLayout from "@blocks/sidebar-layout";
import type { Extra } from "@models/extra";
import type { Submission } from "@models/submission";
import type { Team } from "@models/team";
import type { User } from "@models/user";
import {
  clearError,
  createForm,
  maxLength,
  required,
  reset as resetForm,
  setValue,
  setValues,
} from "@modular-forms/solid";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useNavigate, useParams } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { gameStore, isGameAdmin, setGameStore } from "@storage/game";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Button from "@widgets/button";
import Chart from "@widgets/chart";
import Clipboard from "@widgets/clipboard";
import Input from "@widgets/input";
import Select from "@widgets/select";
import clsx from "clsx";
import { HTTPError } from "ky";
import { DateTime } from "luxon";
import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";
import { Transition } from "solid-transition-group";
import Sidebar from "./_blocks/sidebar";

type TeamAdminUpdateForm = {
  name: string;
  tag: string;
  state: string;
  institute_id: string;
};

function AdminManagement(props: {
  team: Team | null;
  onDone?: (team: Team) => void;
}) {
  const [form, { Form, Field }] = createForm<TeamAdminUpdateForm>();
  createEffect(() => {
    if (props.team) {
      untrack(() => {
        setValues(form, {
          name: props.team!.name,
          tag: props.team?.tag || "",
          institute_id: props.team?.institute_id?.toString() || "0",
          state: props.team?.state.toString() || "0",
        });
      });
    }
  });
  const institutesSelect = createMemo(() => {
    const result = [] as { value: string; label: string; icon: string }[];
    result.push({
      value: "0",
      label: t("institute.empty")!,
      icon: "icon-[fluent--earth-20-regular] w-5 h-5",
    });
    for (const institute of accountStore.institutes) {
      result.push({
        value: institute.id.toString(),
        label: institute.name,
        icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
      });
    }
    return result;
  });
  const [updating, setUpdating] = createSignal(false);
  async function onSubmit(result: TeamAdminUpdateForm) {
    setUpdating(true);
    try {
      const team = await updateTeamInfo(gameStore.current!.id, props.team!.id, {
        ...props.team!,
        name: result.name,
        tag: result.tag || null,
        state: Number.parseInt(result.state),
        institute_id: Number.parseInt(result.institute_id) || null,
      });
      props.onDone?.(team);
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setUpdating(false);
  }
  return (
    <>
      <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
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
              validate={[required(t("team.form.name.required")!), maxLength(32, t("team.form.name.maximumLength")!)]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  icon={<span class="icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
                  title={t("team.form.name.label")!}
                  placeholder={t("team.form.name.placeholder")!}
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
                  label={t("team.form.institute.label")!}
                  placeholder={t("team.form.institute.placeholder")!}
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
                  label={t("team.status.title")!}
                  items={[
                    {
                      value: "0",
                      label: t("team.status.banned.title")!,
                      icon: "icon-[fluent--dismiss-circle-20-regular] w-5 h-5 text-error",
                    },
                    {
                      value: "1",
                      label: t("team.status.pending.title")!,
                      icon: "icon-[fluent--question-circle-20-regular] w-5 h-5 text-warning",
                    },
                    {
                      value: "2",
                      label: t("team.status.hidden.title")!,
                      icon: "icon-[fluent--eye-off-20-regular] w-5 h-5 text-warning",
                    },
                    {
                      value: "3",
                      label: t("team.status.passed.title")!,
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
          <Field name="tag" validate={[maxLength(32, t("team.form.tag.maximumLength")!)]}>
            {(field, props) => (
              <Input
                class="flex-1"
                icon={<span class="icon-[fluent--tag-20-regular] w-5 h-5" />}
                title={t("team.form.tag.label")!}
                placeholder={t("team.form.tag.placeholder")!}
                {...props}
                value={field.value}
                error={field.error}
              />
            )}
          </Field>
          <Button type="submit" level="primary" class="!mt-4" loading={updating()} disabled={updating()}>
            {t("general.actions.save.title")}
          </Button>
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

function SelfManagement(props: { members: User[] }) {
  const [form, { Form, Field }] = createForm<TeamSelfUpdateForm>();
  createEffect(() => {
    if (gameStore.team) {
      untrack(() => {
        setValues(form, {
          name: gameStore.team!.name,
          tag: gameStore.team?.tag || "",
          institute_id: gameStore.team?.institute_id?.toString() || "0",
        });
      });
    }
  });
  const institutesSelect = createMemo(() => {
    const result = [] as { value: string; label: string; icon: string }[];
    result.push({
      value: "0",
      label: t("institute.empty")!,
      icon: "icon-[fluent--earth-20-regular] w-5 h-5",
    });
    const institute_id = props.members.at(0)?.institute_id ?? null;
    if (!institute_id) return result;
    for (const member of props.members) {
      if (member.institute_id !== institute_id) {
        return result;
      }
    }
    result.push({
      value: institute_id.toString(),
      label: accountStore.institutes.find((i) => i.id === institute_id)?.name || "Unknown",
      icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
    });
    return result;
  });
  const [updating, setUpdating] = createSignal(false);
  async function onSubmit(result: TeamSelfUpdateForm) {
    setUpdating(true);
    try {
      const team = await updateSelfteam(gameStore.current!.id, {
        name: result.name,
        tag: result.tag || null,
        institute_id: Number.parseInt(result.institute_id) || null,
      });
      setGameStore({ team });
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setUpdating(false);
  }
  return (
    <>
      <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
        <span>{t("team.selfManagement")}</span>
      </h3>
      <section class="flex flex-col space-y-2 mt-2">
        <div class="flex flex-col space-y-1">
          <header class="label">{t("team.token")}</header>
          <Clipboard value={gameStore.team?.token || undefined} />
        </div>
        <Form class="flex flex-col space-y-2" onSubmit={onSubmit}>
          <div class="flex flex-row space-x-2">
            <Field
              name="name"
              validate={[required(t("team.form.name.required")!), maxLength(32, t("team.form.name.maximumLength")!)]}
            >
              {(field, props) => (
                <Input
                  class="flex-1"
                  icon={<span class="icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
                  title={t("team.form.name.label")!}
                  placeholder={t("team.form.name.placeholder")!}
                  {...props}
                  value={field.value}
                  error={field.error}
                  required
                  disabled={gameStore.current?.team_size === 1}
                />
              )}
            </Field>
            <Field name="institute_id">
              {(field, props) => (
                <Select
                  class="flex-1 min-w-0"
                  label={t("team.form.institute.label")!}
                  placeholder={t("team.form.institute.placeholder")!}
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
          <Field name="tag" validate={[maxLength(32, t("team.form.tag.maximumLength")!)]}>
            {(field, props) => (
              <Input
                class="flex-1"
                icon={<span class="icon-[fluent--tag-20-regular] w-5 h-5" />}
                title={t("team.form.tag.label")!}
                placeholder={t("team.form.tag.placeholder")!}
                {...props}
                value={field.value}
                error={field.error}
                disabled={gameStore.current?.team_size === 1}
              />
            )}
          </Field>
          <Button type="submit" level="primary" class="!mt-4" loading={updating()} disabled={updating()}>
            {t("general.actions.save.title")}
          </Button>
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
  const [form, { Form, Field }] = createForm<CreateExtraForm>();
  setValue(form, "score", 0);

  const ptsInputIcon = ["icon-[fluent--subtract-20-regular]", "icon-[fluent--add-20-regular]"];
  const [ptsInputIconIndex, setPtsInputIconIndex] = createSignal(1);

  const [loading, setLoading] = createSignal(false);
  async function onSubmit(result: CreateExtraForm) {
    setLoading(true);
    try {
      await createTeamExtra(gameStore.current!.id, props.team!.id, {
        id: 0,
        created_at: DateTime.now(),
        reason: result.reason,
        score: result.score * (ptsInputIconIndex() === 0 ? -1 : 1),
        hint_id: null,
        challenge_id: null,
        team_id: props.team!.id,
      });
      resetForm(form, {
        initialValues: {
          reason: "",
          score: 0,
        },
      });
      props.onDone?.();
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.create.status.fail")!);
    }
    setLoading(false);
  }

  return (
    <Form onSubmit={onSubmit} class="min-h-12 border-b border-b-layer-content/10 flex flex-1 items-center space-x-2">
      <span class="icon-[fluent--add-circle-20-regular] w-5 h-5 text-info" />
      <Field name="reason" validate={[required(t("team.form.extraReason.required")!)]}>
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
      <Field name="score" type="number" validate={[required(t("team.form.extraScore.required")!)]}>
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
                const n = Number.parseInt(value);
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
      <Button size="sm" level="primary" type="submit" loading={loading()} disabled={loading()}>
        <span class="icon-[fluent--add-20-regular] w-5 h-5" />
        <span>{t("general.actions.create.title")}</span>
      </Button>
    </Form>
  );
}

export default function () {
  const [team, setTeam] = createSignal(null as Team | null);
  const [solves, setSolves] = createSignal([] as Submission[]);
  const [extras, setExtras] = createSignal([] as Extra[]);
  const params = useParams();
  const teamId = () => Number.parseInt(params.team) || null;
  const isSelfTeam = () => team() && team()?.id === gameStore.team?.id;
  const navigate = useNavigate();
  async function refreshExtras() {
    try {
      const resp = await getTeamExtras(gameStore.current!.id, teamId()!);
      setExtras(resp);
    } catch (err) {
      handleHttpError(err as Error, t("team.errors.fetchExtra.title")!);
    }
  }
  async function refreshInfo() {
    try {
      setTeam(await getTeamInfo(gameStore.current!.id, teamId()!, true));
    } catch (err) {
      if (err instanceof HTTPError && err.response.status === 404) {
        navigate("/sigtrap/404");
      }
      handleHttpError(err as Error, t("team.errors.fetch.title")!);
    }
  }
  async function refreshSolves() {
    try {
      const resp = await getTeamSolves(gameStore.current!.id, teamId()!);
      setSolves(resp);
    } catch (err) {
      handleHttpError(err as Error, t("team.errors.fetchSolves.title")!);
    }
  }
  createEffect(() => {
    if (gameStore.current && teamId()) {
      untrack(() => {
        refreshInfo();
        refreshExtras();
        refreshSolves();
      });
    }
  });
  const teamChartSeries = () => {
    return [
      {
        name: team()?.name || "unknown",
        type: "line",
        step: "end",
        data: team()?.history.map((h) => [h.changed_at.toMillis(), h.score]),
      },
    ];
  };
  const [members, setMembers] = createSignal([] as User[]);
  const [loadingMembers, setLoadingMembers] = createSignal(false);
  createEffect(() => {
    if (team()) {
      untrack(async () => {
        setLoadingMembers(true);
        try {
          setMembers(await getTeamMembers(gameStore.current!.id, team()!.id));
        } catch (err) {
          handleHttpError(err as Error, t("team.errors.fetchMember.title")!);
        }
        setLoadingMembers(false);
      });
    }
  });
  const matches = createBreakpoints(breakpoints);
  const [showSidebar, setShowSidebar] = createSignal(false);

  return (
    <>
      <Title page={team()?.name ?? t("team.title")} route={`/games/${gameStore.current?.id}/teams/${team()?.id}`} />
      <SidebarLayout
        leftBar={() => <Sidebar team={team()} members={members()} loading={loadingMembers()} />}
        showLeftBar={showSidebar()}
      >
        <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
          <div class="flex flex-col w-full max-w-5xl">
            <Show when={isSelfTeam()}>
              <SelfManagement members={members()} />
            </Show>
            <Show when={isGameAdmin()}>
              <AdminManagement
                team={team()}
                onDone={(team) => {
                  setTeam(team);
                }}
              />
            </Show>
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="icon-[fluent--data-trending-20-regular] w-5 h-5" />
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
                      fontFamily: "JetBrains Mono",
                    },
                  },
                  series: teamChartSeries(),
                }}
              />
            </section>
            <h3 class="h-12 flex items-center border-b border-b-layer-content/15 font-bold space-x-2">
              <span class="icon-[fluent--flag-20-regular] w-5 h-5" />
              <span>{t("team.solves")}</span>
            </h3>
            <section class="flex flex-col">
              <For
                each={solves()}
                fallback={
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                    <span class="icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                    <span>{t("team.noSolves")}</span>
                  </div>
                }
              >
                {(submission) => (
                  <A
                    class="h-12 flex items-center border-b border-b-layer-content/10 hover:bg-layer-content/5 space-x-2"
                    href={`/games/${gameStore.current?.id}/challenges?challenge=${submission.challenge_id}`}
                  >
                    <span class="icon-[fluent--checkmark-circle-20-regular] w-5 h-5 text-success" />
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
              <span class="icon-[fluent--trophy-20-regular] w-5 h-5" />
              <span>{t("team.extras")}</span>
            </h3>
            <section class="flex flex-col">
              <For
                each={extras()}
                fallback={
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2 opacity-60">
                    <span class="icon-[fluent--emoji-sad-slight-20-regular] w-5 h-5" />
                    <span>{t("team.noExtras")}</span>
                  </div>
                }
              >
                {(extra) => (
                  <div class="h-12 flex items-center border-b border-b-layer-content/10 hover:bg-layer-content/5 space-x-2">
                    <Show
                      when={extra.score > 0}
                      fallback={
                        <span class="icon-[fluent--arrow-circle-down-double-20-regular] w-5 h-5 text-warning" />
                      }
                    >
                      <span class="icon-[fluent--checkmark-circle-20-regular] w-5 h-5 text-success" />
                    </Show>
                    <span class="flex-1 text-start truncate">{extra.reason}</span>
                    <span class={clsx("font-bold", extra.score > 0 ? "text-success" : "text-warning")}>
                      {extra.score} pts
                    </span>
                    <span class="opacity-60">{extra.created_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
                  </div>
                )}
              </For>
              <Show when={isGameAdmin()}>
                <ExtraForm
                  team={team()}
                  onDone={() => {
                    refreshExtras();
                    setTimeout(() => {
                      refreshInfo();
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
