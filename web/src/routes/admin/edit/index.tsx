import { getPlatformConfig, updatePlatformConfig } from "@/lib/api/platform";
import LogoAnimate from "@/lib/assets/animates/logo-animate";
import type { Config } from "@/lib/models/config";
import { Title } from "@/lib/storage/header";
import { platformStore, setPlatformStore } from "@/lib/storage/platform";
import { t } from "@/lib/storage/theme";
import { addToast } from "@/lib/storage/toast";
import Button from "@/lib/widgets/button";
import Input from "@/lib/widgets/input";
import { createForm, setValue, setValues } from "@modular-forms/solid";
import type { HTTPError } from "ky";
import { Show, createSignal, onMount } from "solid-js";

type PlatformConfigForm = {
    name?: string;
    footer_info?: string;
    footer_url?: string;
    subject_info?: string;
    subject_url?: string;
    record?: string;
    hide_maker: boolean;
};

export default function () {
    const [form, { Form, Field }] = createForm<PlatformConfigForm>();
    const [loading, setLoading] = createSignal(false);
    const [config, setConfig] = createSignal(null as null | Config);
    function onSubmit(result: PlatformConfigForm) {
        setLoading(true);
        if (!config()) {
            addToast({
                level: "error",
                description: t("admin.platform.fetchNotReady")!,
                duration: 5000,
            });
            return;
        }
        const mergedConfig = {
            ...config(),
            server: {
                ...config()!.server,
                name: result.name,
                footer_info: result.footer_info,
                footer_url: result.footer_url,
                subject_info: result.subject_info,
                subject_url: result.subject_url,
                record: result.record,
                hide_maker: result.hide_maker,
            },
        } as Config;
        updatePlatformConfig(mergedConfig)
            .then(() => {
                setConfig(mergedConfig);
                setPlatformStore({ config: mergedConfig.server });
                addToast({
                    level: "success",
                    description: t("admin.platform.updateSuccess")!,
                    duration: 5000,
                });
            })
            .catch((err: HTTPError) => {
                err.response.text().then((text) => {
                    addToast({
                        level: "error",
                        description: `${t("admin.platform.updateFailed")}: ${text}`,
                        duration: 5000,
                    });
                });
            })
            .finally(() => setLoading(false));
    }
    onMount(() => {
        getPlatformConfig().then((resp) => {
            setConfig(resp);
            setValues(form, {
                name: resp.server.name || undefined,
                footer_info: resp.server.footer_info || undefined,
                footer_url: resp.server.footer_url || undefined,
                subject_info: resp.server.subject_info || undefined,
                subject_url: resp.server.subject_url || undefined,
                record: resp.server.record || undefined,
                hide_maker: resp.server.hide_maker || false,
            });
        });
    });
    return (
        <>
            <Title title={`${t("admin.edit.title")} - ${platformStore.config.name || t("platform.name")}`} />
            <div class="flex-1 flex flex-col items-center">
                <Form onSubmit={onSubmit} class="w-full max-w-5xl p-3 lg:p-6 flex flex-col space-y-2">
                    <div class="p-6 flex items-center justify-center">
                        <LogoAnimate width={128} height={128} />
                    </div>
                    <Field name="name">
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                                placeholder={t("platform.name")}
                                title={t("platform.form.nameTitle")}
                                {...props}
                                value={field.value}
                                error={field.error}
                            />
                        )}
                    </Field>
                    <Field name="footer_info">
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--phone-footer-arrow-down-20-regular] w-5 h-5" />}
                                placeholder={t("platform.form.footerInfoPlaceholder")}
                                title={t("platform.form.footerInfoTitle")}
                                {...props}
                                value={field.value}
                                error={field.error}
                            />
                        )}
                    </Field>
                    <Field name="footer_url">
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--link-20-regular] w-5 h-5" />}
                                placeholder={t("platform.form.footerUrlPlaceholder")}
                                title={t("platform.form.footerUrlTitle")}
                                {...props}
                                value={field.value}
                                error={field.error}
                            />
                        )}
                    </Field>
                    <Field name="subject_info">
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--subtitles-20-regular] w-5 h-5" />}
                                placeholder={t("platform.subject")}
                                title={t("platform.form.subjectInfoTitle")}
                                {...props}
                                value={field.value}
                                error={field.error}
                            />
                        )}
                    </Field>
                    <Field name="subject_url">
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--link-20-regular] w-5 h-5" />}
                                placeholder="https://github.com/ret2shell"
                                title={t("platform.form.subjectUrlTitle")}
                                {...props}
                                value={field.value}
                                error={field.error}
                            />
                        )}
                    </Field>
                    <div class="flex flex-row space-x-2">
                        <Field name="record">
                            {(field, props) => (
                                <Input
                                    class="flex-1"
                                    icon={<span class="icon-[fluent--record-20-regular] w-5 h-5" />}
                                    placeholder={t("platform.form.recordPlaceholder")}
                                    title={t("platform.form.recordTitle")}
                                    {...props}
                                    value={field.value}
                                    error={field.error}
                                />
                            )}
                        </Field>
                        <Field name="hide_maker" type="boolean">
                            {(field, props) => (
                                <div class="flex flex-col justify-end">
                                    <input type="checkbox" class="hidden" {...props} checked={field.value} />
                                    <Button
                                        type="button"
                                        onClick={() => setValue(form, "hide_maker", !field.value)}
                                        disabled={platformStore.license?.level !== "enterprise"}
                                        title={
                                            platformStore.license?.level !== "enterprise"
                                                ? t("platform.form.hideMakerDisabled")
                                                : undefined
                                        }
                                    >
                                        <Show
                                            when={field.value}
                                            fallback={<span class="icon-[fluent--circle-20-regular] w-5 h-5" />}
                                        >
                                            <span class="icon-[fluent--checkmark-circle-20-filled] w-5 h-5 text-primary" />
                                        </Show>
                                        <span>{t("platform.form.hideMaker")}</span>
                                    </Button>
                                </div>
                            )}
                        </Field>
                    </div>
                    <Button
                        type="submit"
                        level="primary"
                        class="!mt-4"
                        loading={loading()}
                        disabled={!config() || loading()}
                    >
                        {t("form.save")}
                    </Button>
                </Form>
            </div>
        </>
    );
}
