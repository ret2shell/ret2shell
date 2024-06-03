import { createWiki, updateWiki } from "@/lib/api/wiki";
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

type WikiForm = {
    title: string;
    path: string;
    content: string;
    enable_comment: boolean;
    draft: boolean;
    published: boolean;
};

export default function (props: {
    onDone: (article: Article) => void;
    editSource?: Article;
}) {
    const [form, { Form, Field }] = createForm<WikiForm>();
    const [loading, setLoading] = createSignal(false);
    createEffect(() => {
        if (props.editSource) {
            untrack(() => {
                setValues(form, {
                    title: props.editSource!.title,
                    path: props.editSource!.path.join("/"),
                    content: props.editSource!.content || "",
                    enable_comment: props.editSource!.enable_comment,
                    draft: props.editSource!.draft,
                    published: props.editSource!.published,
                });
            });
        } else {
            untrack(() => {
                setValues(form, {
                    title: undefined,
                    path: undefined,
                    content: undefined,
                    enable_comment: true,
                    draft: true,
                    published: false,
                });
            });
        }
    });
    function onSubmit(result: WikiForm) {
        setLoading(true);
        const article: Article = {
            ...result,
            path: result.path.split("/"),
            id: props.editSource?.id || 0,
            created_at: props.editSource?.created_at || DateTime.now(),
            updated_at: DateTime.now(),
            publisher_id: props.editSource?.publisher_id || accountStore.id!,
            access_policy: ArticleAccessPolicy.Wiki,
            weight: 0,
        };
        (props.editSource ? updateWiki : createWiki)(article)
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
        <Form onSubmit={onSubmit} class="flex flex-col space-y-2 self-center w-full max-w-5xl flex-1 p-3 lg:p-6">
            <Field name="title" validate={[required(t("wiki.titleRequired")!)]}>
                {(field, props) => (
                    <Input
                        icon={<span class="icon-[fluent--book-20-regular] w-5 h-5" />}
                        placeholder={t("wiki.titlePlaceholder")}
                        title={t("wiki.titlePlaceholder")}
                        {...props}
                        value={field.value}
                        error={field.error}
                        required
                        extraBtn={
                            <>
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
                                                class="!rounded-none"
                                                title={t("wiki.enableComment")}
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
                                <Field name="draft" type="boolean">
                                    {(field, props) => (
                                        <>
                                            <input
                                                type="checkbox"
                                                {...props}
                                                name="draft"
                                                checked={field.value}
                                                class="hidden"
                                            />
                                            <Button
                                                class="!rounded-none"
                                                title={t("wiki.draft")}
                                                type="button"
                                                onClick={() => {
                                                    setValue(form, "draft", !field.value);
                                                }}
                                            >
                                                {/* icon-[fluent--edit-20-regular] icon-[fluent--edit-20-filled] */}
                                                <span
                                                    class={`w-5 h-5 icon-[fluent--edit-20-${
                                                        field.value ? "filled" : "regular"
                                                    }] ${field.value ? "text-primary" : ""}`}
                                                />
                                            </Button>
                                        </>
                                    )}
                                </Field>
                                <Field name="published" type="boolean">
                                    {(field, props) => (
                                        <>
                                            <input
                                                type="checkbox"
                                                {...props}
                                                name="published"
                                                checked={field.value}
                                                class="hidden"
                                            />
                                            <Button
                                                class="!rounded-l-none"
                                                title={t("wiki.published")}
                                                type="button"
                                                onClick={() => {
                                                    setValue(form, "published", !field.value);
                                                }}
                                            >
                                                {/* icon-[fluent--megaphone-loud-20-regular] icon-[fluent--megaphone-loud-20-filled] */}
                                                <span
                                                    class={`w-5 h-5 icon-[fluent--megaphone-loud-20-${
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
                )}
            </Field>
            <Field name="path" validate={[required(t("wiki.pathRequired")!)]}>
                {(field, props) => (
                    <Input
                        icon={<span class="icon-[fluent--code-20-regular] w-5 h-5" />}
                        placeholder={t("wiki.pathPlaceholder")}
                        title={t("wiki.pathPlaceholder")}
                        {...props}
                        value={field.value}
                        error={field.error}
                        required
                    />
                )}
            </Field>
            <Field name="content" validate={[required(t("wiki.contentRequired")!)]}>
                {(field) => (
                    <Editor
                        form={form}
                        lineNumbers
                        class="flex-1"
                        lang="markdown"
                        placeholder="MARKDOWN"
                        title={t("wiki.contentPlaceholder")}
                        name="content"
                        value={field.value}
                        error={field.error}
                    />
                )}
            </Field>
            <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
                {props.editSource ? t("form.save") : t("form.create")}
            </Button>
        </Form>
    );
}
