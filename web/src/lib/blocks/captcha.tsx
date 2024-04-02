import { Maybe } from '@modular-forms/solid'
import Input, { TextInputProps } from '@widgets/input'
import { splitProps } from 'solid-js'

export default function (
  props: TextInputProps & {
    idField: Maybe<string>
    answerField: Maybe<string>
  }
) {
  let [fieldProps, inputProps] = splitProps(props, ['idField', 'answerField'])
  return (
    <>
      <input class="hidden" name="captcha_id" value={fieldProps.idField}></input>
      <Input value={fieldProps.answerField} {...inputProps}></Input>
    </>
  )
}
