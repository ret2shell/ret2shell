import type { Article } from "@/lib/models/article";
import { Title } from "@/lib/storage/header";
import { platformStore } from "@/lib/storage/platform";
import { t } from "@/lib/storage/theme";
import { refreshWikiToc } from "@/lib/storage/wiki";
import { useNavigate } from "@solidjs/router";
import CreateForm from "../_blocks/form";

export default function () {
    const navigate = useNavigate();
    function onDone(article: Article) {
        void refreshWikiToc().then(() => {
            navigate(`/wiki/${article.id}`);
        });
    }
    return (
        <>
            <Title title={`${t("form.create")} - ${platformStore.config.name || t("platform.name")}`} />
            <div class="flex-1 flex flex-col">
                <CreateForm onDone={onDone} />
            </div>
        </>
    );
}
