import type { Extra } from "@/lib/models/extra";
import type { Hint } from "@/lib/models/hint";
import { Permission } from "@/lib/models/user";
import { accountStore } from "@/lib/storage/account";
import { gameStore } from "@/lib/storage/game";
import { t } from "@/lib/storage/theme";
import Button from "@/lib/widgets/button";
import Card from "@/lib/widgets/card";
import Input from "@/lib/widgets/input";
import Popover from "@/lib/widgets/popover";
import { createForm, required } from "@modular-forms/solid";
import { LoremIpsum } from "lorem-ipsum";
import { For, Show, createSignal } from "solid-js";

type CreateHintForm = {
    content: string;
    cost?: number;
};

export default function () {
    const [hints, setHints] = createSignal([] as Hint[]);
    const [extras, setExtras] = createSignal([] as Extra[]);
    const lorem = new LoremIpsum({
        wordsPerSentence: {
            max: 8,
            min: 3,
        },
    });
    const [form, { Form, Field }] = createForm<CreateHintForm>();
    const [loading, setLoading] = createSignal(false);
    function onSubmit(result: CreateHintForm) {}
    return (
        <div class="flex flex-col p-3 lg:p-6">
            <For each={hints()}>
                {(hint) => (
                    <div class="px-2 min-h-12 border-b border-b-layer-content/10 flex items-center space-x-2">
                        <span class="icon-[fluent--info-20-regular] w-5 h-5 text-primary flex-shrink-0" />
                        <Show
                            when={hint.cost === 0 || extras().find((e) => e.hint_id === hint.id)}
                            fallback={
                                <>
                                    <span class="blur pointer-events-none select-none flex-1">
                                        {lorem.generateSentences(1)}
                                    </span>
                                    <Popover
                                        size="sm"
                                        ghost
                                        btnContent={
                                            <>
                                                <span class="text-warning">-{hint.cost}</span>
                                                <span class="opacity-60 text-warning">pts</span>
                                                <span class="icon-[fluent--lock-20-regular] w-5 h-5 text-warning" />
                                            </>
                                        }
                                    >
                                        <Card contentClass="p-2 flex flex-row items-center">
                                            <span class="px-2">
                                                {t("game.challenge.confirmUnlockHint", {
                                                    cost: hint.cost,
                                                })}
                                            </span>
                                            <Button size="sm" level="error">
                                                {t("platform.yes")}
                                            </Button>
                                        </Card>
                                    </Popover>
                                </>
                            }
                        >
                            <span>{hint.content}</span>
                        </Show>
                    </div>
                )}
            </For>
            <Show
                when={
                    accountStore.permissions.includes(Permission.Game) &&
                    gameStore.current?.admins.includes(accountStore.id!)
                }
            >
                <Form
                    onSubmit={onSubmit}
                    class="px-2 min-h-12 border-b border-b-layer-content/10 flex items-center space-x-2"
                >
                    <span class="icon-[fluent--info-20-regular] w-5 h-5 text-primary flex-shrink-0" />
                    <Field name="content" validate={[required(t("game.challenge.hintRequired")!)]}>
                        {(field, props) => (
                            <Input
                                type="text"
                                value={field.value}
                                error={field.error}
                                {...props}
                                required
                                noLabel
                                placeholder={t("game.challenge.createHint")}
                                class="flex-1"
                                size="sm"
                            />
                        )}
                    </Field>
                    <Field name="cost" type="number">
                        {(field, props) => (
                            <Input
                                type="number"
                                value={field.value}
                                error={field.error}
                                {...props}
                                noLabel
                                placeholder={t("game.challenge.createHintCost")}
                                class="w-24"
                                size="sm"
                            />
                        )}
                    </Field>
                    <span class="font-bold opacity-60">pts</span>
                    <span class="w-8" />
                    <Button size="sm" level="primary" type="submit" loading={loading()} disabled={loading()}>
                        <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                        <span>{t("form.create")}</span>
                    </Button>
                </Form>
            </Show>
        </div>
    );
}
