import Spin from "@assets/animates/spin";
import type { ComponentProps } from "@solidjs/web";
import clsx from "clsx";
import { createSignal, onCleanup } from "solid-js";
import { randomTips } from "../utils/loading-tips";

export default function (props: ComponentProps<"span">) {
  const [tips, setTips] = createSignal(randomTips());
  const timer = setInterval(() => setTips(randomTips(tips())), 700);
  onCleanup(() => clearInterval(timer));
  return (
    <span {...props} class={clsx("flex flex-row items-center space-x-2", props.class)}>
      <Spin width={16} height={16} />
      <span>{tips()}</span>
    </span>
  );
}
