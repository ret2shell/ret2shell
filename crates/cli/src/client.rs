use std::{
  path::Path,
  time::{SystemTime, UNIX_EPOCH},
};

use reqwest::{
  Client as HttpClient, Method, Response, Url,
  header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue},
};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use tokio::fs;

use crate::{
  auth::LoginRequest,
  error::{CliError, CliResult},
};

#[derive(Clone, Debug)]
pub enum Auth {
  None,
  Bearer(String),
}

pub struct Client {
  base_url: String,
  auth: Auth,
  http: HttpClient,
}

impl Client {
  pub fn new(base_url: String, auth: Auth) -> CliResult<Self> {
    let base_url = base_url.trim_end_matches('/').to_owned();
    if base_url.is_empty() {
      return Err(CliError::Config("base url can not be empty".to_owned()));
    }

    Ok(Self {
      base_url,
      auth,
      http: HttpClient::new(),
    })
  }

  pub fn base_url(&self) -> &str {
    &self.base_url
  }

  pub async fn login(
    &self, account: String, password: String, captcha_id: String, captcha_answer: String,
  ) -> CliResult<Value> {
    let response = self
      .http
      .post(self.url("/account/login", &[])?)
      .json(&LoginRequest {
        account,
        password,
        captcha_id,
        captcha_answer,
      })
      .send()
      .await?;
    let token = response
      .headers()
      .get("Set-Token")
      .and_then(|value| value.to_str().ok())
      .map(str::to_owned);
    self.check_response(response).await?;
    Ok(serde_json::json!({ "token": token }))
  }

  pub async fn get(&self, path: &str, query: &[(&str, String)]) -> CliResult<Value> {
    let response = self.request(Method::GET, path, query)?.send().await?;
    self.json_response(response).await
  }

  pub async fn send_json(
    &self, method: Method, path: &str, query: &[(&str, String)], body: Option<&Value>,
  ) -> CliResult<Value> {
    let mut request = self.request(method, path, query)?;
    if let Some(body) = body {
      request = request.json(body);
    }
    self.json_response(request.send().await?).await
  }

  pub async fn download(
    &self, path: &str, query: &[(&str, String)], output: &str,
  ) -> CliResult<Value> {
    let response = self.request(Method::GET, path, query)?.send().await?;
    let response = self.check_response(response).await?;
    let bytes = response.bytes().await?;
    fs::write(output, &bytes).await?;
    Ok(serde_json::json!({
      "output": output,
      "bytes": bytes.len(),
    }))
  }

  pub async fn upload_file(
    &self, path: &str, query: &[(&str, String)], file_path: &str,
  ) -> CliResult<Value> {
    let file_name = Path::new(file_path)
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| CliError::Config("invalid file path".to_owned()))?;
    let file = fs::read(file_path).await?;
    let boundary = format!(
      "r2s-cli-{}-{}",
      std::process::id(),
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| CliError::Config(format!("invalid system time: {err}")))?
        .as_nanos()
    );
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
      format!("Content-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\n")
        .as_bytes(),
    );
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(&file);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let response = self
      .request(Method::POST, path, query)?
      .header(
        CONTENT_TYPE,
        format!("multipart/form-data; boundary={boundary}"),
      )
      .body(body)
      .send()
      .await?;
    self.json_response(response).await
  }

  pub async fn get_typed<T: DeserializeOwned>(
    &self, path: &str, query: &[(&str, String)],
  ) -> CliResult<T> {
    let response = self.request(Method::GET, path, query)?.send().await?;
    self.typed_response(response).await
  }

  pub async fn post<T: Serialize + ?Sized>(&self, path: &str, body: &T) -> CliResult<Value> {
    let response = self
      .request(Method::POST, path, &[])?
      .json(body)
      .send()
      .await?;
    self.json_response(response).await
  }

  fn request(
    &self, method: Method, path: &str, query: &[(&str, String)],
  ) -> CliResult<reqwest::RequestBuilder> {
    Ok(
      self
        .http
        .request(method, self.url(path, query)?)
        .headers(self.auth_headers()?),
    )
  }

  fn auth_headers(&self) -> CliResult<HeaderMap> {
    let mut headers = HeaderMap::new();
    if let Auth::Bearer(token) = &self.auth {
      headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {token}"))
          .map_err(|_| CliError::Config("invalid bearer token".to_owned()))?,
      );
    }
    Ok(headers)
  }

  fn url(&self, path: &str, query: &[(&str, String)]) -> CliResult<Url> {
    let mut url = Url::parse(&format!(
      "{}/{}",
      self.base_url,
      path.trim_start_matches('/')
    ))
    .map_err(|err| CliError::Config(format!("invalid url: {err}")))?;
    if !query.is_empty() {
      url
        .query_pairs_mut()
        .extend_pairs(query.iter().map(|(key, value)| (*key, value.as_str())));
    }
    Ok(url)
  }

  async fn json_response(&self, response: Response) -> CliResult<Value> {
    let response = self.check_response(response).await?;
    let text = response.text().await?;
    if text.is_empty() {
      Ok(Value::Null)
    } else {
      Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
    }
  }

  async fn typed_response<T: DeserializeOwned>(&self, response: Response) -> CliResult<T> {
    let response = self.check_response(response).await?;
    let text = response.text().await?;
    Ok(serde_json::from_str(&text)?)
  }

  async fn check_response(&self, response: Response) -> CliResult<Response> {
    if response.status().is_success() {
      return Ok(response);
    }

    let status = response.status();
    let message = response.text().await.unwrap_or_else(|_| status.to_string());
    Err(CliError::Api { status, message })
  }
}
