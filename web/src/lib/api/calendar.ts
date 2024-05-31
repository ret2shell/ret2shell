import type { DateTime } from "luxon";
import api, { api_root } from ".";
import type { Calendar } from "../models/calendar";

export async function getCalendarList(start_time: DateTime, end_time: DateTime) {
    return (
        await api.get(`${api_root}/calendar`, {
            searchParams: {
                start_time: Math.floor(start_time.toSeconds()),
                end_time: Math.floor(end_time.toSeconds()),
            },
        })
    ).json<Calendar[]>();
}

export async function getCalendar(id: number) {
    return await api.get(`${api_root}/calendar/${id}`).json<Calendar>();
}

export async function createCalendar(calendar: Calendar) {
    return await api.post(`${api_root}/calendar`, { json: calendar }).json<Calendar>();
}

export async function updateCalendar(calendar: Calendar) {
    return await api.patch(`${api_root}/calendar/${calendar.id}`, { json: calendar }).json<Calendar>();
}

export async function deleteCalendar(id: number) {
    return await api.delete(`${api_root}/calendar/${id}`).json();
}
