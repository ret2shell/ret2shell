import { createBulletin, updateBulletin } from "@/lib/api/bulletin";
import { type Article, ArticleAccessPolicy } from "@/lib/models/article";
import { accountStore } from "@/lib/storage/account";
import { t } from "@/lib/storage/theme";
import { addToast } from "@/lib/storage/toast";
import Button from "@/lib/widgets/button";
import Editor from "@/lib/widgets/editor";
import Input from "@/lib/widgets/input";
import { createForm, required, setValue, setValues } from "@modular-forms/solid";
import type { HTTPError } from "ky";
import { DateTime } from "luxon";
import { createEffect, createSignal, untrack } from "solid-js";

type BulletinForm = {
    title: string;
    content: string;
    enable_comment: boolean;
    weight: number;
};

export default function (props: {
    onDone: (calendar: Article) => void;
    editSource?: Article;
}) {
    const [form, { Form, Field }] = createForm<BulletinForm>();
    const [loading, setLoading] = createSignal(false);
    createEffect(() => {
        if (props.editSource) {
            untrack(() => {
                setValues(form, {
                    title: props.editSource?.title || "",
                    content: props.editSource?.content || "",
                    enable_comment: props.editSource?.enable_comment || false,
                    weight: props.editSource?.weight || 3,
                });
            });
        } else {
            untrack(() => {
                setValues(form, {
                    title: undefined,
                    content: undefined,
                    enable_comment: true,
                    weight: 0,
                });
            });
        }
    });
    function onSubmit(result: BulletinForm) {
        setLoading(true);
        (props.editSource ? updateBulletin : createBulletin)({
            ...result,
            id: props.editSource?.id || 0,
            created_at: props.editSource?.created_at || DateTime.now(),
            updated_at: props.editSource?.updated_at || DateTime.now(),
            publisher_id: accountStore.id || 0,
            access_policy: ArticleAccessPolicy.Bulletin,
            draft: false,
            published: true,
            path: [],
        })
            .then((resp) => props.onDone(resp))
            .catch((err: HTTPError) => {
                void err.response.text().then((resp) => {
                    addToast({
                        level: "error",
                        description: `${props.editSource ? t("form.saveFailed") : t("form.createFailed")}: ${resp}`,
                        duration: 5000,
                    });
                });
            })
            .finally(() => {
                setLoading(false);
            });
    }
    return (
        <>
            <Form onSubmit={onSubmit} class="flex flex-col space-y-2 self-center w-full max-w-5xl flex-1 p-3 lg:p-6">
                <Field name="title" validate={[required(t("bulletin.titleRequired")!)]}>
                    {(field, props) => (
                        <>
                            <Input
                                icon={<span class="icon-[fluent--megaphone-20-regular] w-5 h-5" />}
                                placeholder={t("bulletin.titlePlaceholder")}
                                title={t("bulletin.titlePlaceholder")}
                                {...props}
                                value={field.value}
                                error={field.error}
                                required
                                extraBtn={
                                    <>
                                        <Field name="weight" type="number">
                                            {(field, props) => (
                                                <>
                                                    <input
                                                        type="number"
                                                        {...props}
                                                        name="weight"
                                                        value={field.value}
                                                        class="hidden"
                                                    />
                                                    <Button
                                                        class="!rounded-none"
                                                        title={t("bulletin.pinned")}
                                                        type="button"
                                                        onClick={() => {
                                                            setValue(form, "weight", field.value && true ? 0 : 1);
                                                        }}
                                                    >
                                                        {/* icon-[fluent--pin-20-regular] icon-[fluent--pin-20-filled] */}
                                                        <span
                                                            class={`w-5 h-5 icon-[fluent--pin-20-${
                                                                (field.value || 0) > 0 ? "filled" : "regular"
                                                            }] ${(field.value || 0) > 0 ? "text-primary" : ""}`}
                                                        />
                                                    </Button>
                                                </>
                                            )}
                                        </Field>
                                        <Field name="enable_comment" type="boolean">
                                            {(field, props) => (
                                                <>
                                                    <input
                                                        type="checkbox"
                                                        {...props}
                                                        name="enable_comment"
                                                        checked={field.value}
                                                        class="hidden"
                                                    />
                                                    <Button
                                                        class="!rounded-l-none"
                                                        title={t("bulletin.enableComment")}
                                                        type="button"
                                                        onClick={() => {
                                                            setValue(form, "enable_comment", !field.value);
                                                        }}
                                                    >
                                                        {/* icon-[fluent--chat-20-regular] icon-[fluent--chat-20-filled] */}
                                                        <span
                                                            class={`w-5 h-5 icon-[fluent--chat-20-${
                                                                field.value ? "filled" : "regular"
                                                            }] ${field.value ? "text-primary" : ""}`}
                                                        />
                                                    </Button>
                                                </>
                                            )}
                                        </Field>
                                    </>
                                }
                            />
                        </>
                    )}
                </Field>
                <Field name="content" validate={[required(t("bulletin.contentRequired")!)]}>
                    {(field) => (
                        <>
                            <Editor
                                form={form}
                                lineNumbers
                                class="flex-1"
                                lang="markdown"
                                placeholder="MARKDOWN"
                                title={t("bulletin.contentPlaceholder")}
                                name="content"
                                value={field.value}
                                error={field.error}
                            />
                        </>
                    )}
                </Field>
                <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
                    {props.editSource ? t("form.save") : t("form.create")}
                </Button>
            </Form>
        </>
    );
}
