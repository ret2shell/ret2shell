import { Title } from '@/lib/storage/header'
import { JSX } from 'solid-js'

export default function (props: { children?: JSX.Element }) {
  return (
    <>
      <Title title="Wiki" />
      {props.children}
    </>
  )
}
