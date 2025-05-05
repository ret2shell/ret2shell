import { handleHttpError } from "@api";
import { uploadMedia } from "@api/media";
import { deleteUser, getUserIpList, getUserOAuthList } from "@api/user";
import { mediaPath } from "@lib/utils/media";
import type { Ip } from "@models/ip";
import type { OAuth } from "@models/oauth";
import { Permission, type User, permissionToString } from "@models/user";
import { createForm, email, getValue, required, setValue, setValues } from "@modular-forms/solid";
import { A } from "@solidjs/router";
import { accountStore } from "@storage/account";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Checkbox from "@widgets/checkbox";
import Editor from "@widgets/editor";
import Input from "@widgets/input";
import Link from "@widgets/link";
import Popover from "@widgets/popover";
import Select from "@widgets/select";
import Tag from "@widgets/tag";
import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";

export type UserForm = {
  account: string;
  nickname: string;
  email: string;
  avatar: string;
  description: string;
  institute_id?: string;
  hidden: boolean;
  banned: boolean;
  permBasic: boolean;
  permVerified: boolean;
  permCalendar: boolean;
  permWiki: boolean;
  permBulletin: boolean;
  permGame: boolean;
  permHost: boolean;
  permUser: boolean;
  permStat: boolean;
  permDevOps: boolean;
};

export default function (compProps: {
  onDone?: (result: User) => void;
  editSource?: User;
  loading: boolean;
}) {
  const [deleteConfirmValue, setDeleteConfirmValue] = createSignal("");
  const [deletLoading, setDeleteLoading] = createSignal(false);
  const [form, { Form, Field }] = createForm<UserForm>();
  createEffect(() => {
    if (compProps.editSource) {
      untrack(async () => {
        setValues(form, {
          account: compProps.editSource?.account || "",
          nickname: compProps.editSource?.nickname || "",
          email: compProps.editSource?.email || "",
          avatar: compProps.editSource?.avatar || "",
          description: compProps.editSource?.description || "",
          institute_id: compProps.editSource?.institute_id?.toString() || undefined,
          hidden: compProps.editSource?.hidden || false,
          banned: compProps.editSource?.banned || false,
          permBasic: compProps.editSource?.permissions.includes(Permission.Basic) || false,
          permVerified: compProps.editSource?.permissions.includes(Permission.Verified) || false,
          permCalendar: compProps.editSource?.permissions.includes(Permission.Calendar) || false,
          permWiki: compProps.editSource?.permissions.includes(Permission.Wiki) || false,
          permBulletin: compProps.editSource?.permissions.includes(Permission.Bulletin) || false,
          permGame: compProps.editSource?.permissions.includes(Permission.Game) || false,
          permHost: compProps.editSource?.permissions.includes(Permission.Host) || false,
          permUser: compProps.editSource?.permissions.includes(Permission.User) || false,
          permStat: compProps.editSource?.permissions.includes(Permission.Statistics) || false,
          permDevOps: compProps.editSource?.permissions.includes(Permission.DevOps) || false,
        });
        setAvatarSet(!!compProps.editSource?.avatar);
        try {
          const resp = await getUserIpList(compProps.editSource!.id);
          setIps(resp);
        } catch (err) {
          handleHttpError(err as Error, t("user.errors.fetchIpList.title")!);
        }
        try {
          const resp = await getUserOAuthList(compProps.editSource!.id);
          setOauthes(resp);
        } catch (err) {
          handleHttpError(err as Error, t("user.errors.fetchOAuth.title")!);
        }
      });
    }
  });
  const [avatarFile, setAvatarFile] = createSignal(null as File | null);
  const [avatarSet, setAvatarSet] = createSignal(false);
  const [avatarUploading, setAvatarUploading] = createSignal(false);
  const [ips, setIps] = createSignal<Ip[]>([]);
  const [oauths, setOauthes] = createSignal([] as OAuth[]);
  let avatarInput: HTMLInputElement;
  function handleSelectAvatar() {
    avatarInput!.click();
  }
  function handleSelectedAvatar(event: Event) {
    if (
      event.target &&
      (event.target as HTMLInputElement).files &&
      (event.target as HTMLInputElement).files!.length > 0
    ) {
      setAvatarFile((event.target as HTMLInputElement).files![0]);
      handleUploadAvatar();
    }
  }
  async function handleUploadAvatar() {
    if (avatarFile()) {
      setAvatarUploading(true);
      try {
        const resp = await uploadMedia(avatarFile()!, false);
        setValue(form, "avatar", resp.hash);
        setAvatarSet(true);
      } catch (err) {
        handleHttpError(err as Error, t("general.actions.upload.status.fail")!);
      }
      setAvatarUploading(false);
    }
  }
  async function handleDeleteUser() {
    try {
      setDeleteLoading(true);
      await deleteUser(compProps.editSource!.id);
      // compProps.onDone?.(compProps.editSource!);
      setDeleteConfirmValue("");
      setDeleteLoading(false);
      addToast({
        level: "success",
        description: t("general.actions.delete.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.delete.status.fail")!);
    }
  }

  const institutesSelect = createMemo(() => {
    return accountStore.institutes.map((i) => ({
      value: i.id.toString(),
      label: i.name,
      icon: "icon-[fluent--hat-graduation-20-regular] w-5 h-5",
    }));
  });

  function onSubmit(result: UserForm) {
    const permissions: Permission[] = [];
    if (result.permBasic) permissions.push(Permission.Basic);
    if (result.permVerified) permissions.push(Permission.Verified);
    if (result.permCalendar) permissions.push(Permission.Calendar);
    if (result.permWiki) permissions.push(Permission.Wiki);
    if (result.permBulletin) permissions.push(Permission.Bulletin);
    if (result.permGame) permissions.push(Permission.Game);
    if (result.permHost) permissions.push(Permission.Host);
    if (result.permUser) permissions.push(Permission.User);
    if (result.permStat) permissions.push(Permission.Statistics);
    if (result.permDevOps) permissions.push(Permission.DevOps);

    compProps.onDone?.({
      ...compProps.editSource,
      account: result.account,
      nickname: result.nickname,
      email: result.email,
      avatar: result.avatar,
      description: result.description,
      institute_id: Number.parseInt(result.institute_id || "NONE") || null,
      hidden: result.hidden,
      banned: result.banned,
      permissions,
    } as User);
  }
  return (
    <div class="w-full p-3 lg:p-6 flex flex-col flex-1 space-y-2 items-center">
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2 w-full">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
        <span class="flex-1 text-start">{t("user.management.title")}</span>
        <Link href={`/users/${compProps.editSource?.id}`} size="sm">
          {t("user.management.goToUserDetailPage")}
        </Link>
        <Link href="/admin/users" size="sm">
          {t("general.actions.back.title")}
        </Link>
        <Popover size="sm" level="error" btnContent={<span>{t("general.actions.delete.title")}</span>}>
          <Card contentClass="p-4 flex flex-col space-y-2 items-stretch max-w-lg">
            {/* <span class="icon-[fluent--warning-24-filled] text-error w-6 h-6 md:w-12 md:h-12" /> */}
            <Card level="warning" contentClass="p-2 flex space-x-2 items-center">
              <span class="icon-[fluent--warning-20-filled] w-5 h-5 text-warning shrink-0" />
              <p class="font-bold">{t("general.actions.delete.message")}</p>
            </Card>
            <div class="flex flex-col space-x-2">
              <span class="font-bold text-error">
                {t("user.management.confirmDelete", {
                  name: `${compProps.editSource?.account}`,
                })}
              </span>
            </div>
            <Input
              size="sm"
              value={deleteConfirmValue()}
              icon={<span class="icon-[fluent--person-20-regular] w-5 h-5" />}
              extraBtn={
                <Button
                  size="sm"
                  level="warning"
                  class="rounded-l-none"
                  disabled={deleteConfirmValue() !== compProps.editSource?.account || deletLoading()}
                  loading={deletLoading()}
                  onClick={handleDeleteUser}
                >
                  <span>{t("general.actions.delete.title")}</span>
                </Button>
              }
              onInput={(e) => setDeleteConfirmValue(e.currentTarget.value)}
            />
          </Card>
        </Popover>
      </h3>
      <Form onSubmit={onSubmit} class="flex flex-col w-full max-w-5xl space-y-2 relative">
        <div class="flex flex-row space-x-4 items-center">
          <div class="flex flex-col space-y-2 flex-1">
            <div class="flex flex-row space-x-2">
              <Field name="account" validate={[required(t("account.form.account.required")!)]}>
                {(field, props) => (
                  <Input
                    class="flex-1"
                    icon={<span class="icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
                    title={t("account.form.account.label")}
                    placeholder={t("account.form.account.placeholder")}
                    {...props}
                    value={field.value}
                    error={field.error}
                    required
                  />
                )}
              </Field>
              <Field name="nickname" validate={[required(t("account.form.nickname.required")!)]}>
                {(field, props) => (
                  <Input
                    class="flex-1"
                    icon={<span class="icon-[fluent--emoji-20-regular] w-5 h-5" />}
                    title={t("account.form.nickname.label")}
                    placeholder={t("account.form.nickname.placeholder")}
                    {...props}
                    value={field.value}
                    error={field.error}
                    required
                  />
                )}
              </Field>
            </div>
            <div class="flex flex-row space-x-2">
              <Field
                name="email"
                validate={[required(t("account.form.email.required")!), email(t("account.form.email.invalid")!)]}
              >
                {(field, props) => (
                  <Input
                    class="flex-1 min-w-0"
                    icon={<span class="icon-[fluent--mail-20-regular] w-5 h-5" />}
                    title={t("account.form.email.label")}
                    placeholder={t("account.form.email.placeholder")}
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
                    label={t("account.form.institute.label")}
                    placeholder={t("account.form.institute.placeholder")}
                    items={institutesSelect()}
                    name={field.name}
                    error={field.error}
                    inputProps={props}
                    // onValueChange={(v) => {
                    //   setValue(form, "institute_id", v.value.at(0) ? Number.parseInt(v.value.at(0)!) : undefined);
                    // }}
                    value={field.value ? [field.value.toString()] : undefined}
                  />
                )}
              </Field>
            </div>
          </div>
          <Field name="avatar">
            {(field, props) => (
              <Avatar
                class="w-28 h-28 relative m-2"
                src={(getValue(form, "avatar") && mediaPath(getValue(form, "avatar")!)) || undefined}
                fallback={getValue(form, "account")}
              >
                <Button
                  loading={avatarUploading()}
                  disabled={avatarUploading()}
                  type="button"
                  class="opacity-0 hover:opacity-100 !bg-layer/80 absolute top-0 left-0 w-full h-full"
                  onClick={() => {
                    if (avatarSet()) {
                      setAvatarSet(false);
                      setAvatarFile(null);
                      setValue(form, "avatar", "");
                    } else {
                      handleSelectAvatar();
                    }
                  }}
                >
                  <input
                    type="file"
                    class="hidden"
                    id={field.name}
                    {...props}
                    ref={avatarInput!}
                    onChange={handleSelectedAvatar}
                  />
                  <Show
                    when={compProps.editSource?.avatar}
                    fallback={<span class="icon-[fluent--cloud-arrow-up-20-regular] w-5 h-5" />}
                  >
                    <span class="icon-[fluent--delete-20-regular] w-5 h-5 text-error" />
                  </Show>
                </Button>
              </Avatar>
            )}
          </Field>
        </div>
        <Field name="description">
          {(field) => (
            <Editor
              form={form}
              lineNumbers
              class="h-80"
              lang="markdown"
              placeholder="MARKDOWN"
              title={t("account.form.description.label")!}
              name="description"
              value={field.value}
              error={field.error}
            />
          )}
        </Field>
        <div class="flex flex-row flex-wrap items-start">
          <Field name="hidden" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{t("account.form.hidden.label")}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="banned" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{t("account.form.banned.label")}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permBasic" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.Basic)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permVerified" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.Verified)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permCalendar" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.Calendar)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permWiki" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.Wiki)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permBulletin" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.Bulletin)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permGame" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.Game)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permHost" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.Host)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permUser" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.User)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permStat" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.Statistics)}</span>
              </Checkbox>
            )}
          </Field>
          <Field name="permDevOps" type="boolean">
            {(field, props) => (
              <Checkbox class="flex-none m-1" inputProps={props} checked={field.value ?? false} error={field.error}>
                <span class="flex-1 text-start truncate">{permissionToString(Permission.DevOps)}</span>
              </Checkbox>
            )}
          </Field>
        </div>
        <Button type="submit" level="primary" class="!mt-4" loading={compProps.loading} disabled={compProps.loading}>
          {t("general.actions.save.title")}
        </Button>
      </Form>
      <div class="w-full flex flex-col">
        <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2 w-full">
          <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
          <span class="flex-1 text-start">{t("account.form.oauths.label")}</span>
        </h3>
        <For each={oauths()}>
          {(oauth) => (
            <div class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2 w-full px-2">
              <span class="flex-1 text-start text-info">Adapter: {oauth.provider}</span>
              <span>{JSON.stringify(oauth.data)}</span>
            </div>
          )}
        </For>
      </div>
      <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2 w-full">
        <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
        <span class="flex-1 text-start">{t("account.form.ips.label")}</span>
      </h3>
      <div class="flex flex-row flex-wrap">
        <For each={ips()}>
          {(ip) => (
            <Tag level="info" class="m-1">
              <A href={`/admin/users?filter=${ip.address}`}>{ip.address}</A>
            </Tag>
          )}
        </For>
      </div>
    </div>
  );
}
