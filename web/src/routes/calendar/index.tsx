import { getCalendar, getCalendarList } from '@/lib/api/calendar'
import Spin from '@/lib/assets/animates/spin'
import { Calendar } from '@/lib/models/calendar'
import { Permission } from '@/lib/models/user'
import { accountStore } from '@/lib/storage/account'
import { t } from '@/lib/storage/theme'
import Article from '@/lib/widgets/article'
import Button from '@/lib/widgets/button'
import Card from '@/lib/widgets/card'
import Divider from '@/lib/widgets/divider'
import Link from '@/lib/widgets/link'
import { useSearchParams } from '@solidjs/router'
import { DateTime, MonthNumbers } from 'luxon'
import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'

export default function () {
  const currentDate = DateTime.now()
  const [year, setYear] = createSignal(currentDate.year)
  const [month, setMonth] = createSignal(currentDate.month)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedEventId = createMemo(() => {
    if (searchParams && searchParams.event) {
      try {
        return parseInt(searchParams.event!)
      } catch {
        return null
      }
    }
    return null
  })
  const [selectedEvent, setSelectedEvent] = createSignal<Calendar | null>(null)
  createEffect(() => {
    if (selectedEventId()) {
      setSelectedEvent(null)
      getCalendar(selectedEventId()!).then(resp => {
        setSelectedEvent(resp)
      })
    } else {
      setSelectedEvent(null)
    }
  })

  const [selectedDay, setSelectedDay] = createSignal(currentDate.day as null | number)

  function convertWeekKey(weekKey: number) {
    switch (weekKey) {
      case 0:
        return 'calendar.day.sun'
      case 1:
        return 'calendar.day.mon'
      case 2:
        return 'calendar.day.tue'
      case 3:
        return 'calendar.day.wed'
      case 4:
        return 'calendar.day.thu'
      case 5:
        return 'calendar.day.fri'
      case 6:
        return 'calendar.day.sat'
      default:
        return 'calendar.day.sun'
    }
  }
  const currentMonthDays = createMemo(() => {
    // should starts at prev month's tail, from sunday, end with next month's head, to saturday
    const days = []
    const cDate = DateTime.fromObject({ year: year(), month: month(), day: 1 })
    const prevMonth = cDate.minus({ month: 1 })
    const currentMonth = cDate
    const currentMonthDays = currentMonth.daysInMonth
    let currentMonthFirstDay = currentMonth.startOf('month').weekday
    if (currentMonthFirstDay === 7) {
      currentMonthFirstDay = 0
    }
    const prevMonthDays = prevMonth.daysInMonth
    const prevMonthTail = prevMonthDays! - currentMonthFirstDay
    const nextMonthHead = (7 - ((currentMonthFirstDay + currentMonthDays!) % 7)) % 7
    for (let i = prevMonthTail; i < prevMonthDays!; i++) {
      days.push({ day: i + 1, current: false })
    }
    for (let i = 0; i < currentMonthDays!; i++) {
      days.push({ day: i + 1, current: true })
    }
    for (let i = 0; i < nextMonthHead; i++) {
      days.push({ day: i + 1, current: false })
    }
    return days
  })
  const [events, setEvents] = createSignal([] as Calendar[])
  function getEvents(startTime: DateTime, endTime: DateTime) {
    getCalendarList(startTime, endTime).then(resp => {
      setEvents(resp)
    })
  }
  createEffect(() => {
    const startTime = DateTime.fromObject({ year: year(), month: month(), day: 1 })
    const endTime = startTime.endOf('month')
    getEvents(startTime, endTime)
  })
  const eventDays = createMemo(() => {
    const days = new Set<number>()
    events().forEach(event => {
      const start = event.start_at
      let startDay = start.day
      if (start.month !== month()) {
        startDay = 1
      }
      const end = event.end_at
      let endDay = end.day
      if (end.month !== month()) {
        endDay = end.endOf('month').day
      }
      for (let i = startDay; i <= endDay; i++) {
        days.add(i)
      }
    })
    return days
  })
  const selectedDayMappedEvents = createMemo(() => {
    if (selectedDay() === null) {
      return []
    }
    return events().filter(event => {
      const start = event.start_at
      let startDay = start.day
      if (start.month !== month()) {
        startDay = 1
      }
      const end = event.end_at
      let endDay = end.day
      if (end.month !== month()) {
        endDay = end.endOf('month').day
      }
      return startDay <= selectedDay()! && endDay >= selectedDay()!
    })
  })
  return (
    <>
      <div class="w-full h-full flex flex-col lg:flex-row">
        <div class="flex-none flex flex-col p-3 lg:p-6 backdrop-blur">
          <Card contentClass="p-2 flex flex-col space-y-2">
            <div class="flex flex-row space-x-2">
              <Button
                class="hidden md:inline-flex"
                ghost
                square
                onClick={() => setYear(year() - 1)}
                title={t('calendar.jumpToPrevYear')}
              >
                <span class="icon-[fluent--chevron-double-left-20-regular] w-5 h-5" />
              </Button>
              <Button
                ghost
                square
                onClick={() => {
                  if (month() === 1) {
                    setYear(year() - 1)
                    setMonth(12)
                  } else {
                    setMonth((month() - 1) as MonthNumbers)
                  }
                }}
                title={t('calendar.jumpToPrevMonth')}
              >
                <span class="icon-[fluent--chevron-left-20-regular] w-5 h-5" />
              </Button>
              <Button
                ghost
                class="flex-1"
                onClick={() => {
                  setYear(currentDate.year)
                  setMonth(currentDate.month)
                }}
                title={t('calendar.jumpToToday')}
              >
                <span>
                  {year().toString().padStart(4, '0')}-{month().toString().padStart(2, '0')}
                </span>
              </Button>
              <Show when={accountStore.permissions?.includes(Permission.Calendar)}>
                <Button ghost square onClick={() => {}}>
                  <span class="icon-[fluent--add-20-regular] w-5 h-5" />
                </Button>
              </Show>
              <Button
                ghost
                square
                onClick={() => {
                  if (month() === 12) {
                    setYear(year() + 1)
                    setMonth(1)
                  } else {
                    setMonth((month() + 1) as MonthNumbers)
                  }
                }}
                title={t('calendar.jumpToNextMonth')}
              >
                <span class="icon-[fluent--chevron-right-20-regular] w-5 h-5" />
              </Button>
              <Button
                class="hidden md:inline-flex"
                ghost
                square
                onClick={() => setYear(year() + 1)}
                title={t('calendar.jumpToNextYear')}
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
              {currentMonthDays().map(day => (
                <Button
                  ghost={
                    !(
                      day.current &&
                      selectedEvent()?.start_at &&
                      selectedEvent()!.start_at.day <= day.day &&
                      selectedEvent()?.end_at &&
                      selectedEvent()!.end_at.day >= day.day
                    ) && !(day.current && selectedDay() === day.day)
                  }
                  square
                  class="relative"
                  onClick={() => {
                    setSelectedDay(day.day)
                    setSearchParams({ event: null })
                  }}
                >
                  <span
                    classList={{
                      'opacity-30': !day.current,
                      'text-primary':
                        currentDate.year === year() && currentDate.month === month() && currentDate.day === day.day,
                    }}
                  >
                    {day.day}
                  </span>
                  <Show when={day.current && eventDays().has(day.day)}>
                    <span class="absolute h-1 w-3 bottom-2 left-1/2 -translate-x-1/2 flex flex-row space-x-1 bg-primary rounded-full"></span>
                  </Show>
                </Button>
              ))}
            </div>
          </Card>
          <Divider class="mt-3 mb-1 lg:mt-6 lg:mb-4" />
          <Show when={events().length === 0}>
            <div class="mt-2 flex-1 flex flex-row items-center justify-center space-x-2 opacity-60 p-3">
              <span class="icon-[fluent--person-walking-20-regular] w-5 h-5"></span>
              <span>{t('calendar.noGames')}</span>
            </div>
          </Show>
          <For each={events()}>
            {item => (
              <>
                <Link
                  ghost
                  justify="start"
                  class={`mt-2 ${item.id === selectedEventId() ? 'btn-active' : ''}`}
                  href={`/?event=${item.id}`}
                  onClick={() => {
                    setSelectedDay(null)
                  }}
                  disabled={selectedEventId() === item.id && selectedEvent()?.id !== item.id}
                >
                  {/* icon-[fluent--flag-20-regular] icon-[fluent--flag-20-filled] */}
                  <Show
                    when={selectedEventId() === item.id && selectedEvent()?.id !== item.id}
                    fallback={
                      // text-primary text-base-content
                      <span
                        class={`icon-[fluent--flag-20-${selectedDayMappedEvents().find(s => s.id === item.id) ? 'filled' : 'regular'}] w-5 h-5 text-${selectedDayMappedEvents().find(s => s.id === item.id) ? 'primary' : 'layer-content'}`}
                      ></span>
                    }
                  >
                    <Spin width={20} height={20}></Spin>
                  </Show>
                  <span class="flex-1 text-start">{item.name}</span>
                  <span class="opacity-60">{item.start_at.toFormat('MM-dd')}</span>
                </Link>
              </>
            )}
          </For>
        </div>
        <Divider class="lg:divider-vertical" />
        <div class="flex flex-col flex-1 items-center">
          <div class="flex flex-col w-full max-w-5xl flex-1 p-2 space-y-2">
            <Show
              when={selectedEvent() !== null}
              fallback={
                <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                  <span class="icon-[fluent--flag-20-regular] w-24 h-24"></span>
                  <span>{t('calendar.selectGameToSeeDetail')}</span>
                </div>
              }
            >
              <h1 class="text-3xl text-center font-bold mt-8 hover:underline">
                <a href={selectedEvent()?.link} target="_blank">
                  {selectedEvent()?.name}
                </a>
              </h1>
              <div class="flex flex-row items-center justify-center space-x-6 opacity-60 flex-wrap">
                <a
                  class="font-bold hover:underline flex flex-row space-x-2 items-center"
                  href={`/users/${selectedEvent()?.reporter_id}`}
                >
                  <span class="icon-[fluent--person-20-regular] w-5 h-5"></span>
                  <span>{t('calendar.addBy', { name: selectedEvent()?.reporter_name || t('calendar.unknown')! })}</span>
                  <span></span>
                </a>
                <a
                  class="font-bold hover:underline flex flex-row space-x-2 items-center"
                  href={selectedEvent()?.link}
                  target="_blank"
                >
                  <span class="icon-[fluent--link-20-regular] w-5 h-5"></span>
                  <span>{t('calendar.gotoEventHomePage')}</span>
                </a>
              </div>
              <Article content={selectedEvent()?.intro || ''} extra headingAnchors />
            </Show>
          </div>
        </div>
      </div>
    </>
  )
}
