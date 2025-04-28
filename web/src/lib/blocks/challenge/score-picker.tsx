import { t } from "@storage/theme";
import Chart from "@widgets/chart";
import RangeSlider from "@widgets/range-slider";
import Slider from "@widgets/slider";
import clsx from "clsx";

export default function ScorePicker(props: {
  class?: string;
  max: number;
  onChangeMax: (max: number) => void;
  min: number;
  onChangeMin: (min: number) => void;
  decay: number;
  onChangeDecay: (decay: number) => void;
}) {
  function getScore(d: number) {
    if (d < 1) return props.max;
    if (d >= props.decay) return props.min;
    return Math.round(props.max + ((props.min - props.max) * (d * d - 1)) / (props.decay * props.decay));
  }
  function getFunctionPlots() {
    const data = [];
    for (let i = 0; i <= 50; i += 1) {
      data.push([i, getScore(i)]);
    }
    return data;
  }
  return (
    <div class={clsx("flex flex-col space-y-1", props.class)}>
      <label class="label" for="scorePicker_NOTPOSSIBLE">
        {t("challenge.form.scoreRule.range.label")}
      </label>
      <div class="flex h-56">
        <div class="flex flex-col items-end space-y-2">
          <RangeSlider
            class="flex-1"
            label={t("challenge.form.scoreRule.range.label")}
            max={1500}
            min={0}
            step={50}
            orientation="vertical"
            value={[props.min, props.max]}
            onValueChange={(details) => {
              const value = details.value;
              const maxOne = value[0] > value[1] ? value[0] : value[1];
              const minOne = value[0] < value[1] ? value[0] : value[1];
              if (maxOne !== props.max) props.onChangeMax(maxOne);
              if (minOne !== props.min) props.onChangeMin(minOne);
            }}
          />
          <div class="h-12" />
        </div>
        <div class="flex-1 flex flex-col">
          <Chart
            option={{
              grid: {
                top: 8,
                left: 0,
                right: 8,
                bottom: 8,
              },
              axisPointer: {
                link: { xAxisIndex: "all" },
              },
              tooltip: {
                trigger: "axis",
                axisPointer: {
                  type: "cross",
                  axis: "x",
                },
              },
              xAxis: {
                name: "",
                min: 0,
                max: 50,
                minorTick: {
                  show: false,
                },
                minorSplitLine: {
                  show: false,
                },
                axisPointer: { snap: true },
              },
              yAxis: {
                name: "",
                min: 0,
                max: 1500,
                minorTick: {
                  show: false,
                },
                minorSplitLine: {
                  show: false,
                },
              },
              series: [
                {
                  type: "line",
                  showSymbol: false,
                  clip: true,
                  animation: true,
                  data: getFunctionPlots(),
                },
                {
                  type: "line",
                  showSymbol: false,
                  silent: true,
                  clip: true,
                  data: [
                    [0, props.min],
                    [props.decay, props.min],
                  ],
                  lineStyle: {
                    color: "gray",
                    type: "dashed",
                  },
                },
                {
                  type: "line",
                  showSymbol: false,
                  silent: true,
                  clip: true,
                  data: [
                    [props.decay, 1500],
                    [props.decay, 0],
                  ],
                  lineStyle: {
                    color: "gray",
                    type: "dashed",
                  },
                },
              ],
            }}
          />
          <Slider
            class="flex-1 flex-col-reverse pl-1"
            label={t("challenge.form.scoreRule.decay.label")}
            max={50}
            min={1}
            step={1}
            value={[props.decay]}
            onValueChange={(details) => {
              const value = details.value;
              if (value[0] !== props.decay) props.onChangeDecay(value[0]);
            }}
          />
        </div>
      </div>
    </div>
  );
}
