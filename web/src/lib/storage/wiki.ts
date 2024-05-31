import type { HTTPError } from "@reverier/ky";
import { createStore } from "solid-js/store";
import { getWikiTree } from "../api/wiki";
import type { Article } from "../models/article";
import { t } from "./theme";
import { addToast } from "./toast";

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
        void (err as HTTPError).response.text().then((reason) => {
            addToast({
                level: "error",
                description: `${t("wiki.fetchTocFailed")}: ${reason}`,
                duration: 5000,
            });
        });
    }
}
