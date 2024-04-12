import { DateTime } from 'luxon'
import { Calendar } from '../models/calendar'
import api, { api_root } from '.'

export async function getCalendarList(startTime: DateTime, endTime: DateTime) {
  return (
    await api.get(
      `${api_root}/calendar?start_time=${Math.floor(startTime.toSeconds())}&end_time=${Math.floor(endTime.toSeconds())}`
    )
  ).json<Calendar[]>()
}

export async function getCalendar(id: number) {
  return await api.get(`${api_root}/calendar/${id}`).json<Calendar>()
}
