import type { ComponentProps } from "@solidjs/web";
import { onSettled } from "solid-js";

export default function (props: ComponentProps<"svg">) {
  let svgPath1!: SVGPathElement;
  let svgPath2!: SVGPathElement;
  let svgPath3!: SVGPathElement;
  let svgPath4!: SVGPathElement;
  const { width, height } = { width: 256, height: 256, ...props };
  onSettled(() => {
    setTimeout(() => {
      svgPath1.classList.remove("logo-elem-1");
      svgPath2.classList.remove("logo-elem-2");
      svgPath3.classList.remove("logo-elem-3");
      svgPath4.classList.remove("logo-elem-4");
    }, 3000);
  });
  return (
    <svg width={width} height={height} {...props} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <g>
        <path
          fill="#0891ed"
          stroke="#0891ed"
          stroke-width="6"
          stroke-dasharray="none"
          stroke-opacity="0.564706"
          d="m84.598 189.653-67.953-39.805v-12.37l57.14-32.885 6.491 9.052-52.757 30.017 60.575 35.759zm97.62-6.915-6.494-9.056 52.757-30.017-29.51-16.792 9.634-5.714 30.75 16.32v12.373z"
          class="logo-elem-1"
          ref={svgPath1!}
        />
        <path
          fill="#e05763"
          stroke="#e05763"
          stroke-width="6"
          stroke-dasharray="none"
          stroke-opacity="0.564706"
          d="m99.331 76.984 37.088 62.889 23.56-22.568 29.018 4.318 35.858-18.537-24.673-61.7-23.207 34.66-54.136-24.982Z"
          class="logo-elem-2"
          ref={svgPath2!}
        />
        <path
          d="M160.25 218.864 85.98 93.034l8.822-9.267 78.154 132.406Z"
          fill="gray"
          stroke="gray"
          stroke-width="6"
          stroke-dasharray="none"
          stroke-opacity=".564706"
          class="logo-elem-3"
          ref={svgPath3!}
        />
        <path
          d="m82.317 86.69 8.764-9.955-6.977-12.503-8.578 11.36z"
          fill="gray"
          stroke="gray"
          stroke-width="6"
          stroke-dasharray="none"
          stroke-opacity=".564706"
          class="logo-elem-4"
          ref={svgPath4!}
        />
      </g>
    </svg>
  );
}
