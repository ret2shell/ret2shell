import { passiveSupport } from 'passive-events-support/src/utils'
import { JSX, Ref, createEffect, on, onCleanup, onMount } from 'solid-js'
import { init, registerTheme, use } from 'echarts/core'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DatasetComponent,
  TransformComponent,
  DataZoomComponent,
  ToolboxComponent,
} from 'echarts/components'
import { LineChart, BarChart, SunburstChart, RadarChart, GaugeChart } from 'echarts/charts'
import type { EChartsCoreOption, EChartsType, ResizeOpts } from 'echarts/core'
import { SVGRenderer, CanvasRenderer } from 'echarts/renderers'
import { mergeRefs } from '@solid-primitives/refs'
import cyberDark from './styles/echarts/cyber-dark.json'
import cyberLight from './styles/echarts/cyber-light.json'
import { fullTheme } from '../storage/theme'
import { nanoid } from 'nanoid'
import { Size, createElementSize } from '@solid-primitives/resize-observer'
import { isMobile } from '@solid-primitives/platform'

use([
  LabelLayout,
  UniversalTransition,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DatasetComponent,
  DataZoomComponent,
  TransformComponent,
  ToolboxComponent,

  LineChart,
  BarChart,
  SunburstChart,
  RadarChart,
  GaugeChart,

  SVGRenderer,
  CanvasRenderer,
])

export type InitOptions = {
  locale?: string
  renderer?: 'canvas' | 'svg'
  devicePixelRatio?: number
  useDirtyRect?: boolean
  useCoarsePointer?: boolean
  pointerSize?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EChartsEventHandler = (event: any) => void | boolean
export type EChartsEventHandlerDefinition = {
  query: string | object
  handler: EChartsEventHandler
}

export type EventHandlers = Record<string, EChartsEventHandler | EChartsEventHandlerDefinition>

export interface EChartsBaseProps {
  id?: string
  ref?: Ref<HTMLDivElement>

  class?: string
  style?: JSX.CSSProperties

  initOptions?: InitOptions
  option: EChartsCoreOption

  notMerge?: boolean
  lazyUpdate?: boolean

  isLoading?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadingOptions?: any

  resizeOptions?: Omit<ResizeOpts, 'width' | 'height'>

  eventHandlers?: EventHandlers
  onInit?: (chartInstance: EChartsType) => void
}

export const bindEvents = (chartInstance: EChartsType, eventHandlers: EventHandlers) => {
  Object.entries(eventHandlers).forEach(([eventName, handler]) => {
    if ('query' in handler) {
      chartInstance.on(eventName, handler.query, handler.handler)
    } else {
      chartInstance.on(eventName, handler)
    }
  })
}

export const unbindEvents = (chartInstance: EChartsType, eventHandlers: EventHandlers) => {
  Object.entries(eventHandlers).forEach(([eventName, handler]) => {
    chartInstance.off(eventName, 'handler' in handler ? handler.handler : handler)
  })
}

export default function Chart(props: EChartsBaseProps) {
  let chartElement: HTMLDivElement
  let chartInstance: EChartsType
  let size: Readonly<Size>

  const id = props.id ?? `echarts-${nanoid()}`

  passiveSupport({
    events: ['mousewheel', 'wheel'],
    listeners: [
      {
        element: id,
        event: 'mousewheel',
      },
    ],
  })

  registerTheme('cyber-dark', cyberDark)
  registerTheme('cyber-light', cyberLight)

  onMount(() => {
    size = createElementSize(chartElement)
  })

  onCleanup(() => {
    chartInstance?.dispose()
  })

  createEffect(
    on(
      () => [size.width, size.height],
      ([width, height]) => {
        // console.log('resize', width, height)
        chartInstance.resize({ width, height, ...props.resizeOptions })
      },
      { defer: true }
    )
  )

  createEffect(
    on(
      () => props.option,
      option => {
        chartInstance.setOption(option, props.notMerge, props.lazyUpdate)
      },
      { defer: true }
    )
  )

  createEffect(
    on(
      () => fullTheme(),
      theme => {
        chartInstance?.dispose()
        chartInstance = init(chartElement, theme, {
          width: size.width ?? 0,
          height: size.height ?? 0,
          renderer: isMobile ? 'svg' : 'canvas',
          useDirtyRect: true,
          ...(props.initOptions ?? {}),
        })
        chartInstance.setOption(props.option, props.notMerge, props.lazyUpdate)
        props.onInit?.(chartInstance)
      }
    )
  )

  createEffect(
    on(
      () => props.isLoading,
      isLoading => {
        if (isLoading) {
          chartInstance.showLoading(props.loadingOptions as unknown as object | undefined)
        } else {
          chartInstance.hideLoading()
        }
      },
      { defer: true }
    )
  )

  createEffect(
    on(
      () => props.eventHandlers,
      (eventHandlers, prevEventHandlers) => {
        if (prevEventHandlers) {
          unbindEvents(chartInstance, prevEventHandlers)
        }

        if (eventHandlers) {
          bindEvents(chartInstance, eventHandlers)
        }
      },
      { defer: true }
    )
  )

  return (
    <div
      id={id}
      style={props.style}
      class={`w-full h-full ${props.class}`}
      ref={mergeRefs(props.ref, el => (chartElement = el))}
    />
  )
}
