import { handleHttpError } from "@api";
import { getUser, getUserList, updateUser } from "@api/user";
import { mediaPath } from "@lib/utils/media";
import { type User, permissionToIcon } from "@models/user";
import { createBreakpoints } from "@solid-primitives/media";
import { A, useSearchParams } from "@solidjs/router";
import { accountStore, refreshInstitutes } from "@storage/account";
import { Title } from "@storage/header";
import { breakpoints, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Avatar from "@widgets/avatar";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Select from "@widgets/select";
import Tag from "@widgets/tag";
import clsx from "clsx";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount, untrack } from "solid-js";
import Form from "./_blocks/form";

type OrderType = "id" | "account" | "institute_id" | "registered_at";

function UserList() {
  const [users, setUsers] = createSignal([] as User[]);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = createMemo(() => (searchParams.page && Number.parseInt(searchParams.page as string)) || 1);
  const pageSize = 15;
  const [loading, setLoading] = createSignal(true);
  const [total, setTotal] = createSignal(0);
  const filter = createMemo(() => (searchParams.filter as string) || null);
  const order = createMemo(() => (searchParams.order as string) || "id");
  const instituteId = createMemo(
    () => (searchParams.institute && Number.parseInt(searchParams.institute as string)) || null
  );
  async function refreshUsers() {
    setLoading(true);
    try {
      const resp = await getUserList(
        page(),
        pageSize,
        order() || "id",
        filter() ?? undefined,
        instituteId() ?? undefined
      );
      setUsers(resp[0]);
      setTotal(resp[1]);
    } catch (err) {
      handleHttpError(err as Error, t("user.errors.fetchList.title")!);
    }
    setLoading(false);
  }

  const institutesSelect = createMemo(() => {
    return accountStore.institutes.map((i) => ({
      value: i.id.toString(),
      label: i.name,
      icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
    }));
  });
  createEffect(() => {
    if (page()) {
      untrack(refreshUsers);
    }
  });
  const matches = createBreakpoints(breakpoints);
  return (
    <div class="w-full p-3 lg:p-6 flex flex-col flex-1">
      <h3 class="min-h-12 flex flex-wrap justify-end py-2 gap-y-2 items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <div class="flex flex-row items-center space-x-2">
          <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
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
              label: t("account.form.account.label")!,
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
            {
              value: "institute_id",
              label: t("account.form.institute.label")!,
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
            {
              value: "registered_at",
              label: t("account.form.registeredAt.label")!,
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
          ]}
          onValueChange={(v) => {
            setSearchParams({ order: (v.value.at(0) || "id") as OrderType });
            setTimeout(refreshUsers, 100);
          }}
          value={order() ? [order()!] : undefined}
        />
        <Select
          class="flex-1 max-w-64 min-w-48"
          size="sm"
          placeholder={t("account.form.institute.label")!}
          items={institutesSelect()}
          onValueChange={(v) => {
            setSearchParams({ institute: (v.value.at(0) && Number.parseInt(v.value.at(0)!)) || null });
            setTimeout(refreshUsers, 100);
          }}
          value={instituteId() ? [instituteId()!.toString()] : undefined}
        />
        <Input
          class="w-80"
          size="sm"
          icon={<span class="icon-[fluent--filter-16-regular] w-5 h-5" />}
          value={filter() ?? ""}
          placeholder={t("user.filter")}
          onChange={(e) => {
            setSearchParams({ filter: e.target.value || undefined, page: null });
            setTimeout(refreshUsers, 100);
          }}
        />
      </h3>
      <Show when={loading()}>
        <div class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5">
          <LoadingTips />
        </div>
      </Show>
      <div class="grid grid-cols-1">
        <For each={users()}>
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
                      {accountStore.institutes.find((v) => v.id === user.institute_id)?.name}
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
        count={total()}
        pageSize={pageSize}
        page={page()}
        onPageChange={(page) => setSearchParams({ page: page.page })}
      />
    </div>
  );
}

export default function () {
  const [searchParams] = useSearchParams();
  const inEdit = createMemo(() => (searchParams.user && Number.parseInt(searchParams.user as string)) || null);
  const [user, setUser] = createSignal(null as User | null);
  createEffect(() => {
    if (inEdit()) {
      untrack(async () => {
        try {
          const resp = await getUser(inEdit()!);
          setUser(resp);
        } catch (err) {
          handleHttpError(err as Error, t("user.errors.fetch.title")!);
        }
      });
    } else {
      setUser(null);
    }
  });

  const [updatingUser, setUpdatingUser] = createSignal(false);
  async function handleUpdateUser(user: User) {
    setUpdatingUser(true);
    try {
      await updateUser(user);
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
      setUser(user);
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail")!);
    }
    setUpdatingUser(false);
  }

  onMount(() => {
    refreshInstitutes();
  });
  return (
    <>
      <Title page={t("user.list.title")} route="/admin/users" />
      <div class="flex-1 flex flex-col items-center">
        <Show when={inEdit()} fallback={<UserList />}>
          <Form editSource={user() || undefined} onDone={handleUpdateUser} loading={updatingUser()} />
        </Show>
      </div>
    </>
  );
}
