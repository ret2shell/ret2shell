import api, { api_root } from ".";
import type { Article } from "../models/article";

export async function getWikiTree() {
    return await api.get(`${api_root}/wiki`).json<Article[]>();
}

export async function getWiki(id: number) {
    return await api.get(`${api_root}/wiki/${id}`).json<Article>();
}

export async function createWiki(article: Article) {
    return await api.post(`${api_root}/wiki`, { json: article }).json<Article>();
}

export async function updateWiki(article: Article) {
    return await api.patch(`${api_root}/wiki/${article.id}`, { json: article }).json<Article>();
}

export async function deleteWiki(id: number) {
    return await api.delete(`${api_root}/wiki/${id}`).json();
}
