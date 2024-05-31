import { type ComponentProps, createSignal, onCleanup } from "solid-js";
import Spin from "../assets/animates/spin";
import { randomTips } from "../utils/loading-tips";

export default function (props: ComponentProps<"span">) {
    const [tips, setTips] = createSignal(randomTips());
    const timer = setInterval(() => setTips(randomTips(tips())), 700);
    onCleanup(() => clearInterval(timer));
    return (
        <span {...props} class={`flex flex-row items-center space-x-2 ${props.class}`}>
            <Spin width={16} height={16} />
            <span>{tips()}</span>
        </span>
    );
}
