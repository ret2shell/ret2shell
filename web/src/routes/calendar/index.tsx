import { Calendar } from '@/lib/models/calendar'
import { Permission } from '@/lib/models/user'
import { accountStore } from '@/lib/storage/account'
import { t } from '@/lib/storage/theme'
import Button from '@/lib/widgets/button'
import Card from '@/lib/widgets/card'
import Divider from '@/lib/widgets/divider'
import { DateTime, MonthNumbers } from 'luxon'
import { Show, createMemo, createSignal } from 'solid-js'

export default function () {
  const currentDate = DateTime.now()
  const [year, setYear] = createSignal(currentDate.year)
  const [month, setMonth] = createSignal(currentDate.month)

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
  return (
    <>
      <div class="w-full h-full flex flex-col lg:flex-row">
        <div class="flex-1 lg:flex-none flex flex-col p-6 backdrop-blur">
          <Card contentClass="p-2 flex flex-col space-y-2">
            <div class="flex flex-row space-x-2">
              <Button ghost square onClick={() => setYear(year() - 1)} title={t('calendar.jumpToPrevYear')}>
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
              <Button ghost square onClick={() => setYear(year() + 1)} title={t('calendar.jumpToNextYear')}>
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
                <Button ghost square>
                  <span classList={{ 'opacity-30': !day.current }}>{day.day}</span>
                </Button>
              ))}
            </div>
          </Card>
          <Show when={events().length === 0}>
            <div class="flex-1 flex flex-row items-center justify-center space-x-2 opacity-60">
              <span class="icon-[fluent--person-walking-20-regular] w-5 h-5"></span>
              <span>{t('calendar.noGames')}</span>
            </div>
          </Show>
        </div>
        <Divider direction="vertical" class="hidden lg:inline-block" />
        <div class="hidden lg:flex flex-col flex-1 items-center">
          <div class="flex flex-col w-full max-w-5xl flex-1 p-2">
            <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
              <span class="icon-[fluent--flag-20-regular] w-24 h-24"></span>
              <span>{t('calendar.selectGameToSeeDetail')}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
