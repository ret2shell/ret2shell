import { Component } from 'solid-js'

export default function (props: Component<'input'>) {
  return (
    <>
      <div class="input">
        <input {...props} />
      </div>
    </>
  )
}
