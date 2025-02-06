import clsx from "clsx";
import { type ComponentProps, splitProps } from "solid-js";

export interface CardProps {
  solid?: boolean;
  contentClass?: string;
  level?: "info" | "success" | "warning" | "error";
}

export default function (props: CardProps & ComponentProps<"div">) {
  const [cardProps, nativeProps] = splitProps(props, ["solid", "contentClass", "level"]);
  // card-info card-success card-warning card-error
  return (
    <div
      {...nativeProps}
      class={clsx(
        "card",
        cardProps.solid && "card-solid",
        cardProps.level && `card-${cardProps.level}`,
        nativeProps.class,
        nativeProps.classList
      )}
    >
      <div class={clsx("card-content", cardProps.contentClass)}>{nativeProps.children}</div>
    </div>
  );
}
