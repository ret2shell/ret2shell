import { Popover } from "@ark-ui/solid";
import { type FormStore, setValue } from "@modular-forms/solid";
import { t } from "@storage/theme";
import clsx from "clsx";
import { DateTime, type MonthNumbers } from "luxon";
import { type ComponentProps, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import Button from "./button";
import Card from "./card";
import Divider from "./divider";
import Input from "./input";

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
  return (
    <Popover.Root autoFocus={false} open={timePickerOpened()} onInteractOutside={() => setTimePickerOpened(false)}>
      <Popover.Anchor>
        <Button
          ghost={!props.active && !timePickerOpened()}
          square
          class="relative"
          disabled={props.disabled}
          onClick={() => {
            if (props.type === "time") {
              setTimePickerOpened(true);
            } else {
              props.onDone(props.date);
            }
          }}
          type="button"
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
              <div class="flex flex-row space-x-2">
                <div class="flex flex-col space-y-2">
                  <Button
                    square
                    ghost
                    type="button"
                    size="sm"
                    onClick={() => {
                      setHour((hour() - 1 + 24) % 24);
                    }}
                  >
                    <span class="icon-[fluent--chevron-up-20-regular] w-5 h-5" />
                  </Button>
                  <Button square ghost type="button" size="sm">
                    {hour().toString().padStart(2, "0")}
                  </Button>
                  <Button
                    square
                    ghost
                    type="button"
                    size="sm"
                    onClick={() => {
                      setHour((hour() + 1) % 24);
                    }}
                  >
                    <span class="icon-[fluent--chevron-down-20-regular] w-5 h-5" />
                  </Button>
                </div>
                <div class="flex flex-col space-y-2">
                  <Button
                    square
                    ghost
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (minute() < 10) {
                        setHour((hour() - 1 + 24) % 24);
                      }
                      setMinute((minute() - 10 + 60) % 60);
                    }}
                  >
                    <span class="icon-[fluent--chevron-up-20-regular] w-5 h-5" />
                  </Button>
                  <Button square ghost type="button" size="sm">
                    {minute().toString().padStart(2, "0")}
                  </Button>
                  <Button
                    square
                    ghost
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (minute() >= 50) {
                        setHour((hour() + 1) % 24);
                      }
                      setMinute((minute() + 10) % 60);
                    }}
                  >
                    <span class="icon-[fluent--chevron-down-20-regular] w-5 h-5" />
                  </Button>
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
          <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
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
          <span class="icon-[fluent--chevron-left-20-regular] w-5 h-5" />
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
          <span class="icon-[fluent--chevron-right-20-regular] w-5 h-5" />
        </Button>
        <Button
          class="hidden md:inline-flex"
          ghost
          type="button"
          square
          onClick={() => setYear(year() + 1)}
          title={t("calendar.actions.nextYear.title")}
        >
          <span class="icon-[fluent--chevron-double-right-20-regular] w-5 h-5" />
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
        {currentMonthDays().map((day) => (
          <TimePickerButton
            active={
              (props.value && day.startOf("day").equals(props.value.startOf("day"))) ||
              (props.value &&
                props.valueNext &&
                day.startOf("day") >= props.value.startOf("day") &&
                day <= props.valueNext.startOf("day")) ||
              undefined
            }
            disabled={!canChoose(day)}
            date={day}
            current={day.month === month()}
            type={props.type}
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
        ))}
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
        icon={<span class="icon-[fluent--calendar-20-regular] w-5 h-5" />}
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
            class="!rounded-l-none"
            type="button"
            onClick={() => {
              setTime(null);
              setTimeNext(null);
            }}
          >
            <span class="icon-[fluent--delete-20-regular] w-5 h-5" />
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
