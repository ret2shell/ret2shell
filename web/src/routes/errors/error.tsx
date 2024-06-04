import { t } from "@/lib/storage/theme";
import xdsecMascotCrying from "@assets/imgs/xdsec-mascot-crying.webp";
import xdsecMascotUnsee from "@assets/imgs/xdsec-mascot-unsee.webp";
import { Show } from "solid-js";

export default function (props: { status: number | null }) {
    const messages: Record<number, string> = {
        401: t("errors.401")!,
        403: t("errors.403")!,
        404: t("errors.404")!,
        418: t("errors.418")!,
        500: t("errors.500")!,
        502: t("errors.502")!,
    };

    const tips: Record<number, string> = {
        401: t("errors.401Tip")!,
        403: t("errors.403Tip")!,
        404: t("errors.404Tip")!,
        418: t("errors.418Tip")!,
        500: t("errors.500Tip")!,
        502: t("errors.502Tip")!,
    };

    const message = () => messages[props.status!] || t("errors.unknown")!;
    const tip = () => tips[props.status!] || t("errors.unknownTip")!;

    return (
        <div class="flex-1 flex flex-col items-center justify-center space-y-8">
            <img
                src={(props.status || 500) >= 500 ? xdsecMascotCrying : xdsecMascotUnsee}
                width={256}
                height={256}
                alt="TωT"
            />
            <h1 class="font-bold text-3xl space-x-4">
                <span class="opacity-60">{props.status}</span>
                <span class="text-primary">|</span>
                <span>{message()}</span>
            </h1>
            <p class="opacity-60">{tip()}</p>
            <Show when={props.status && props.status >= 500}>
                <p class="flex space-x-2">
                    <span class="opacity-60">{t("errors.gotoDocs")}</span>
                    <a
                        href="/docs"
                        class="flex flex-row space-x-2 items-center hover:underline"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <span class="opacity-60">{t("docs.title")}</span>
                        <span class="icon-[fluent--open-16-regular] w-4 h-4 text-primary" />
                    </a>
                </p>
            </Show>
        </div>
    );
}
