import { fullTheme } from "@/lib/storage/theme";
import Avatar from "@/lib/widgets/avatar";
import Divider from "@/lib/widgets/divider";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";

export default function () {
    return (
        <div class="w-full h-full overflow-hidden">
            <OverlayScrollbarsComponent
                options={{
                    scrollbars: {
                        theme: `os-theme-${fullTheme()}`,
                        autoHide: "scroll",
                    },
                }}
                class="relative w-full h-full print:h-auto print:overflow-auto"
                defer
            >
                <div class="flex flex-col space-y-2 p-3 lg:p-6">
                    <Divider />
                </div>
            </OverlayScrollbarsComponent>
        </div>
    );
}
