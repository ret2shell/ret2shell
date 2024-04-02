export type Captcha = {
  id: string
  validator: 'none' | 'image' | 'pow' | 'recaptcha_v3' | 'h_captcha'
  challenge: string
  criteria: string | null
}
