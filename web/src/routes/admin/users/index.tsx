import { useInstitutes } from "@api/account";
import { useUpdateUserMutation, useUser, useUsers } from "@api/user";
import { mediaPath } from "@lib/utils/media";
import { permissionToIcon } from "@models/user";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useSearchParams } from "@solidjs/router";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import Avatar from "@widgets/avatar";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Select from "@widgets/select";
import Tag from "@widgets/tag";
import clsx from "clsx";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import Form from "./_blocks/form";

type OrderType = "id" | "account" | "institute_id" | "registered_at";

function UserList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string, 10)) || 1);
  const pageSize = 15;
  const filter = createMemo(() => (searchParams.filter as string) || null);
  const order = createMemo(() => (searchParams.order as string) || "id");
  const instituteId = createMemo(
    () => (searchParams.institute && Number.parseInt(searchParams.institute as string, 10)) || null
  );
  const users = useUsers({
    page: () => page(),
    page_size: () => pageSize,
    order: () => (searchParams.order as OrderType) || "id",
    filter,
    institute_id: instituteId,
  });
  const institutes = useInstitutes();
  const institutesSelect = createMemo(() => {
    return (
      institutes.data?.map((i) => ({
        value: i.id.toString(),
        label: i.name,
        icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
      })) ?? []
    );
  });

  const matches = createBreakpoints(breakpoints);
  return (
    <div class="w-full p-3 lg:p-6 flex flex-col flex-1">
      <h3 class="min-h-12 flex flex-wrap justify-end py-2 gap-y-2 items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <div class="flex flex-row items-center space-x-2">
          <span class="shrink-0 icon-[fluent--settings-20-regular] w-5 h-5" />
          <span class="flex-1 text-start">{t("user.list.title")}</span>
        </div>
        <span class="flex-1" />
        <Select
          class="flex-1 max-w-48 min-w-32"
          size="sm"
          placeholder={t("user.sortBy")}
          items={[
            {
              value: "id",
              label: "ID",
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
            {
              value: "account",
              label: t("account.form.account.label"),
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
            {
              value: "institute_id",
              label: t("account.form.institute.label"),
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
            {
              value: "registered_at",
              label: t("account.form.registeredAt.label"),
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
          ]}
          onValueChange={(v) => {
            setSearchParams({ order: (v.value.at(0) || "id") as OrderType });
          }}
          value={order() ? [order()!] : undefined}
        />
        <Select
          class="flex-1 max-w-64 min-w-48"
          size="sm"
          placeholder={t("account.form.institute.label")}
          items={institutesSelect()}
          onValueChange={(v) => {
            setSearchParams({ institute: (v.value.at(0) && Number.parseInt(v.value.at(0)!, 10)) || null });
          }}
          value={instituteId() ? [instituteId()!.toString()] : undefined}
        />
        <Input
          class="w-80"
          size="sm"
          icon={<span class="shrink-0 icon-[fluent--filter-16-regular] w-5 h-5" />}
          value={filter() ?? ""}
          placeholder={t("user.filter")}
          onChange={(e) => {
            setSearchParams({ filter: e.target.value || undefined, page: null });
          }}
        />
      </h3>
      <Show when={users.isLoading}>
        <div class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5">
          <LoadingTips />
        </div>
      </Show>
      <div class="grid grid-cols-1">
        <For each={users.data?.[0]}>
          {(user) => (
            <A
              class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5 cursor-pointer"
              href={`/admin/users?user=${user.id}`}
            >
              <Avatar
                class="w-6 h-6 shrink-0"
                src={(user.avatar && mediaPath(user.avatar)) || undefined}
                fallback={user.account || undefined}
              />
              <span class="flex text-start truncate">
                <span class="flex-1 min-w-16 truncate">
                  <span>{user.nickname}</span>
                  <span class="font-normal px-2 opacity-60">
                    {user.account}#{user.id.toString(16).padStart(6, "0")}
                  </span>
                </span>
              </span>
              <span class="flex-1" />
              <span class="flex flex-row items-center justify-end space-x-4 overflow-auto">
                <For each={user.permissions}>
                  {(permission) => <span class={clsx(permissionToIcon(permission), "shrink-0")} />}
                </For>
                <Show when={user.institute_id}>
                  <Tag class="min-w-16" level="info">
                    <span class="flex-1 truncate">
                      {institutes.data?.find((v) => v.id === user.institute_id)?.name}
                    </span>
                  </Tag>
                </Show>
              </span>
              <span class="font-normal whitespace-nowrap">
                <Switch fallback={user.registered_at.toFormat("MM-dd HH:mm")}>
                  <Match when={matches.lg}>{user.registered_at.toFormat("yyyy-MM-dd HH:mm:ss")}</Match>
                  <Match when={matches.md}>{user.registered_at.toFormat("MM-dd HH:mm:ss")}</Match>
                </Switch>
              </span>
            </A>
          )}
        </For>
      </div>
      <Pagination
        class="p-6 lg:p-9"
        count={users.data?.[1] || 0}
        pageSize={pageSize}
        page={page()}
        onPageChange={(page) => setSearchParams({ page: page.page })}
      />
    </div>
  );
}

export default function () {
  const [searchParams] = useSearchParams();
  const inEdit = createMemo(() => (searchParams.user && Number.parseInt(searchParams.user as string, 10)) || null);
  const user = useUser({ id: () => inEdit()!, enabled: () => Boolean(inEdit()) });
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string, 10)) || 1);
  const pageSize = 15;
  const filter = createMemo(() => (searchParams.filter as string) || null);
  const instituteId = createMemo(
    () => (searchParams.institute && Number.parseInt(searchParams.institute as string, 10)) || null
  );
  const users = useUsers({
    page: () => page(),
    page_size: () => pageSize,
    order: () => (searchParams.order as OrderType) || "id",
    filter,
    institute_id: instituteId,
  });
  const mutation = useUpdateUserMutation();

  async function onSubmit(v: Parameters<typeof mutation.mutateAsync>[0]) {
    await mutation.mutateAsync(v);
    await Promise.all([user.refetch(), users.refetch()]);
  }
  return (
    <>
      <Title page={t("user.list.title")} route="/admin/users" />
      <div class="flex-1 flex flex-col items-center">
        <Show when={inEdit()} fallback={<UserList />}>
          <Form editSource={user.data} onDone={onSubmit} loading={mutation.isPending} />
        </Show>
      </div>
    </>
  );
}
