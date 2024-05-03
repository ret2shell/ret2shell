import { Select, SelectRootProps } from '@ark-ui/solid'
import { CollectionItem } from '@ark-ui/solid/dist/types/types'
import { Index, Show, splitProps } from 'solid-js'
import { Portal } from 'solid-js/web'

export type SelectProps = {
  label?: string
  placeholder?: string
  size?: 'sm' | 'md'
  ghost?: boolean
}

export interface SelectItemType {
  label: string
  icon?: string
  value: string | number
  disabled?: boolean
}

export default function <T extends CollectionItem & SelectItemType>(props: SelectRootProps<T> & SelectProps) {
  const [selectProps, others] = splitProps(props, ['label', 'placeholder', 'size'])
  return (
    <Select.Root
      {...others}
      positioning={{
        sameWidth: true,
      }}
    >
      <Show when={selectProps.label}>
        <Select.Label class="label">{selectProps.label}</Select.Label>
      </Show>
      <Select.Control class="w-full">
        <Select.Trigger
          class={`btn flex flex-row ${props.size === 'sm' ? 'px-0' : 'px-2'} gap-0 items-center w-full btn-${props.size} ${props.ghost ? 'btn-ghost' : ''}`}
        >
          <Select.ValueText class="px-4 flex-1 text-start truncate" placeholder={selectProps.placeholder} />
          <Select.Indicator class="btn btn-sm btn-square btn-ghost items-center justify-center">
            <span class="icon-[fluent--chevron-double-down-20-regular] w-5 h-5"></span>
          </Select.Indicator>
          <Select.ClearTrigger class="btn btn-sm btn-square btn-ghost items-center justify-center">
            <span class="icon-[fluent--dismiss-circle-20-regular] w-5 h-5"></span>
          </Select.ClearTrigger>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content class="card w-full">
            <Select.ItemGroup class="card-content p-2 flex flex-col space-y-2">
              <Index each={props.items}>
                {item => (
                  <Select.Item
                    item={item().value}
                    class={`btn btn-ghost btn-sm items-center overflow-hidden`}
                    title={item().label}
                  >
                    <Select.ItemText class="flex-1 text-start flex flex-row space-x-2 items-center overflow-hidden">
                      <Show when={item().icon}>
                        <span class={`${item().icon} flex-shrink-0`}></span>
                      </Show>
                      <span class="truncate">{item().label}</span>
                    </Select.ItemText>
                    <Select.ItemIndicator class="flex items-center">
                      <span class="icon-[fluent--checkmark-20-regular] w-5 h-5 text-success flex-shrink-0"></span>
                    </Select.ItemIndicator>
                  </Select.Item>
                )}
              </Index>
            </Select.ItemGroup>
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  )
}
