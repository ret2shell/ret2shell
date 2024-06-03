import DarkmodeButton from "@blocks/darkmode-button";
import { setLocale, t } from "@storage/theme";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Popover from "@widgets/popover";

export function DiyBoxContent() {
    return (
        <div class="flex flex-col space-y-2">
            <Card>
                <DarkmodeButton />
            </Card>
            <Card contentClass="p-2 flex flex-col space-y-2">
                <ul class="flex flex-row">
                    <li class="w-full">
                        <Button
                            class="w-full"
                            onClick={() => setLocale("zh_cn")}
                            square
                            ghost
                            justify="center"
                            size="sm"
                        >
                            <span>简</span>
                        </Button>
                    </li>
                    <li class="w-full">
                        <Button
                            class="w-full"
                            onClick={() => setLocale("zh_tw")}
                            square
                            ghost
                            justify="center"
                            size="sm"
                        >
                            <span>繁</span>
                        </Button>
                    </li>
                    <li class="w-full">
                        <Button
                            class="w-full"
                            onClick={() => setLocale("en_us")}
                            square
                            ghost
                            justify="center"
                            size="sm"
                        >
                            <span>En</span>
                        </Button>
                    </li>
                    <li class="w-full">
                        <Button
                            class="w-full"
                            onClick={() => setLocale("ja_jp")}
                            square
                            ghost
                            justify="center"
                            size="sm"
                        >
                            <span>な</span>
                        </Button>
                    </li>
                </ul>
            </Card>
        </div>
    );
}

export default function DiyBox() {
    return (
        <Popover
            btnContent={<span class="icon-[fluent--wand-20-regular] w-5 h-5" />}
            square
            ghost
            popContentClass="pt-2"
            title={t("platform.diyBox")}
        >
            <DiyBoxContent />
        </Popover>
    );
}
