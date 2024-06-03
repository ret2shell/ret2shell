import { t } from "@/lib/storage/theme";
import Divider from "@/lib/widgets/divider";
import Link from "@/lib/widgets/link";

export default function SideBar() {
    return (
        <ul class="flex flex-col space-y-2 p-3 lg:p-6">
            <li class="w-full">
                <Link activeMatch="exact" class="w-full" ghost href="/account/settings/info" justify="start">
                    <span class="icon-[fluent--info-20-regular] w-5 h-5" />
                    <span>{t("account.settings.info.title")}</span>
                </Link>
            </li>
            <li class="w-full">
                <Link activeMatch="exact" class="w-full" ghost href="/account/settings/oauth" justify="start">
                    <span class="icon-[fluent--lock-closed-key-20-regular] w-5 h-5" />
                    <span>{t("account.settings.oauth.title")}</span>
                </Link>
            </li>
            <li class="w-full">
                <Link activeMatch="exact" class="w-full" ghost href="/account/settings/institute" justify="start">
                    <span class="icon-[fluent--hat-graduation-20-regular] w-5 h-5" />
                    <span>{t("account.settings.institute.title")}</span>
                </Link>
            </li>
            <Divider />
            <li class="w-full">
                <Link
                    activeMatch="exact"
                    class="w-full"
                    ghost
                    href="/account/settings/mov-esp-ebp-pop-ebp"
                    level="error"
                    justify="start"
                >
                    <span class="icon-[fluent--person-walking-20-regular] w-5 h-5" />
                    <span>{t("account.settings.delete.title")}</span>
                </Link>
            </li>
        </ul>
    );
}
