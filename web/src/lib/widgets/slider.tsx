import { Slider, type SliderRootProps } from "@ark-ui/solid";
import clsx from "clsx";
import { type ComponentProps, splitProps } from "solid-js";

export type SliderProps = {
  label?: string;
  inputProps?: ComponentProps<"input">;
};

export default function (props: SliderRootProps & SliderProps) {
  const [sliderProps, others] = splitProps(props, ["label", "inputProps"]);
  return (
    <Slider.Root
      {...others}
      class={clsx("slider", others.orientation === "vertical" && "slider-vertical", others.class)}
    >
      <div class="label slider-label">
        <Slider.Label>{sliderProps.label}</Slider.Label>
        <Slider.ValueText />
      </div>
      <Slider.Control class="slider-control group">
        <Slider.Track class="slider-track">
          <Slider.Range class="slider-range" />
        </Slider.Track>
        <Slider.Thumb index={0} class="slider-thumb group-hover:border-2">
          <Slider.HiddenInput {...sliderProps.inputProps} value={props.value?.[0] ?? 0} type="number" />
        </Slider.Thumb>
      </Slider.Control>
    </Slider.Root>
  );
}
