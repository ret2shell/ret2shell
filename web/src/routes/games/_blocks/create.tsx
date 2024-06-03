import { createGame } from "@/lib/api/game";
import { type Game, HostType } from "@/lib/models/game";
import { accountStore } from "@/lib/storage/account";
import { t } from "@/lib/storage/theme";
import { addToast } from "@/lib/storage/toast";
import Button from "@/lib/widgets/button";
import Input from "@/lib/widgets/input";
import TimePicker from "@/lib/widgets/timepicker";
import { createForm, maxRange, minRange, required, setValue, setValues } from "@modular-forms/solid";
import type { HTTPError } from "ky";
import { DateTime } from "luxon";
import { createSignal } from "solid-js";

type CreateGameForm = {
    name: string;
    brief: string;
    start_at: number;
    end_at: number;
    register_at: number;
    archive_at: number;
    offline: boolean;
    team_size: number;
    enable_audit: boolean;
    can_register_after_started: boolean;
    weight: number;
};

export default function CreateGame(props: { onDone: (game: Game) => void }) {
    const [form, { Form, Field }] = createForm<CreateGameForm>();
    const [loading, setLoading] = createSignal(false);
    setValues(form, {
        weight: 3,
        team_size: 4,
        offline: false,
        enable_audit: true,
        can_register_after_started: true,
    });
    function onSubmit(result: CreateGameForm) {
        setLoading(true);
        const req: Game = {
            ...result,
            start_at: DateTime.fromSeconds(result.start_at),
            end_at: DateTime.fromSeconds(result.end_at),
            register_at: DateTime.fromSeconds(result.register_at),
            archive_at: DateTime.fromSeconds(result.archive_at),
            host_type: HostType.CTFGame,
            id: 0,
            hidden: true,
            frozen: false,
            updated_at: DateTime.now(),
            introduction_id: null,
            access_policy: { restrict: false, institutes: [], sync: 2 },
            cover: null,
            logo: null,
            award_rate: 0,
            admins: [accountStore.id!],
        };
        createGame(req)
            .then((resp) => {
                props.onDone(resp);
            })
            .catch((err: HTTPError) => {
                void err.response.text().then((reason) => {
                    addToast({
                        level: "error",
                        description: `${t("game.createFailed")}: ${reason}`,
                        duration: 5000,
                    });
                });
            })
            .finally(() => {
                setLoading(false);
            });
    }
    return (
        <div class="flex-1 self-center w-full max-w-5xl flex flex-col">
            <h1 class="text-3xl text-center font-bold mt-8">
                {t("game.create")} - {t("game.title")}
            </h1>
            <Form onSubmit={onSubmit} class="flex flex-col space-y-2 py-3 lg:py-6">
                <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                    <Field name="name" validate={[required(t("game.nameRequired")!)]}>
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                                placeholder={t("game.namePlaceholder")}
                                title={t("game.namePlaceholder")}
                                {...props}
                                value={field.value}
                                error={field.error}
                                required
                                class="flex-1"
                            />
                        )}
                    </Field>
                    <Field
                        name="team_size"
                        type="number"
                        validate={[
                            required(t("game.team.sizeRequired")!),
                            minRange(1, t("game.team.sizeMinExceeded")!),
                            maxRange(99, t("game.team.sizeMaxExceeded")!),
                        ]}
                    >
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--person-20-regular] w-5 h-5" />}
                                placeholder={t("game.teamSizePlaceholder")}
                                title={t("game.teamSizePlaceholder")}
                                {...props}
                                value={field.value}
                                type="number"
                                error={field.error}
                                required
                                class="min-w-48"
                                min={1}
                                max={99}
                            />
                        )}
                    </Field>
                    <div class="flex flex-col space-y-1">
                        <label class="label">{t("game.miscSettings")}</label>
                        <div class="flex flex-row">
                            <Field name="can_register_after_started" type="boolean">
                                {(field, props) => (
                                    <>
                                        <input type="checkbox" class="hidden" {...props} checked={field.value} />
                                        <Button
                                            title={t("game.canRegisterAfterStarted")}
                                            type="button"
                                            class="!rounded-r-none"
                                            square
                                            onClick={() => {
                                                setValue(form, "can_register_after_started", !field.value);
                                            }}
                                        >
                                            {/* icon-[fluent--accessibility-checkmark-20-regular] icon-[fluent--accessibility-checkmark-20-filled] */}
                                            <span
                                                class={`icon-[fluent--accessibility-checkmark-20-${
                                                    field.value ? "filled" : "regular"
                                                }] w-5 h-5 ${field.value ? "text-primary" : ""}`}
                                            />
                                        </Button>
                                    </>
                                )}
                            </Field>
                            <Field name="offline" type="boolean">
                                {(field, props) => (
                                    <>
                                        <input type="checkbox" class="hidden" {...props} checked={field.value} />
                                        <Button
                                            title={t("game.offline")}
                                            type="button"
                                            class="!rounded-none"
                                            square
                                            onClick={() => {
                                                setValue(form, "offline", !field.value);
                                            }}
                                        >
                                            {/* icon-[fluent--wifi-off-20-regular] icon-[fluent--wifi-off-20-filled] */}
                                            <span
                                                class={`icon-[fluent--wifi-off-20-${
                                                    field.value ? "filled" : "regular"
                                                }] w-5 h-5 ${field.value ? "text-primary" : ""}`}
                                            />
                                        </Button>
                                    </>
                                )}
                            </Field>
                            <Field name="enable_audit" type="boolean">
                                {(field, props) => (
                                    <>
                                        <input type="checkbox" class="hidden" {...props} checked={field.value} />
                                        <Button
                                            title={t("game.enableAudit")}
                                            type="button"
                                            class="!rounded-l-none"
                                            square
                                            onClick={() => {
                                                setValue(form, "enable_audit", !field.value);
                                            }}
                                        >
                                            {/* icon-[fluent--people-audience-20-regular] icon-[fluent--people-audience-20-filled] */}
                                            <span
                                                class={`icon-[fluent--people-audience-20-${
                                                    field.value ? "filled" : "regular"
                                                }] w-5 h-5 ${field.value ? "text-primary" : ""}`}
                                            />
                                        </Button>
                                    </>
                                )}
                            </Field>
                        </div>
                    </div>
                    <Field name="weight" type="number">
                        {(field, props) => (
                            <div class="flex flex-col space-y-1">
                                <label class="label" for={props.name}>
                                    {t("game.weight")}
                                    <input class="hidden" type="number" {...props} value={field.value} />
                                </label>
                                <div class="flex flex-row">
                                    <Button
                                        type="button"
                                        square
                                        class={`!rounded-r-none ${field.value === 1 ? "text-primary" : ""}`}
                                        onClick={() => {
                                            setValue(form, "weight", 1);
                                        }}
                                    >
                                        1
                                    </Button>
                                    <Button
                                        type="button"
                                        square
                                        class={`!rounded-none ${field.value === 2 ? "text-primary" : ""}`}
                                        onClick={() => {
                                            setValue(form, "weight", 2);
                                        }}
                                    >
                                        2
                                    </Button>
                                    <Button
                                        type="button"
                                        square
                                        class={`!rounded-l-none ${field.value === 3 ? "text-primary" : ""}`}
                                        onClick={() => {
                                            setValue(form, "weight", 3);
                                        }}
                                    >
                                        3
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Field>
                </div>
                <Field name="brief" validate={[required(t("game.briefRequired")!)]}>
                    {(field, props) => (
                        <Input
                            icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                            placeholder={t("game.briefPlaceholder")}
                            title={t("game.briefPlaceholder")}
                            {...props}
                            value={field.value}
                            error={field.error}
                            required
                            class="flex-1"
                        />
                    )}
                </Field>
                <Field name="start_at" type="number">
                    {(startAtField) => (
                        <Field name="end_at" type="number">
                            {(endAtField) => (
                                <Field name="register_at" type="number">
                                    {(registerAtField) => (
                                        <Field name="archive_at" type="number">
                                            {(archiveAtField) => (
                                                <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                                                    <TimePicker
                                                        class="flex-1"
                                                        form={form}
                                                        type="time"
                                                        range
                                                        title={t("game.startEndTime")}
                                                        placeholder={t("game.startEndTime")}
                                                        name={startAtField.name}
                                                        value={startAtField.value}
                                                        nameNext={endAtField.name}
                                                        valueNext={endAtField.value}
                                                        error={startAtField.error || endAtField.error}
                                                        startEdge={
                                                            (registerAtField.value &&
                                                                DateTime.fromSeconds(registerAtField.value)) ||
                                                            undefined
                                                        }
                                                        endEdge={
                                                            (archiveAtField.value &&
                                                                DateTime.fromSeconds(archiveAtField.value)) ||
                                                            undefined
                                                        }
                                                    />
                                                    <TimePicker
                                                        class="flex-1"
                                                        form={form}
                                                        type="time"
                                                        range
                                                        title={t("game.registerArchiveTime")}
                                                        placeholder={t("game.registerArchiveTime")}
                                                        name={registerAtField.name}
                                                        value={registerAtField.value}
                                                        nameNext={archiveAtField.name}
                                                        valueNext={archiveAtField.value}
                                                        error={registerAtField.error || archiveAtField.error}
                                                        startEdge={
                                                            (startAtField.value &&
                                                                DateTime.fromSeconds(startAtField.value)) ||
                                                            undefined
                                                        }
                                                        endEdge={
                                                            (endAtField.value &&
                                                                DateTime.fromSeconds(endAtField.value)) ||
                                                            undefined
                                                        }
                                                        reverseEdge
                                                    />
                                                </div>
                                            )}
                                        </Field>
                                    )}
                                </Field>
                            )}
                        </Field>
                    )}
                </Field>
                <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
                    {t("form.create")}
                </Button>
            </Form>
        </div>
    );
}
