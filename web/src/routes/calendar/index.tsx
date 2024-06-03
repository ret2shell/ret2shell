import { createCalendar, deleteCalendar, getCalendar, getCalendarList, updateCalendar } from "@/lib/api/calendar";
import Spin from "@/lib/assets/animates/spin";
import type { Calendar } from "@/lib/models/calendar";
import { Permission } from "@/lib/models/user";
import { accountStore } from "@/lib/storage/account";
import { fullTheme, t } from "@/lib/storage/theme";
import { addToast } from "@/lib/storage/toast";
import Article from "@/lib/widgets/article";
import Button from "@/lib/widgets/button";
import Card from "@/lib/widgets/card";
import Divider from "@/lib/widgets/divider";
import Editor from "@/lib/widgets/editor";
import Input from "@/lib/widgets/input";
import Link from "@/lib/widgets/link";
import TimePicker from "@/lib/widgets/timepicker";
import { createForm, required, setValues } from "@modular-forms/solid";
import { useSearchParams } from "@solidjs/router";
import type { HTTPError } from "ky";
import { DateTime, type MonthNumbers } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, untrack } from "solid-js";

function EventDetail(props: {
    event: Calendar;
    onDeleted: () => void;
    onEdit: () => void;
}) {
    return (
        <>
            <h1 class="text-3xl text-center font-bold mt-8 hover:underline">
                <a href={props.event.link} target="_blank" rel="noreferrer">
                    {props.event.name}
                </a>
            </h1>
            <div class="flex flex-row items-center justify-center space-x-6 opacity-60 flex-wrap">
                <a
                    class="font-bold hover:underline flex flex-row space-x-2 items-center"
                    href={`/users/${props.event.reporter_id}`}
                >
                    <span class="icon-[fluent--person-20-regular] w-5 h-5" />
                    <span>
                        {t("calendar.addBy", {
                            name: props.event.reporter_name || t("calendar.unknown")!,
                        })}
                    </span>
                    <span />
                </a>
                <a
                    class="font-bold hover:underline flex flex-row space-x-2 items-center"
                    href={props.event.link}
                    target="_blank"
                    rel="noreferrer"
                >
                    <span class="icon-[fluent--link-20-regular] w-5 h-5" />
                    <span>{t("calendar.gotoEventHomePage")}</span>
                </a>
                <Show when={accountStore.permissions.includes(Permission.Calendar)}>
                    <button
                        class="font-bold hover:underline flex flex-row space-x-2 items-center"
                        onClick={props.onEdit}
                        type="button"
                    >
                        <span class="icon-[fluent--edit-20-regular] w-5 h-5" />
                        <span>{t("form.edit")}</span>
                    </button>
                    <button
                        class="font-bold hover:underline flex flex-row space-x-2 items-center"
                        onClick={props.onDeleted}
                        type="button"
                    >
                        <span class="icon-[fluent--delete-20-regular] w-5 h-5" />
                        <span>{t("form.delete")}</span>
                    </button>
                </Show>
            </div>
            <Article content={props.event.intro || ""} extra headingAnchors />
        </>
    );
}

type CalendarForm = {
    name: string;
    intro: string;
    link: string;
    start_at: number; // will be convert to luxon's DateTime
    end_at: number;
};

function EventForm(props: {
    onDone: (calendar: Calendar) => void;
    editSource?: Calendar;
}) {
    const [form, { Form, Field }] = createForm<CalendarForm>();
    const [loading, setLoading] = createSignal(false);
    createEffect(() => {
        if (props.editSource) {
            untrack(() => {
                setValues(form, {
                    name: props.editSource!.name,
                    intro: props.editSource!.intro || "",
                    link: props.editSource!.link,
                    start_at: props.editSource!.start_at.toSeconds(),
                    end_at: props.editSource!.end_at.toSeconds(),
                });
            });
        } else {
            untrack(() => {
                setValues(form, {
                    name: undefined,
                    intro: undefined,
                    link: undefined,
                    start_at: undefined,
                    end_at: undefined,
                });
            });
        }
    });
    function onSubmit(result: CalendarForm) {
        setLoading(true);
        (props.editSource ? updateCalendar : createCalendar)({
            ...result,
            id: props.editSource?.id || 0,
            start_at: DateTime.fromSeconds(result.start_at),
            end_at: DateTime.fromSeconds(result.end_at),
            reporter_id: accountStore.id!,
        })
            .then((resp) => props.onDone(resp))
            .catch((err: HTTPError) => {
                void err.response.text().then((resp) => {
                    addToast({
                        level: "error",
                        description: `${
                            props.editSource ? t("calendar.saveFailed") : t("calendar.createFailed")
                        }: ${resp}`,
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
            <h1 class="text-3xl text-center font-bold mt-8">
                {props.editSource ? t("calendar.editEvent") : t("calendar.createEvent")}
            </h1>
            <Form onSubmit={onSubmit} class="flex flex-col space-y-2">
                <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                    <Field name="name" validate={[required(t("calendar.eventNameRequired")!)]}>
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--flag-20-regular] w-5 h-5" />}
                                placeholder={t("calendar.eventNamePlaceholder")}
                                title={t("calendar.eventNamePlaceholder")}
                                {...props}
                                value={field.value}
                                error={field.error}
                                required
                                class="flex-1"
                            />
                        )}
                    </Field>
                    <Field name="link" validate={[required(t("calendar.eventLinkRequired")!)]}>
                        {(field, props) => (
                            <Input
                                icon={<span class="icon-[fluent--link-20-regular] w-5 h-5" />}
                                placeholder={t("calendar.eventLinkPlaceholder")}
                                title={t("calendar.eventLinkPlaceholder")}
                                {...props}
                                value={field.value}
                                error={field.error}
                                required
                                class="flex-1"
                            />
                        )}
                    </Field>
                </div>
                <div class="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                    <Field name="start_at" type="number" validate={[required(t("calendar.startAtRequired")!)]}>
                        {(field) => (
                            <Field name="end_at" type="number" validate={[required(t("calendar.endAtRequired")!)]}>
                                {(field2) => (
                                    <TimePicker
                                        form={form}
                                        type="date"
                                        range
                                        title={t("calendar.startEndTime")}
                                        placeholder={t("calendar.startEndTime")}
                                        name={field.name}
                                        value={field.value}
                                        nameNext={field2.name}
                                        valueNext={field2.value}
                                        error={field.error || field2.error}
                                    />
                                )}
                            </Field>
                        )}
                    </Field>
                    <Field name="intro" validate={[required(t("calendar.introRequired")!)]}>
                        {(field) => (
                            <Editor
                                form={form}
                                lineNumbers={true}
                                class="flex-1 min-h-80 lg:min-h-auto"
                                lang="markdown"
                                placeholder="MARKDOWN"
                                title={t("calendar.introPlaceholder")}
                                name="intro"
                                value={field.value}
                                error={field.error}
                            />
                        )}
                    </Field>
                </div>
                <Button type="submit" level="primary" class="!mt-4" loading={loading()} disabled={loading()}>
                    {props.editSource ? t("form.save") : t("form.create")}
                </Button>
            </Form>
        </>
    );
}

export default function () {
    const currentDate = DateTime.now();
    const [year, setYear] = createSignal(currentDate.year);
    const [month, setMonth] = createSignal(currentDate.month);
    const [searchParams, setSearchParams] = useSearchParams();
    const [inEdit, setInEdit] = createSignal(false);
    const selectedEventId = createMemo(() => {
        if (searchParams?.event) {
            try {
                return Number.parseInt(searchParams.event);
            } catch {
                return null;
            }
        }
        return null;
    });
    const [selectedEvent, setSelectedEvent] = createSignal<Calendar | null>(null);
    createEffect(() => {
        if (selectedEventId()) {
            untrack(() => {
                setSelectedEvent(null);
                void getCalendar(selectedEventId()!).then((resp) => {
                    setSelectedEvent(resp);
                });
            });
        } else {
            setSelectedEvent(null);
        }
    });

    const [selectedDay, setSelectedDay] = createSignal(
        selectedEventId() === null ? currentDate : (null as null | DateTime)
    );

    function convertWeekKey(weekKey: number) {
        switch (weekKey) {
            case 0:
                return "calendar.day.sun";
            case 1:
                return "calendar.day.mon";
            case 2:
                return "calendar.day.tue";
            case 3:
                return "calendar.day.wed";
            case 4:
                return "calendar.day.thu";
            case 5:
                return "calendar.day.fri";
            case 6:
                return "calendar.day.sat";
            default:
                return "calendar.day.sun";
        }
    }
    const currentMonthDays = createMemo(() => {
        // should starts at prev month's tail, from sunday, end with next month's head, to saturday
        const days = [] as DateTime<true>[];
        const cDate = DateTime.fromObject({ year: year(), month: month(), day: 1 });
        const prevMonth = cDate.minus({ month: 1 });
        const currentMonth = cDate;
        const currentMonthDays = currentMonth.daysInMonth;
        let currentMonthFirstDay = currentMonth.startOf("month").weekday;
        if (currentMonthFirstDay === 7) {
            currentMonthFirstDay = 0;
        }
        const prevMonthDays = prevMonth.daysInMonth;
        const prevMonthTail = prevMonthDays! - currentMonthFirstDay;
        const nextMonthHead = (7 - ((currentMonthFirstDay + currentMonthDays!) % 7)) % 7;
        for (let i = prevMonthTail; i < prevMonthDays!; i++) {
            // push as datetime
            days.push(
                DateTime.fromObject({
                    year: prevMonth.year,
                    month: prevMonth.month,
                    day: i + 1,
                }) as DateTime<true>
            );
        }
        for (let i = 0; i < currentMonthDays!; i++) {
            days.push(
                DateTime.fromObject({
                    year: currentMonth.year,
                    month: currentMonth.month,
                    day: i + 1,
                }) as DateTime<true>
            );
        }
        for (let i = 0; i < nextMonthHead; i++) {
            days.push(
                DateTime.fromObject({
                    year: currentMonth.year,
                    month: currentMonth.month + 1,
                    day: i + 1,
                }) as DateTime<true>
            );
        }
        return days;
    });
    const [events, setEvents] = createSignal([] as Calendar[]);
    function getEvents(startTime: DateTime, endTime: DateTime) {
        getCalendarList(startTime, endTime)
            .then((resp) => {
                setEvents(resp);
            })
            .catch((err: HTTPError) => {
                void err.response.text().then((resp) => {
                    addToast({
                        level: "error",
                        description: `${t("calendar.fetchFailed")}: ${resp}`,
                        duration: 5000,
                    });
                });
            });
    }
    createEffect(() => {
        const startTime = DateTime.fromObject({
            year: year(),
            month: month(),
            day: 1,
        });
        const endTime = startTime.endOf("month");
        getEvents(startTime, endTime);
    });
    createEffect(() => {
        const userSelectedMonth = DateTime.fromObject({
            year: year(),
            month: month(),
            day: 1,
        });
        setSelectedDay(null);
        if (currentDate.year === userSelectedMonth.year && currentDate.month === userSelectedMonth.month) {
            setSelectedDay(currentDate);
        }
    });
    const eventDays = createMemo(() => {
        const days = new Set<DateTime>();
        for (const event of events()) {
            const start = event.start_at;
            const end = event.end_at;
            for (let i = start; i <= end; i = i.set({ day: i.day + 1 })) {
                days.add(i);
            }
        }
        return Array.from(days);
    });
    const selectedDayMappedEvents = createMemo(() => {
        if (selectedDay() === null) {
            return [];
        }
        return events().filter((event) => {
            const start = event.start_at;
            const end = event.end_at;
            return start <= selectedDay()! && end >= selectedDay()!;
        });
    });
    function onDone(calendar: Calendar) {
        addToast({
            level: "success",
            description: selectedEvent() ? t("calendar.saveSuccess")! : t("calendar.createSuccess")!,
            duration: 5000,
        });
        getEvents(
            DateTime.fromObject({ year: year(), month: month(), day: 1 }),
            DateTime.fromObject({ year: year(), month: month(), day: 1 }).endOf("month")
        );
        setSearchParams({ event: calendar.id });
        setInEdit(false);
        setSelectedEvent(calendar);
    }
    function onEdit() {
        setInEdit(true);
    }
    function onDeleted() {
        if (selectedEventId())
            deleteCalendar(selectedEventId()!)
                .then(() => {
                    addToast({
                        level: "success",
                        description: t("calendar.deleteSuccess")!,
                        duration: 5000,
                    });
                    setSelectedEvent(null);
                    getEvents(
                        DateTime.fromObject({ year: year(), month: month(), day: 1 }),
                        DateTime.fromObject({ year: year(), month: month(), day: 1 }).endOf("month")
                    );
                })
                .catch((err: HTTPError) => {
                    void err.response.text().then((resp) => {
                        addToast({
                            level: "error",
                            description: `${t("calendar.deleteFailed")}: ${resp}`,
                            duration: 5000,
                        });
                    });
                });
    }
    return (
        <div class="w-full h-full overflow-hidden flex flex-col lg:flex-row">
            <div class="flex-none flex flex-col p-3 lg:p-6 backdrop-blur sticky top-0 border-r border-r-layer-content/10">
                <Card contentClass="p-2 flex flex-col space-y-2">
                    <div class="flex flex-row space-x-2">
                        <Button
                            class="hidden md:inline-flex"
                            ghost
                            square
                            onClick={() => setYear(year() - 1)}
                            title={t("calendar.jumpToPrevYear")}
                        >
                            <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
                        </Button>
                        <Button
                            ghost
                            square
                            onClick={() => {
                                if (month() === 1) {
                                    setYear(year() - 1);
                                    setMonth(12);
                                } else {
                                    setMonth((month() - 1) as MonthNumbers);
                                }
                            }}
                            title={t("calendar.jumpToPrevMonth")}
                        >
                            <span class="icon-[fluent--chevron-left-20-regular] w-5 h-5" />
                        </Button>
                        <Button
                            ghost
                            class="flex-1"
                            onClick={() => {
                                setYear(currentDate.year);
                                setMonth(currentDate.month);
                            }}
                            title={t("calendar.jumpToToday")}
                        >
                            <span>
                                {year().toString().padStart(4, "0")}-{month().toString().padStart(2, "0")}
                            </span>
                        </Button>
                        <Show when={accountStore.permissions?.includes(Permission.Calendar)}>
                            <Button
                                ghost
                                square
                                onClick={() => {
                                    setInEdit(true);
                                    setSearchParams({ event: null });
                                    setSelectedDay(null);
                                    setSelectedEvent(null);
                                }}
                            >
                                <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                            </Button>
                        </Show>
                        <Button
                            ghost
                            square
                            onClick={() => {
                                if (month() === 12) {
                                    setYear(year() + 1);
                                    setMonth(1);
                                } else {
                                    setMonth((month() + 1) as MonthNumbers);
                                }
                            }}
                            title={t("calendar.jumpToNextMonth")}
                        >
                            <span class="icon-[fluent--chevron-right-20-regular] w-5 h-5" />
                        </Button>
                        <Button
                            class="hidden md:inline-flex"
                            ghost
                            square
                            onClick={() => setYear(year() + 1)}
                            title={t("calendar.jumpToNextYear")}
                        >
                            <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
                        </Button>
                    </div>
                    <Divider class="hidden lg:inline-block" />
                    <div class="hidden lg:grid grid-cols-7 gap-2">
                        {/* first, render sunday to monday */}
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div class="h-12 min-w-12 w-full flex justify-center items-center font-bold opacity-60">
                                {t(convertWeekKey(index))}
                            </div>
                        ))}
                        {/* then, render the days use square button */}
                        {currentMonthDays().map((day) => (
                            <Button
                                ghost={
                                    !(
                                        selectedEvent()?.start_at &&
                                        selectedEvent()!.start_at <= day &&
                                        selectedEvent()?.end_at &&
                                        selectedEvent()!.end_at >= day
                                    ) && !(selectedDay() === day)
                                }
                                square
                                class={`relative ${day.month === month() ? "" : "opacity-30"}`}
                                onClick={() => {
                                    setSelectedDay(day);
                                    setSearchParams({ event: null });
                                }}
                            >
                                <span
                                    classList={{
                                        "text-primary":
                                            currentDate.year === year() &&
                                            currentDate.month === month() &&
                                            currentDate.day === day.day,
                                    }}
                                >
                                    {day.day.toString().padStart(2, "0")}
                                </span>
                                <Show
                                    when={eventDays().find(
                                        (i) => i.day === day.day && i.month === day.month && i.year === day.year
                                    )}
                                >
                                    <span class="absolute h-1 w-3 bottom-2 left-1/2 -translate-x-1/2 flex flex-row space-x-1 bg-primary rounded-full" />
                                </Show>
                            </Button>
                        ))}
                    </div>
                </Card>
                <Divider class="mt-3 mb-1 lg:mt-6 lg:mb-4" />
                <For
                    each={events()}
                    fallback={
                        <div class="mt-2 flex-1 flex flex-row items-center justify-center space-x-2 opacity-60 p-3">
                            <span class="icon-[fluent--person-walking-20-regular] w-5 h-5" />
                            <span>{t("calendar.noGames")}</span>
                        </div>
                    }
                >
                    {(item) => (
                        <Link
                            ghost
                            justify="start"
                            class={`mt-2 ${item.id === selectedEventId() ? "btn-active" : ""}`}
                            href={`/?event=${item.id}`}
                            onClick={() => {
                                setSelectedDay(null);
                                setInEdit(false);
                            }}
                            disabled={selectedEventId() === item.id && selectedEvent()?.id !== item.id}
                        >
                            {/* icon-[fluent--flag-20-regular] icon-[fluent--flag-20-filled] */}
                            <Show
                                when={selectedEventId() === item.id && selectedEvent()?.id !== item.id}
                                fallback={
                                    // text-primary text-base-content
                                    <span
                                        class={`icon-[fluent--flag-20-${
                                            selectedDayMappedEvents().find((s) => s.id === item.id) ||
                                            selectedEventId() === item.id
                                                ? "filled"
                                                : "regular"
                                        }] w-5 h-5 text-${
                                            selectedDayMappedEvents().find((s) => s.id === item.id) ||
                                            selectedEventId() === item.id
                                                ? "primary"
                                                : "layer-content"
                                        }`}
                                    />
                                }
                            >
                                <Spin width={20} height={20} />
                            </Show>
                            <span class="flex-1 text-start">{item.name}</span>
                            <span class="opacity-60">{item.start_at.toFormat("MM-dd")}</span>
                        </Link>
                    )}
                </For>
            </div>
            <OverlayScrollbarsComponent
                options={{
                    scrollbars: {
                        theme: `os-theme-${fullTheme()}`,
                        autoHide: "scroll",
                    },
                }}
                class="flex-1 relative"
                defer
            >
                <div class="flex flex-col items-center w-full min-h-full">
                    <div class="flex flex-col w-full max-w-5xl flex-1 p-3 lg:p-6 space-y-2">
                        <Switch>
                            <Match when={inEdit()}>
                                <EventForm onDone={onDone} editSource={selectedEvent() || undefined} />
                            </Match>
                            <Match when={!inEdit() && selectedEvent() !== null}>
                                <EventDetail event={selectedEvent()!} onEdit={onEdit} onDeleted={onDeleted} />
                            </Match>
                            <Match when={true}>
                                <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                                    <span class="icon-[fluent--flag-20-regular] w-24 h-24" />
                                    <span>{t("calendar.selectGameToSeeDetail")}</span>
                                </div>
                            </Match>
                        </Switch>
                    </div>
                </div>
            </OverlayScrollbarsComponent>
        </div>
    );
}
