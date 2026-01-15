import { Popover } from "@ark-ui/solid";
import { type FormStore, setValue } from "@modular-forms/solid";
import { t } from "@storage/theme";
import clsx from "clsx";
import { DateTime, type MonthNumbers } from "luxon";
import { type ComponentProps, createEffect, createMemo, createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import Button from "./button";
import Card from "./card";
import Divider from "./divider";
import Input from "./input";

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

type TimePickerPropsRange =
  | {
      range: false;
      name: string;
      value?: number;
    }
  | {
      range: true;
      name: string;
      value?: number;
      nameNext: string;
      valueNext?: number;
    };

export type TimerPickerProps = {
  // biome-ignore lint/suspicious/noExplicitAny: the options are not ensured
  form: FormStore<any, undefined>;
  type: "time" | "date";
  error?: string;
  title?: string;
  placeholder?: string;
  startEdge?: DateTime;
  endEdge?: DateTime;
  reverseEdge?: boolean;
} & TimePickerPropsRange;

function TimePickerButton(props: {
  active?: boolean;
  date: DateTime;
  current: boolean;
  type: "time" | "date";
  disabled?: boolean;
  onDone: (date: DateTime) => void;
  previewActive?: boolean;
  previewEdge?: boolean;
  onHover?: (date: DateTime) => void;
  onHoverEnd?: () => void;
}) {
  let currentDate = DateTime.now();
  currentDate = currentDate.set({
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const [timePickerOpened, setTimePickerOpened] = createSignal(false);
  const [hour, setHour] = createSignal(props.date.hour);
  const [minute, setMinute] = createSignal(props.date.minute);
  let hourColumnRef: HTMLDivElement | undefined;
  let minuteColumnRef: HTMLDivElement | undefined;
  let lastHourWheel = 0;
  let lastMinuteWheel = 0;

  function changeHour(delta: number) {
    setHour((hour() + delta + 24) % 24);
  }

  function changeMinute(delta: number) {
    setMinute((minute() + delta + 60) % 60);
  }

  function scrollToSelected(container: HTMLDivElement | undefined, selector: string) {
    const target = container?.querySelector(selector);
    if (!target || !container || !(target instanceof HTMLElement)) return;
    const desiredTop = target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
    container.scrollTo({ top: desiredTop, behavior: "smooth" });
  }

  createEffect(() => {
    if (!timePickerOpened()) return;
    scrollToSelected(hourColumnRef, `[data-hour="${Number(hour())}"]`);
  });
  createEffect(() => {
    if (!timePickerOpened()) return;
    scrollToSelected(minuteColumnRef, `[data-minute="${Number(minute())}"]`);
  });
  return (
    <Popover.Root autoFocus={false} open={timePickerOpened()} onInteractOutside={() => setTimePickerOpened(false)}>
      <Popover.Anchor>
        <Button
          ghost={!props.active && !props.previewActive && !timePickerOpened()}
          square
          class="relative"
          disabled={props.disabled}
          onClick={() => {
            if (props.type === "time") {
              if (props.range && props.value && !props.valueNext) {
                setHour(props.value.hour);
                setMinute(props.value.minute);
              }
              setTimePickerOpened(true);
              queueMicrotask(() => {
                scrollToSelected(hourColumnRef, `[data-hour="${Number(hour())}"]`);
                scrollToSelected(minuteColumnRef, `[data-minute="${Number(minute())}"]`);
              });
            } else {
              props.onDone(props.date);
            }
          }}
          type="button"
          onMouseEnter={() => {
            if (!props.disabled) props.onHover?.(props.date);
          }}
          onMouseLeave={() => {
            if (!props.disabled) props.onHoverEnd?.();
          }}
          classList={{
            "btn-active": props.previewActive && !props.active,
            "ring-2 ring-primary": props.previewEdge,
          }}
        >
          <span
            classList={{
              "opacity-30": !props.current,
              "text-primary": currentDate.equals(props.date),
            }}
          >
            {props.date.day.toString().padStart(2, "0")}
          </span>
        </Button>
      </Popover.Anchor>
      <Portal>
        <Popover.Positioner>
          <Popover.Content class="card">
            <div class="card-content p-2 flex flex-col space-y-2">
              <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div
                  class="relative w-24"
                  role="spinbutton"
                  aria-label="hour"
                  aria-valuemin="0"
                  aria-valuemax="23"
                  aria-valuenow={hour()}
                  tabIndex={0}
                  onWheel={(event) => {
                    event.preventDefault();
                    const now = Date.now();
                    if (now - lastHourWheel < 50) return;
                    lastHourWheel = now;
                    changeHour(event.deltaY > 0 ? 1 : -1);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      changeHour(-1);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      changeHour(1);
                    }
                  }}
                >
                  <div class="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-md border border-primary/30 bg-primary/10 h-10 shadow-sm" />
                  <div
                    ref={hourColumnRef}
                    class="max-h-48 overflow-y-auto scroll-smooth snap-y snap-mandatory pr-1 space-y-1"
                  >
                    {HOURS.map((item) => (
                      <button
                        type="button"
                        data-hour={item}
                        class={clsx(
                          "w-full py-2 rounded-md text-center transition-all duration-150 snap-center",
                          "bg-layer-content/5 text-layer-content/80 hover:bg-layer-content/10"
                        )}
                        classList={{
                          "bg-primary text-primary-content shadow-md": hour() === item,
                          "font-bold": hour() === item,
                        }}
                        onClick={() => setHour(item)}
                      >
                        {item.toString().padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                </div>
                <div class="text-lg font-bold text-layer-content/60">:</div>
                <div
                  class="relative w-24"
                  role="spinbutton"
                  aria-label="minute"
                  aria-valuemin="0"
                  aria-valuemax="59"
                  aria-valuenow={minute()}
                  tabIndex={0}
                  onWheel={(event) => {
                    event.preventDefault();
                    const now = Date.now();
                    if (now - lastMinuteWheel < 50) return;
                    lastMinuteWheel = now;
                    changeMinute(event.deltaY > 0 ? 1 : -1);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      changeMinute(-1);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      changeMinute(1);
                    }
                  }}
                >
                  <div class="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-md border border-primary/30 bg-primary/10 h-10 shadow-sm" />
                  <div
                    ref={minuteColumnRef}
                    class="max-h-48 overflow-y-auto scroll-smooth snap-y snap-mandatory pr-1 space-y-1"
                  >
                    {MINUTES.map((item) => (
                      <button
                        type="button"
                        data-minute={item}
                        class={clsx(
                          "w-full py-2 rounded-md text-center transition-all duration-150 snap-center",
                          "bg-layer-content/5 text-layer-content/80 hover:bg-layer-content/10"
                        )}
                        classList={{
                          "bg-primary text-primary-content shadow-md": minute() === item,
                          "font-bold": minute() === item,
                        }}
                        onClick={() => setMinute(item)}
                      >
                        {item.toString().padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                level="primary"
                type="button"
                size="sm"
                onClick={() => {
                  setTimePickerOpened(false);
                  props.onDone(
                    DateTime.fromObject({
                      year: props.date.year,
                      month: props.date.month,
                      day: props.date.day,
                      hour: hour(),
                      minute: minute(),
                    })
                  );
                }}
              >
                OK
              </Button>
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

function PickerCalendar(props: {
  type: "time" | "date";
  value: DateTime | null;
  setValue: (value: DateTime | null) => void;
  valueNext: DateTime | null;
  setValueNext: (value: DateTime | null) => void;
  range?: boolean;
  startEdge?: DateTime;
  endEdge?: DateTime;
  reverseEdge?: boolean;
}) {
  let currentDate = DateTime.now();
  // only keep date
  currentDate = currentDate.set({
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const [year, setYear] = createSignal(currentDate.year);
  const [month, setMonth] = createSignal(currentDate.month);
  const [hoverDate, setHoverDate] = createSignal<DateTime | null>(null);

  createEffect(() => {
    if (!props.range || props.valueNext || !props.value) {
      setHoverDate(null);
    }
  });

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

  function canChoose(day: DateTime) {
    // if startEdge is set, then the day should be later than startEdge
    if (props.startEdge && day.set({ hour: 0, minute: 0 }) < props.startEdge.set({ hour: 0, minute: 0 })) {
      return !!props.reverseEdge;
    }
    // if endEdge is set, then the day should be earlier than endEdge
    if (props.endEdge && day.set({ hour: 0, minute: 0 }) > props.endEdge.set({ hour: 0, minute: 0 })) {
      return !!props.reverseEdge;
    }
    if (props.reverseEdge && props.startEdge && props.endEdge) {
      return (
        day.set({ hour: 0, minute: 0 }) < props.startEdge.set({ hour: 0, minute: 0 }) ||
        day.set({ hour: 0, minute: 0 }) > props.endEdge.set({ hour: 0, minute: 0 })
      );
    }
    return true;
  }
  return (
    <>
      <div class="flex flex-row space-x-2">
        <Button
          class="hidden md:inline-flex"
          ghost
          square
          type="button"
          onClick={() => setYear(year() - 1)}
          title={t("calendar.actions.prevYear.title")}
        >
          <span class="shrink-0 icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
        </Button>
        <Button
          ghost
          square
          type="button"
          onClick={() => {
            if (month() === 1) {
              setYear(year() - 1);
              setMonth(12);
            } else {
              setMonth((month() - 1) as MonthNumbers);
            }
          }}
          title={t("calendar.actions.prevMonth.title")}
        >
          <span class="shrink-0 icon-[fluent--chevron-left-20-regular] w-5 h-5" />
        </Button>
        <Button
          ghost
          class="flex-1"
          type="button"
          onClick={() => {
            setYear(currentDate.year);
            setMonth(currentDate.month);
          }}
          title={t("calendar.actions.today.title")}
        >
          <span>
            {year().toString().padStart(4, "0")}-{month().toString().padStart(2, "0")}
          </span>
        </Button>
        <Button
          ghost
          square
          type="button"
          onClick={() => {
            if (month() === 12) {
              setYear(year() + 1);
              setMonth(1);
            } else {
              setMonth((month() + 1) as MonthNumbers);
            }
          }}
          title={t("calendar.actions.nextMonth.title")}
        >
          <span class="shrink-0 icon-[fluent--chevron-right-20-regular] w-5 h-5" />
        </Button>
        <Button
          class="hidden md:inline-flex"
          ghost
          type="button"
          square
          onClick={() => setYear(year() + 1)}
          title={t("calendar.actions.nextYear.title")}
        >
          <span class="shrink-0 icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
        </Button>
      </div>
      <Divider class="hidden lg:inline-block" />
      <div class="grid grid-cols-7 gap-2 justify-items-center">
        {/* first, render sunday to monday */}
        {Array.from({ length: 7 }).map((_, index) => (
          <div class="h-12 min-w-12 w-full flex justify-center items-center font-bold opacity-60">
            {t(convertWeekKey(index))}
          </div>
        ))}
        {/* then, render the days use square button */}
        {(() => {
          const rangeStart =
            props.value && props.valueNext
              ? DateTime.min(props.value.startOf("day"), props.valueNext.startOf("day"))
              : null;
          const rangeEnd =
            props.value && props.valueNext
              ? DateTime.max(props.value.startOf("day"), props.valueNext.startOf("day"))
              : null;
          const hover = hoverDate();
          const previewStart =
            props.range && props.value && !props.valueNext && hover
              ? DateTime.min(props.value.startOf("day"), hover.startOf("day"))
              : null;
          const previewEnd =
            props.range && props.value && !props.valueNext && hover
              ? DateTime.max(props.value.startOf("day"), hover.startOf("day"))
              : null;
          return currentMonthDays().map((day) => {
            const dayStart = day.startOf("day");
            const isSingleSelected = !!(props.value && dayStart.equals(props.value.startOf("day")));
            const inSelectedRange = !!(rangeStart && rangeEnd && dayStart >= rangeStart && dayStart <= rangeEnd);
            const inPreviewRange =
              !!(previewStart && previewEnd && dayStart >= previewStart && dayStart <= previewEnd);
            const previewEdge =
              !!previewStart && !!previewEnd && (dayStart.equals(previewStart) || dayStart.equals(previewEnd));
            return (
              <TimePickerButton
                active={isSingleSelected || inSelectedRange || undefined}
                disabled={!canChoose(day)}
                date={day}
                current={day.month === month()}
                type={props.type}
                previewActive={inPreviewRange}
                previewEdge={previewEdge}
                onHover={(hovered) => {
                  if (props.range && props.value && !props.valueNext) {
                    setHoverDate(hovered.startOf("day"));
                  }
                }}
                onHoverEnd={() => {
                  if (props.range && props.value && !props.valueNext) {
                    setHoverDate(null);
                  }
                }}
                onDone={(date) => {
                  if (props.range && props.value && props.valueNext) {
                    props.setValue(null);
                    props.setValueNext(null);
                  } else if (!props.range && props.value) {
                    props.setValue(null);
                  }
                  if (props.range && props.value) {
                    if (date < props.value) {
                      props.setValueNext(props.value);
                      props.setValue(date);
                    } else {
                      props.setValueNext(date);
                    }
                  } else {
                    props.setValue(date);
                  }
                }}
              />
            );
          });
        })()}
      </div>
    </>
  );
}

export default function TimePicker(props: TimerPickerProps & ComponentProps<"div">) {
  const [time, setTime] = createSignal(null as DateTime | null);
  const [timeNext, setTimeNext] = createSignal(null as DateTime | null);
  createEffect(() => {
    if (props.value) setTime(DateTime.fromSeconds(props.value));
    else setTime(null);
  });
  createEffect(() => {
    if (props.range && props.valueNext) setTimeNext(DateTime.fromSeconds(props.valueNext));
    else setTimeNext(null);
  });
  createEffect(() => {
    setValue(props.form, props.name, time() ? time()!.toSeconds() : undefined);
  });
  createEffect(() => {
    if (props.range) {
      setValue(props.form, props.nameNext, timeNext() ? timeNext()!.toSeconds() : undefined);
    }
  });
  return (
    <div class={clsx("flex flex-col", props.class)}>
      <input class="hidden" type="number" value={props.value} name={props.name} />
      <Show when={props.range}>
        <input
          class="hidden"
          type="number"
          value={(props.range && props.valueNext) || undefined}
          name={(props.range && props.nameNext) || undefined}
        />
      </Show>
      <Input
        icon={<span class="shrink-0 icon-[fluent--calendar-20-regular] w-5 h-5" />}
        readOnly
        title={props.title}
        placeholder={props.placeholder}
        error={props.error}
        value={
          (time()?.toFormat(props.type === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm") || t("calendar.startAt")) +
          (props.range
            ? ` => ${
                timeNext()?.toFormat(props.type === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm") || t("calendar.endAt")
              }`
            : "")
        }
        extraBtn={
          <Button
            class="rounded-l-none!"
            type="button"
            onClick={() => {
              setTime(null);
              setTimeNext(null);
            }}
          >
            <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5" />
          </Button>
        }
      />
      <Card class="mt-2 card-field" contentClass="p-2 flex flex-col space-y-2">
        <PickerCalendar
          value={time()}
          setValue={setTime}
          valueNext={timeNext()}
          setValueNext={setTimeNext}
          range={props.range}
          type={props.type}
          startEdge={props.startEdge}
          endEdge={props.endEdge}
          reverseEdge={props.reverseEdge}
        />
      </Card>
    </div>
  );
}
