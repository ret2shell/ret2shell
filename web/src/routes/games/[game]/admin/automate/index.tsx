import { gameStore } from "@/lib/storage/game";
import { t } from "@/lib/storage/theme";
import Card from "@/lib/widgets/card";
import Clipboard from "@/lib/widgets/clipboard";
import Divider from "@/lib/widgets/divider";
import { For, createSignal } from "solid-js";

export default function () {
    const [linkedDevices, setLinkedDevices] = createSignal(
        [] as {
            ip: string;
            ua: string;
            time: string;
        }[]
    );
    return (
        <div class="flex-1 flex flex-col items-center">
            <div class="flex-1 flex flex-col w-full max-w-5xl p-3 lg:p-6">
                <label class="font-bold">{t("game.admin.automate.title")} API</label>
                <Card level="info" class="mt-2" contentClass="py-2 px-4">
                    <p class="opacity-60 inline">
                        <span>{t("game.admin.automate.tips1")}</span>
                        <span>&nbsp;</span>
                        <a
                            href="/docs/events"
                            class="inline-flex flex-row space-x-2 items-center hover:underline"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <span>{t("docs.title")}</span>
                            <span class="icon-[fluent--open-16-regular] w-4 h-4 text-primary" />
                        </a>
                        <span>.&nbsp;</span>
                        <span>{t("game.admin.automate.tips2")}</span>
                    </p>
                </Card>
                <Clipboard
                    class="w-full mt-2"
                    value={`${window.origin.replace("http", "ws")}/api/event/connect?game_id=${gameStore.current?.id}&token=${gameStore.current?.token || undefined}`}
                />
                <label class="font-bold mt-3 lg:mt-8">{t("game.admin.automate.linkedDevices")}</label>
                <Divider class="mt-2" />
                <For
                    each={linkedDevices()}
                    fallback={
                        <div class="flex-1 flex flex-col items-center justify-center space-y-8 opacity-60">
                            <span class="icon-[fluent--desktop-20-regular] w-24 h-24" />
                            <span>{t("game.admin.automate.noDevicesLinked")}</span>
                        </div>
                    }
                >
                    {(device) => (
                        <>
                            <div class="h-12 border-b border-b-layer-content/10 flex flex-row items-center space-x-4 px-2">
                                <span class="font-bold">{device.ip}</span>
                                <span class="flex-1 opacity-60 truncate" title={device.ua}>
                                    {device.ua}
                                </span>
                                <span class="flex-shrink-0">{device.time}</span>
                            </div>
                        </>
                    )}
                </For>
            </div>
        </div>
    );
}
