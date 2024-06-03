import { fullTheme } from "@/lib/storage/theme";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";

export default function Challenges() {
    return (
        <div class="flex-1 overflow-hidden">
            <OverlayScrollbarsComponent
                options={{
                    scrollbars: {
                        theme: `os-theme-${fullTheme()}`,
                        autoHide: "scroll",
                    },
                }}
                class="relative w-full h-full print:h-auto print:overflow-auto"
                defer
            />
        </div>
    );
}
