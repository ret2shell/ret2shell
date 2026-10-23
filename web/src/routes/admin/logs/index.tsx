import { api_root } from "@api";
import { type Log, usePlatformLogs, useQueryPlatformLog } from "@api/platform";
import DownloadButton from "@blocks/download-button";
import { createForm, getValue, setValue } from "@modular-forms/solid";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useSearchParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Button from "@widgets/button";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Select from "@widgets/select";
import clsx from "clsx";
import { DateTime } from "luxon";
import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import LogQueryInput from "./_blocks/query-input";

function LogField(log: Log) {
  if (!log) return null;
  return (
    <For each={Object.entries(log)}>
      {([key, value]) =>
        key.startsWith("fields.") && (
          <>
            <span class="italic opacity-60">{key.replace("fields.", "")}</span>
            <span class="opacity-60">=</span>
            <span>{value as string}&nbsp;&nbsp;</span>
          </>
        )
      }
    </For>
  );
}

function DataSpanField(log: Log) {
  if (!log) return null;
  return (
    <For each={Object.entries(log)}>
      {([key, value]) =>
        key.startsWith("span.data-") && (
          <>
            <span class="italic opacity-60">{key.replace("span.data-", "")}</span>
            <span class="opacity-60">=</span>
            <span>{value as string}&nbsp;&nbsp;</span>
          </>
        )
      }
    </For>
  );
}

export default function () {
  const [searchParams, setSearchParams] = useSearchParams();
  const logFiles = usePlatformLogs();

  const logs = useQueryPlatformLog({
    req: () => ({
      started_at: searchParams.started_at
        ? DateTime.fromSeconds(Number.parseInt(searchParams.started_at as string, 10))
        : DateTime.now().minus({ day: 1 }),
      ended_at: searchParams.ended_at
        ? DateTime.fromSeconds(Number.parseInt(searchParams.ended_at as string, 10))
        : DateTime.now(),
      limit: searchParams.limit ? Number.parseInt((searchParams.limit as string) || "NaN", 10) : 20,
      level: searchParams.level as string | undefined,
      trace: searchParams.trace as string | undefined,
      from: searchParams.from as string | undefined,
      account: searchParams.account as string | undefined,
      query: searchParams.query as string | undefined,
    }),
  });

  const [enableTimer, setEnableTimer] = createSignal(false);

  const timer = setInterval(() => {
    if (enableTimer()) {
      logs.refetch();
    }
  }, 5000);

  onCleanup(() => clearInterval(timer));

  function getColor(level: string) {
    switch (level) {
      case "INFO":
        return "text-info";
      case "WARN":
        return "text-warning";
      case "ERROR":
        return "text-error";
      case "DEBUG":
        return "text-gray-500";
      default:
        return "text-info";
    }
  }

  const time = (ts: string, format: string) => DateTime.fromISO(ts).toFormat(format);
  const matches = createBreakpoints(breakpoints);
  let bottomDiv: HTMLDivElement;

  type QueryParams = {
    trace?: string;
    from?: string;
    account?: string;
    query?: string;
  };

  const [form, { Form, Field }] = createForm<QueryParams>({
    initialValues: {
      trace: searchParams.trace as string | undefined,
      from: searchParams.from as string | undefined,
      account: searchParams.account as string | undefined,
      query: searchParams.query as string | undefined,
    },
  });

  createEffect(() => {
    if (searchParams.trace) {
      setValue(form, "trace", searchParams.trace as string);
    } else {
      setValue(form, "trace", "");
    }
    if (searchParams.from) {
      setValue(form, "from", searchParams.from as string);
    } else {
      setValue(form, "from", "");
    }
    if (searchParams.account) {
      setValue(form, "account", searchParams.account as string);
    } else {
      setValue(form, "account", "");
    }
    if (searchParams.query) {
      setValue(form, "query", searchParams.query as string);
    } else {
      setValue(form, "query", "");
    }
  });

  return (
    <>
      <Title page={t("platform.logs.title")} route="/admin/logs" />
      <div class="flex-1 flex flex-col">
        <div class="sticky top-16 h-26 z-20 backdrop-blur-sm border-b border-b-layer-content/10 flex flex-col space-y-2">
          <div class="h-12 flex flex-row space-x-2 items-end px-3">
            <h1 class="h-8 flex-1 font-bold flex flex-row space-x-2 items-center pl-2">
              <span class="shrink-0 icon-[fluent--code-20-regular] w-5 h-5" />
              <span>{t("platform.logs.title")}</span>
            </h1>
            <h2 class="h-8 items-center flex text-success">LEVEL=</h2>
            <Select
              class="w-36"
              placeholder="LEVEL"
              size="sm"
              items={[
                { label: "ALL", value: "" },
                { label: "DEBUG", value: "DEBUG" },
                { label: "INFO", value: "INFO" },
                { label: "WARN", value: "WARN" },
                { label: "ERROR", value: "ERROR" },
              ]}
              value={[(searchParams.level as string) ?? ""]}
              onValueChange={(val) => setSearchParams({ level: val.value.at(0) })}
            />
            <h2 class="h-8 items-center flex text-success">&nbsp;&nbsp;SIZE=</h2>
            <Select
              class="w-36"
              placeholder="LIMIT"
              size="sm"
              items={[
                { label: "10", value: "10" },
                { label: "20", value: "20" },
                { label: "50", value: "50" },
                { label: "100", value: "100" },
                { label: "1000", value: "1000" },
              ]}
              value={[(searchParams.limit as string) ?? "20"]}
              onValueChange={(val) => setSearchParams({ limit: val.value.at(0) })}
            />
          </div>
          <Form
            class="h-12 flex flex-row space-x-2 items-start px-3"
            onSubmit={(values) => {
              setSearchParams({
                trace: values.trace || undefined,
                from: values.from || undefined,
                account: values.account || undefined,
                query: values.query || undefined,
              });
            }}
          >
            <Field name="query">
              {(field) => (
                <LogQueryInput
                  class="flex-1"
                  value={(field.value as string) ?? ""}
                  onChange={(v) => setValue(form, "query", v)}
                  placeholder={t("platform.logs.assist.placeholder")}
                />
              )}
            </Field>
            <Field name="trace">
              {(field, props) => (
                <Input
                  size="sm"
                  class="w-48"
                  icon={<span class="icon-[fluent--flash-16-regular]" />}
                  {...props}
                  noLabel
                  value={field.value}
                  error={field.error}
                  placeholder="Trace ID"
                  disabled={!!getValue(form, "query")}
                />
              )}
            </Field>
            <Field name="account">
              {(field, props) => (
                <Input
                  size="sm"
                  class="w-48"
                  icon={<span class="icon-[fluent--person-16-regular]" />}
                  {...props}
                  noLabel
                  value={field.value}
                  error={field.error}
                  placeholder="Account"
                  disabled={!!getValue(form, "query")}
                />
              )}
            </Field>
            <Field name="from">
              {(field, props) => (
                <Input
                  size="sm"
                  class="w-48"
                  icon={<span class="icon-[fluent--location-16-regular]" />}
                  {...props}
                  noLabel
                  value={field.value}
                  error={field.error}
                  placeholder="IP"
                  disabled={!!getValue(form, "query")}
                />
              )}
            </Field>
            <Button size="sm" type="submit" square level="primary">
              <span class="icon-[fluent--search-16-regular]" />
            </Button>
            <Button
              type="button"
              square
              size="sm"
              level={enableTimer() ? "error" : "success"}
              onClick={() => setEnableTimer(!enableTimer())}
            >
              <span class={clsx(enableTimer() ? "icon-[fluent--stop-16-regular]" : "icon-[fluent--play-16-regular]")} />
            </Button>
          </Form>
        </div>
        <div class="inline-flex flex-row items-center flex-wrap p-3 lg:p-6 pb-0!">
          <For each={logFiles.data}>
            {(file) => (
              <DownloadButton
                class="m-1 overflow-hidden"
                size="sm"
                url={`${api_root}/platform/logs`}
                searchParams={{ file }}
                withFileName
                displayName={file.replace("ret2shell.", "").replace(".log", "")}
                file={file}
                icon="icon-[fluent--folder-zip-16-regular]"
              />
            )}
          </For>
        </div>
        <div class="flex-1 flex flex-col p-3 lg:p-6">
          <For each={logs.data}>
            {(log) => (
              <div
                class={clsx(
                  "group flex flex-col h-auto",
                  "items-center border-t border-t-layer-content/20 overflow-hidden min-w-0 pb-2 space-y-1"
                )}
              >
                <div class="px-2 py-1 w-full grid grid-cols-[repeat(3,auto)_1fr] bg-layer-content/5">
                  <span class={clsx("w-16 mr-2 inline-block", getColor(log.level))}>{log.level}</span>
                  <span class="mr-2 text-success font-bold" title={log.target}>
                    {log.target}
                  </span>
                  <span class={clsx("truncate", "text-primary")}>
                    {(log["span.method"] as string) && <span>{log["span.method"] as string}&nbsp;</span>}
                    {(log["span.uri"] as string) && <span>{log["span.uri"] as string}&nbsp;</span>}
                  </span>
                  <span class="text-right font-bold ml-2 whitespace-nowrap">
                    {(log["span.user-account"] as string) && (
                      <span class="font-bold mr-2">
                        <span class="opacity-60 italic">user=</span>
                        <A href={`/admin/logs?account=${log["span.user-account"]}`} class="hover:underline mr-1">
                          {log["span.user-account"] as string}
                        </A>
                        <A href={`/admin/users?user=${log["span.user-id"]}`} class="hover:text-primary">
                          <span class="icon-[fluent--open-16-regular] w-4 h-4" />
                        </A>
                      </span>
                    )}
                    {(log["span.from"] as string) && (
                      <>
                        <span class="opacity-60 italic">&nbsp;from=</span>
                        <A href={`/admin/logs?from=${log["span.from"] as string}`} class="hover:underline mr-1">
                          {log["span.from"] as string}
                        </A>
                        <A href={`/admin/users?filter=${log["span.from"]}`} class="hover:text-primary">
                          <span class="icon-[fluent--open-16-regular] w-4 h-4" />
                        </A>
                      </>
                    )}
                    {(log["span.trace"] as string) && (
                      <>
                        <span class="opacity-60 italic">&nbsp;trace=</span>
                        <A
                          href={`/admin/logs?trace=${log["span.trace"] as string}`}
                          class="hover:underline mr-1"
                          title={log["span.trace"] as string}
                        >
                          [...]
                        </A>
                      </>
                    )}
                    <span class="opacity-60 italic">&nbsp;at=</span>
                    <Switch fallback={time(log._time, "HH:mm:ss")}>
                      <Match when={matches.xl}>{time(log._time, "yyyy-MM-dd HH:mm:ss")}</Match>
                      <Match when={matches.lg}>{time(log._time, "MM-dd HH:mm:ss")}</Match>
                      <Match when={matches.md}>{time(log._time, "MM-dd HH:mm:ss")}</Match>
                      <Match when={matches.sm}>{time(log._time, "MM-dd HH:mm:ss")}</Match>
                    </Switch>
                  </span>
                </div>
                <div class="grid grid-cols-[1fr] group-hover:block w-full px-2">
                  <span class={clsx("truncate break-words group-hover:whitespace-normal")}>
                    {LogField(log)}
                    {DataSpanField(log)}
                  </span>
                </div>
                <div class="block w-full px-2">
                  <span class={clsx("break-words whitespace-normal")}>
                    <span>{log._msg}</span>
                  </span>
                </div>
              </div>
            )}
          </For>
          <Show when={logs.isLoading || logFiles.isLoading}>
            <div class="h-8 flex flex-row items-center space-x-2 border-b border-b-layer-content/10 overflow-hidden min-w-0">
              <LoadingTips />
            </div>
          </Show>
          <Show when={logs.data?.length === 0}>
            <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
              <span class="shrink-0 icon-[fluent--code-20-regular] w-24 h-24" />
              <span>{t("platform.logs.notStreaming")}</span>
            </div>
          </Show>
          <div ref={bottomDiv!} />
        </div>
      </div>
    </>
  );
}
