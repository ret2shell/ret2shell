import { Slider, type SliderRootProps } from "@ark-ui/solid";
import type { ComponentProps } from "@solidjs/web";
import clsx from "clsx";
import { omit, Show } from "solid-js";

export type SliderProps = {
  label?: string;
  /** Hides the label/value row above the track, e.g. when the caller renders
   * its own readout around the slider. */
  hideHeader?: boolean;
  inputProps?: ComponentProps<"input">;
};

export default function (props: SliderRootProps & SliderProps) {
  const others = omit(props, "label", "hideHeader", "inputProps");
  return (
    <Slider.Root
      {...others}
      class={clsx("slider", others.orientation === "vertical" && "slider-vertical", others.class)}
    >
      <Show when={!props.hideHeader}>
        <div class="label slider-label">
          <Slider.Label>{props.label}</Slider.Label>
          <Slider.ValueText />
        </div>
      </Show>
      <Slider.Control class="slider-control group">
        <Slider.Track class="slider-track">
          <Slider.Range class="slider-range" />
        </Slider.Track>
        <Slider.Thumb index={0} class="slider-thumb group-hover:border-2">
          <Slider.HiddenInput {...props.inputProps} value={props.value?.[0] ?? 0} type="number" />
        </Slider.Thumb>
      </Slider.Control>
    </Slider.Root>
  );
}
