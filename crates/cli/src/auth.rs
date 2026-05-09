use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct LoginRequest {
  pub account: String,
  pub password: String,
  pub captcha_id: String,
  pub captcha_answer: String,
}
