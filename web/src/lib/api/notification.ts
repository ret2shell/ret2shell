import api, { api_root } from ".";
import type { Notification } from "../models/notification";

export async function getNotifications(game_id: number) {
    return await api.get(`${api_root}/game/${game_id}/notification`).json<Notification[]>();
}

export async function createNotification(game_id: number, notification: Notification) {
    return await api.post(`${api_root}/game/${game_id}/notification`, { json: notification }).json<Notification>();
}

export async function deleteNotification(game_id: number, id: number) {
    return await api.delete(`${api_root}/game/${game_id}/notification/${id}`).json<null>();
}
