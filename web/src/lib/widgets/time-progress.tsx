import { Progress } from '@ark-ui/solid'
import { DateTime } from 'luxon'
import { ComponentProps, createSignal, onCleanup, splitProps } from 'solid-js'
import { ProgressProps } from './progress'

export default function TimeProgress(
  props: { start_at: DateTime; end_at: DateTime } & ProgressProps & ComponentProps<'div'>
) {
  const [progressProps, nativeProps] = splitProps(props, ['start_at', 'end_at', 'static'])
  const [now, setNow] = createSignal(DateTime.now())
  const interval = setInterval(() => {
    setNow(DateTime.now())
  }, 1000)
  const progress = () =>
    (progressProps.start_at.diff(now()).milliseconds / progressProps.start_at.diff(progressProps.end_at).milliseconds) *
    100
  const cleanup = () => clearInterval(interval)
  onCleanup(cleanup)
  return (
    <>
      <Progress.Root {...nativeProps} min={0} max={100} value={progress()}>
        <Progress.Track class="progress-track">
          <Progress.Range
            class="progress-range"
            classList={{
              'progress-range-error': !progressProps.static && progress() > 60,
              'progress-range-warning': !progressProps.static && progress() > 30 && progress() <= 60,
              'progress-range-success': !progressProps.static && progress() <= 30,
              'progress-range-primary': progressProps.static,
            }}
          />
        </Progress.Track>
      </Progress.Root>
    </>
  )
}
