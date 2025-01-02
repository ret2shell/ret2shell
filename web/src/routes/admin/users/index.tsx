import { getUser, getUserList, updateUser } from "@api/user";
import { mediaPath } from "@lib/utils/media";
import { type User, permissionToIcon } from "@models/user";
import { A, useSearchParams } from "@solidjs/router";
import { accountStore, refreshInstitutes } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Avatar from "@widgets/avatar";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Pagination from "@widgets/pagination";
import Select from "@widgets/select";
import Tag from "@widgets/tag";
import { For, Show, createEffect, createMemo, createSignal, onMount, untrack } from "solid-js";
import Form from "./_blocks/form";
import { handleHttpError } from "@api";

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
      handleHttpError(err as Error, t("admin.users.fetchFailed")!);
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
  return (
    <div class="w-full p-3 lg:p-6 flex flex-col flex-1">
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
        <span class="flex-1 text-start">{t("admin.users.title")}</span>
        <Select
          class="flex-1 max-w-48 min-w-0"
          size="sm"
          placeholder={t("admin.users.sortBy")}
          items={[
            {
              value: "id",
              label: "ID",
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
            {
              value: "account",
              label: t("admin.users.account")!,
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
            {
              value: "institute_id",
              label: t("admin.users.institute")!,
              icon: "icon-[fluent--number-symbol-24-regular] w-5 h-5",
            },
            {
              value: "registered_at",
              label: t("admin.users.registeredAt")!,
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
          class="flex-1 max-w-64 min-w-0"
          size="sm"
          placeholder={t("admin.users.selectInstitute")}
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
          value={filter() || undefined}
          placeholder={t("admin.users.filterPlaceholder")}
          onChange={(e) => {
            setSearchParams({ filter: e.target.value });
            setTimeout(refreshUsers, 100);
          }}
        />
      </h3>
      <Show when={loading()}>
        <div class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5">
          <LoadingTips />
        </div>
      </Show>
      <div class="flex-1 flex flex-col">
        <For each={users()}>
          {(user) => (
            <A
              class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-4 px-2 hover:bg-layer-content/5 cursor-pointer"
              href={`/admin/users?user=${user.id}`}
            >
              <Avatar
                class="w-6 h-6"
                src={(user.avatar && mediaPath(user.avatar)) || undefined}
                fallback={user.account || undefined}
              />
              <span class="flex-1 truncate text-start">
                <span>{user.nickname}</span>
                <span class="font-normal px-2 opacity-60">
                  {user.account}#{user.id.toString(16).padStart(6, "0")}
                </span>
              </span>
              <For each={user.permissions}>{(permission) => <span class={permissionToIcon(permission)} />}</For>
              <Show when={user.institute_id}>
                <Tag level="info">
                  <span>{accountStore.institutes.find((v) => v.id === user.institute_id)?.name}</span>
                </Tag>
              </Show>
              <span class="font-normal">{user.registered_at.toFormat("yyyy-MM-dd HH:mm:ss")}</span>
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
          handleHttpError(err as Error, t("admin.users.fetchUserFailed")!);
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
        description: t("form.saveSuccess")!,
        duration: 5000,
      });
      setUser(user);
    } catch (err) {
      handleHttpError(err as Error, t("form.saveFailed")!);
    }
    setUpdatingUser(false);
  }

  onMount(() => {
    refreshInstitutes();
  });
  return (
    <>
      <Title page={t("admin.users.title")} route="/admin/users" />
      <div class="flex-1 flex flex-col items-center">
        <Show when={inEdit()} fallback={<UserList />}>
          <Form editSource={user() || undefined} onDone={handleUpdateUser} loading={updatingUser()} />
        </Show>
      </div>
    </>
  );
}
