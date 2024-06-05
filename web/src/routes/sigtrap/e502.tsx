import { Title } from "@/lib/storage/header";
import { platformStore } from "@/lib/storage/platform";
import { t } from "@/lib/storage/theme";
import ErrorSection from "./error";

export default function () {
    return (
        <>
            <Title title={`${t("errors.502")} - ${platformStore.config.name || t("platform.name")}`} />
            <ErrorSection status={502} />
        </>
    );
}
