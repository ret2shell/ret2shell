export type AuditorConfig = {
  sensitive_word_list: string;
};
export type OAuthKey = {
  id: string;
  key: string;
};
export type AuthConfig = {
  signing_key: string;
  buffer_time: number;
  expires_time: number;
  registrar_script?: string | null;
};
export type AutomateConfig = {
  enabled: boolean;
  token: string;
};
export type BucketConfig = {
  path: string;
};
export type CacheConfig = {
  url: string;
};
export type CaptchaConfig = {
  enabled: boolean;
  difficulty: number | null;
  validator: "none" | "image" | "pow" | "recaptcha_v3" | "h_captcha";
};
export type RegistryConfig = {
  external: string;
  username: string;
  password: string;
  server: string;
  insecure: boolean;
  enabled: boolean | null;
};
export type ClusterConfig = {
  try_default: boolean;
  auto_infer: boolean;
  kube_config_path: string | null;
  node_selector: string | null;
  proxy_image: string | null;
  traffic: string | null;
  // legacy fields supported by backend
  enable_capture: boolean | null;
  capture_directory: string | null;
  registry: RegistryConfig | null;
};
export type DatabaseConfig = {
  db: string;
  host: string;
  port: number;
  user: string;
  password: string;
  ssl_mode: string;
};
export type EmailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  sender: string;
  sender_address: string | null;
  username: string;
  password: string;
  tls: "none" | "tls" | "starttls";
  reset_password_email_body: string | null;
  reset_password_email_subject: string | null;
  verify_email_body: string | null;
  verify_email_subject: string | null;
};
export type LoggingConfig = {
  directory: string;
  level: string;
};
export type MediaConfig = {
  path: string;
  anti_theft: boolean;
  limit: number;
};
export type QueueConfig = {
  host: string;
  port: number;
  token: string | null;
  user: string | null;
  password: string | null;
  ping_interval: number | null;
  tls: boolean | null;
};
export type ServerConfig = {
  host: string;
  port: number;
  external_domain: string;
  external_https: boolean;
  api_base_path: string;
  cors_origins: string;
  name: string | null;
  footer_info: string | null;
  footer_url: string | null;
  subject_info: string | null;
  subject_url: string | null;
  record: string | null;
  hide_maker: boolean | null;
  highlight_banner: string | null;
  zen_game: number | null;
};
export type Config = {
  auditor: AuditorConfig;
  auth: AuthConfig;
  automate: AutomateConfig;
  bucket: BucketConfig;
  cache: CacheConfig;
  captcha: CaptchaConfig;
  cluster: ClusterConfig;
  database: DatabaseConfig;
  email: EmailConfig;
  logging: LoggingConfig;
  media: MediaConfig;
  queue: QueueConfig;
  server: ServerConfig;
};
