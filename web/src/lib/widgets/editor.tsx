import { ComponentProps, splitProps } from 'solid-js'
import './styles/editor.scss'
import Card, { CardProps } from './card'

export type EditorProps = {}

export function EditorBare(props: EditorProps & ComponentProps<'div'>) {}

export default function Editor(props: EditorProps & ComponentProps<'div'>) {
  return <Card contentClass="p-2"></Card>
}
