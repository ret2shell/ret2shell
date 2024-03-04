export type PlatformConfig = {
  name: string
  footer_info: string
  footer_url: string
  subject_info: string
  subject_url: string
  record: string | null
  hide_maker: boolean
}

export enum Validator {
  None,
  Image,
  Pow,
  RecaptchaV3,
  HCaptcha,
}

export type CaptchaConfig = {
  enabled: boolean
  difficulty: number
  validator: Validator
}

export type AuthConfig = {
  signing_key: string
  buffer_time: number
  expires_time: number
  oauth_keys: { [key: string]: { id: string; key: string } }
}

export type EmailConfig = {
  enabled: boolean
  host: string
  port: number
  sender: string
  username: string
  password: string
  tls: string
  reset_password_email_body: string
  reset_password_email_subject: string
  verify_email_body: string
  verify_email_subject: string
}

export type MediaConfig = {
  anti_theft: boolean
  limit: number
}

export type AutomateConfig = {
  enabled: boolean
  token: String
}

export type Config = {
  id: number
  platform: PlatformConfig
  captcha: CaptchaConfig
  auth: AuthConfig
  email: EmailConfig
  media: MediaConfig
  automate: AutomateConfig
}
