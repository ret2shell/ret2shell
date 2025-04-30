import { handleHttpError } from "@api";
import { getWikiTree } from "@api/wiki";
import type { Article } from "@models/article";
import type { HTTPError } from "ky";
import { createStore } from "solid-js/store";
import { t } from "./theme";

export const [wikiStore, setWikiStore] = createStore({
  toc: [] as Article[],
  current: null as Article | null,
});

export async function refreshWikiToc() {
  try {
    let resp = await getWikiTree();
    resp = resp.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    setWikiStore({ toc: resp });
  } catch (err) {
    handleHttpError(err as HTTPError, t("wiki.errors.fetchToc.title")!);
  }
}
