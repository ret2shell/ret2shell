import { DateTime } from 'luxon'
import { Calendar } from '../models/calendar'
import api, { api_root } from '.'

export async function getCalendarList(start_time: DateTime, end_time: DateTime) {
  return (
    await api.get(`${api_root}/calendar`, {
      searchParams: {
        start_time: Math.floor(start_time.toSeconds()),
        end_time: Math.floor(end_time.toSeconds()),
      },
    })
  ).json<Calendar[]>()
}

export async function getCalendar(id: number) {
  return await api.get(`${api_root}/calendar/${id}`).json<Calendar>()
}

export async function createCalendar(calendar: Calendar) {
  return await api.post(`${api_root}/calendar`, { json: calendar }).json<Calendar>()
}

export async function updateCalendar(calendar: Calendar) {
  return await api.put(`${api_root}/calendar/${calendar.id}`, { json: calendar }).json<Calendar>()
}

export async function deleteCalendar(id: number) {
  return await api.delete(`${api_root}/calendar/${id}`).json()
}
