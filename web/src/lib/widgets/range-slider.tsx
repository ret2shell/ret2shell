import { Slider, type SliderRootProps } from "@ark-ui/solid";
import clsx from "clsx";
import { omit } from "solid-js";

export type SliderProps = {
  label?: string;
};

export default function (props: SliderRootProps & SliderProps) {
  const others = omit(props, "label");
  return (
    <Slider.Root
      {...others}
      class={clsx("slider", others.orientation === "vertical" && "slider-vertical", others.class)}
    >
      <div class="label slider-label">
        <Slider.Label>{props.label}</Slider.Label>
        <Slider.ValueText />
      </div>
      <Slider.Control class="slider-control group">
        <Slider.Track class="slider-track">
          <Slider.Range class="slider-range" />
        </Slider.Track>
        <Slider.Thumb index={0} class="slider-thumb group-hover:border-2">
          <Slider.HiddenInput />
        </Slider.Thumb>
        <Slider.Thumb index={1} class="slider-thumb group-hover:border-2">
          <Slider.HiddenInput />
        </Slider.Thumb>
      </Slider.Control>
    </Slider.Root>
  );
}
