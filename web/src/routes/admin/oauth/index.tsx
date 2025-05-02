import { handleHttpError } from "@api";
import {
  createInstitute,
  createOAuthProvider,
  deleteInstitute,
  deleteOAuthProvider,
  getOAuthProviders,
  updateInstitute,
  updateOAuthProvider,
} from "@api/account";
import { mediaPath } from "@lib/utils/media";
import type { Institute } from "@models/institute";
import type { OAuthProvider } from "@models/oauth-provider";
import { accountStore, refreshInstitutes } from "@storage/account";
import { Title } from "@storage/header";
import { t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Dialog from "@widgets/dialog";
import Popover from "@widgets/popover";
import type { HTTPError } from "ky";
import { For, Show, createSignal, onMount } from "solid-js";
import InstituteForm from "./_blocks/institute-form";
import ProviderForm from "./_blocks/provider-form";

export default function () {
  const [loading, setLoading] = createSignal(true);
  const [oauthServices, setOAuthServices] = createSignal([] as OAuthProvider[]);
  onMount(async () => {
    await refreshProviders();
    await refreshInstitutes();
    setLoading(false);
  });
  async function handleUpdateInstitute(result: Institute) {
    setLoading(true);
    try {
      await updateInstitute(result);
      refreshInstitutes();
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("general.actions.save.status.fail")!);
    }
    setLoading(false);
  }
  async function handleCreateInstitute(result: Institute) {
    setLoading(true);
    try {
      await createInstitute(result);
      addToast({
        level: "success",
        description: t("general.actions.create.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("general.actions.create.status.fail")!);
    }
    setTimeout(async () => {
      await refreshInstitutes();
      setInstituteFormOpen(false);
    }, 500);
    setLoading(false);
  }
  async function handleDeleteInstitute(result: Institute) {
    setLoading(true);
    try {
      await deleteInstitute(result.id);
      refreshInstitutes();
      addToast({
        level: "success",
        description: t("general.actions.delete.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("general.actions.delete.status.fail")!);
    }
    setLoading(false);
  }

  async function refreshProviders() {
    try {
      setOAuthServices(await getOAuthProviders());
    } catch (err) {
      handleHttpError(err as Error, t("account.oauth.errors.fetchProvider.title")!);
    }
  }

  async function handleCreateProvider(result: OAuthProvider) {
    setLoading(true);
    try {
      createOAuthProvider(result);
      addToast({
        level: "success",
        description: t("general.actions.create.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("general.actions.create.status.fail")!);
    }
    setTimeout(async () => {
      await refreshProviders();
      setProviderFormOpen(false);
    }, 100);
    setLoading(false);
  }

  async function handleUpdateProvider(result: OAuthProvider) {
    setLoading(true);
    try {
      updateOAuthProvider(result.provider, result);
      addToast({
        level: "success",
        description: t("general.actions.save.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("general.actions.save.status.fail")!);
    }
    setTimeout(async () => {
      await refreshProviders();
      setProviderFormOpen(false);
    }, 100);
    setLoading(false);
  }

  async function handleDeleteProvider(result: OAuthProvider) {
    setLoading(true);
    try {
      deleteOAuthProvider(result.provider);
      addToast({
        level: "success",
        description: t("general.actions.delete.status.success")!,
        duration: 5000,
      });
    } catch (err) {
      handleHttpError(err as HTTPError, t("general.actions.delete.status.fail")!);
    }
    setTimeout(async () => {
      await refreshProviders();
      setProviderFormOpen(false);
    }, 100);
    setLoading(false);
  }
  const [providerFormOpen, setProviderFormOpen] = createSignal(false);
  const [instituteFormOpen, setInstituteFormOpen] = createSignal(false);
  return (
    <>
      <Title page={t("oauth.title")} route="/admin/oauth" />
      <div class="flex-1 flex flex-col items-center p-3 lg:p-6">
        <div class="w-full max-w-5xl flex flex-col">
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--settings-20-regular] w-5 h-5" />
            <span class="flex-1 text-start">{t("oauth.title")}</span>
            <Dialog
              level="primary"
              size="sm"
              title={t("general.actions.create.title")}
              btnContent={
                <>
                  <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                  <span>{t("general.actions.create.title")}</span>
                </>
              }
              // onClick={() => setProviderFormOpen(true)}
              open={providerFormOpen()}
              onOpenChange={(detail) => setProviderFormOpen(detail.open)}
            >
              <ProviderForm onDone={handleCreateProvider} loading={loading()} />
            </Dialog>
          </h3>
          <For each={oauthServices()}>
            {(service) => (
              <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2">
                <Avatar src={(service.avatar && mediaPath(service.avatar)) ?? undefined} class="w-5 h-5" />
                <h4 class="font-bold text-start flex-1">
                  <span>{service.name}</span>
                </h4>
                <span class="text-success">{t("oauth.configured")}</span>
                <Dialog
                  ghost
                  size="sm"
                  square
                  title={t("general.actions.edit.title")}
                  btnContent={<span class="icon-[fluent--edit-20-regular] w-5 h-5" />}
                >
                  <ProviderForm editSource={service} onDone={handleUpdateProvider} loading={loading()} />
                </Dialog>
                <Popover
                  size="sm"
                  ghost
                  square
                  title={t("general.actions.delete.title")}
                  btnContent={<span class="icon-[fluent--delete-20-regular] w-5 h-5" />}
                >
                  <Card contentClass="p-2 flex flex-row space-x-2 items-center">
                    <span class="icon-[fluent--warning-20-regular] w-5 h-5 text-error" />
                    <span>{t("general.actions.delete.message")}</span>
                    <Button
                      level="error"
                      size="sm"
                      title={t("general.actions.confirm.title")}
                      onClick={() => handleDeleteProvider(service)}
                      loading={loading()}
                    >
                      <span>{t("general.actions.confirm.title")}</span>
                    </Button>
                  </Card>
                </Popover>
              </div>
            )}
          </For>
          <div class="h-36" />
          <h3 class="h-12 flex items-center border-b border-b-layer-content/10 font-bold space-x-2">
            <span class="icon-[fluent--hat-graduation-20-regular] w-5 h-5" />
            <span class="flex-1 text-start">{t("institute.title")}</span>
            <Dialog
              level="primary"
              size="sm"
              title={t("general.actions.create.title")}
              btnContent={
                <>
                  <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                  <span>{t("general.actions.create.title")}</span>
                </>
              }
              // onClick={() => setInstituteFormOpen(true)}
              onOpenChange={(detail) => setInstituteFormOpen(detail.open)}
              open={instituteFormOpen()}
            >
              <InstituteForm onDone={handleCreateInstitute} loading={loading()} oauthServices={oauthServices()} />
            </Dialog>
          </h3>
          <For each={accountStore.institutes}>
            {(institute) => (
              <div class="h-12 flex items-center border-b border-b-layer-content/10 space-x-2">
                <span class="icon-[fluent--hat-graduation-20-regular] w-5 h-5" />
                <span class="flex-1 text-start">{institute.name}</span>
                <Show
                  when={institute.provider}
                  fallback={<span class="text-warning px-2">{t("institute.manual")}</span>}
                >
                  <span class="text-success px-2">
                    {t("institute.withOAuth")}: {institute.provider}
                  </span>
                </Show>
                <Dialog
                  ghost
                  size="sm"
                  square
                  title={t("general.actions.edit.title")}
                  btnContent={<span class="icon-[fluent--edit-20-regular] w-5 h-5" />}
                >
                  <InstituteForm
                    editSource={institute}
                    onDone={handleUpdateInstitute}
                    loading={loading()}
                    oauthServices={oauthServices()}
                  />
                </Dialog>
                <Popover
                  size="sm"
                  ghost
                  square
                  title={t("general.actions.delete.title")}
                  btnContent={<span class="icon-[fluent--delete-20-regular] w-5 h-5" />}
                >
                  <Card contentClass="p-2 flex flex-row space-x-2 items-center">
                    <span class="icon-[fluent--warning-20-regular] w-5 h-5 text-error" />
                    <span>{t("general.actions.delete.message")}</span>
                    <Button
                      level="error"
                      size="sm"
                      title={t("general.actions.confirm.title")}
                      onClick={() => handleDeleteInstitute(institute)}
                      loading={loading()}
                    >
                      <span>{t("general.actions.confirm.title")}</span>
                    </Button>
                  </Card>
                </Popover>
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  );
}
