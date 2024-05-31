import type { Article } from "@/lib/models/article";
import { Permission } from "@/lib/models/user";
import { accountStore } from "@/lib/storage/account";
import { t } from "@/lib/storage/theme";
import { useNavigate } from "@solidjs/router";
import CreateForm from "./_blocks/form";

export default function () {
    const navigate = useNavigate();
    if (!accountStore.permissions.includes(Permission.Bulletin)) {
        navigate("/errors/403", { replace: true });
    }
    function onDone(article: Article) {
        navigate(`/bulletin/${article.id}`);
    }
    return (
        <>
            <h1 class="text-3xl text-center flex flex-row space-x-4 items-center justify-center font-bold mt-8">
                <span>
                    {t("bulletin.create")} - {t("bulletin.title")}
                </span>
            </h1>
            <CreateForm onDone={onDone} />
        </>
    );
}
