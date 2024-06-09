import type { Captcha } from "@models/captcha";
import type { User } from "@models/user";
import api, { api_root } from ".";
import type { Institute } from "../models/institute";
import type { DateTime } from "luxon";

export async function getCaptcha() {
    return await api.get(`${api_root}/account/captcha`).json<Captcha>();
}

export async function register(req: {
    account: string;
    nickname: string;
    email: string;
    password: string;
    captcha_id: string;
    captcha_answer: string;
}) {
    return await api.post(`${api_root}/account/register`, { json: req }).json();
}

export async function login(req: {
    account: string;
    password: string;
    captcha_id: string;
    captcha_answer: string;
}) {
    return await api.post(`${api_root}/account/login`, { json: req }).json();
}

export async function logout() {
    return await api.post(`${api_root}/account/logout`).json();
}

export async function forgotPassword(req: {
    email: string;
    captcha_id: string;
    captcha_answer: string;
}) {
    return await api.post(`${api_root}/account/forgot`, { json: req }).json();
}

export async function resetPassword(req: {
    email: string;
    password: string;
    token: string;
    captcha_id: string;
    captcha_answer: string;
}) {
    return await api.post(`${api_root}/account/reset`, { json: req }).json();
}

export async function verifyEmail(req: { token: string; email: string }) {
    return await api.post(`${api_root}/account/verify`, { json: req }).json();
}

export async function resendEmail() {
    return await api.patch(`${api_root}/account/verify`).json();
}

export async function getProfile() {
    return await api.get(`${api_root}/account/profile`).json<User>();
}

export async function changeProfile(req: User) {
    return await api.patch(`${api_root}/account/profile`, { json: req }).json();
}

export async function deleteSelf() {
    return await api.delete(`${api_root}/account/profile`).json();
}

export async function getInstitutes() {
    return await api.get(`${api_root}/account/institute`).json<Institute[]>();
}

export async function getAccountCode() {
    return await api.get(`${api_root}/account/code`).json<{ code: number; generate_at: DateTime } | null>();
}

export async function generateAccountCode() {
    return await api.post(`${api_root}/account/code`).json<{ code: number; generate_at: DateTime }>();
}
