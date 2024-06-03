import { t } from "@/lib/storage/theme";
import Button from "@/lib/widgets/button";
import Card from "@/lib/widgets/card";
import Input from "@/lib/widgets/input";
import xdsecMascotNormal from "@assets/imgs/xdsec-mascot-normal.webp";
import xdsecMascotUnsee from "@assets/imgs/xdsec-mascot-unsee.webp";

export default function () {
    return (
        <div class="flex flex-col min-h-full">
            <div class="flex flex-col flex-1 p-3 lg:p-6 space-y-4">
                <div class="self-start flex-row max-w-[calc(100%-4rem)] flex items-center">
                    <img src={xdsecMascotNormal} width={40} height={40} alt="ΦωΦ" />
                    <div class="w-4" />
                    <Card contentClass="p-2">
                        <p class="text-wrap">{t("game.challenge.hammerTips")}</p>
                    </Card>
                </div>
                <div class="self-start flex-row max-w-[calc(100%-4rem)] flex items-center">
                    <img src={xdsecMascotUnsee} width={40} height={40} alt=">ω<" />
                    <div class="w-4" />
                    <Card contentClass="p-2">
                        <p class="text-wrap">{t("game.challenge.hammerTips2")}</p>
                    </Card>
                </div>
            </div>
            <div class="sticky bottom-0 p-3 lg:p-6">
                <Input
                    placeholder={t("game.challenge.hammerInput")}
                    extraBtn={
                        <Button class="!rounded-l-none">
                            <span class="icon-[fluent--send-20-regular] w-5 h-5" />
                        </Button>
                    }
                />
            </div>
        </div>
    );
}
