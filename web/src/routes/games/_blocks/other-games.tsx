import { t } from "@/lib/storage/theme";
import rxSticker from "@assets/imgs/rx.webp";

export default function () {
    const randomTips = [
        t("platform.notImplementedTips1"),
        t("platform.notImplementedTips2"),
        t("platform.notImplementedTips3"),
    ];
    return (
        <section
            id="other-games"
            class="lg:h-full lg:min-h-full lg:overflow-scroll lg:snap-center flex flex-col relative items-center justify-center space-y-8"
        >
            <img class="rounded-xl" src={rxSticker} alt=">ω<" width={256} height={256} />
            <h1 class="font-bold text-3xl space-x-4">
                <span class="opacity-60">{t("platform.hello")}</span>
                <span class="text-primary">|</span>
                <span>{t("platform.notImplemented")}</span>
            </h1>
            <p class="opacity-60">{randomTips[Math.floor(Math.random() * randomTips.length)]}</p>
        </section>
    );
}
