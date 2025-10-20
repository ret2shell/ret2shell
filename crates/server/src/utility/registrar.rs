use r2s_config as config;
use r2s_database::user::{self, Permission, Permissions};
use r2s_registrar::{RegisterInfo, RegisterResult, Registrar};
use sea_orm::ConnectionTrait;

use crate::traits::ResponseError;

pub async fn intercept(
  auth_config: &Option<config::auth::Config>, info: &RegisterInfo,
) -> Result<Option<RegisterResult>, ResponseError> {
  if let Some(script) = auth_config.clone().and_then(|a| a.registrar_script) {
    let registrar = Registrar;
    registrar.preload("default", &script).await?;
    match registrar.intercept("default", info).await {
      Ok(result) => Ok(Some(result)),
      Err(r2s_registrar::RegistrarError::Rejected(msg)) => Err(ResponseError::Forbidden(msg)),
      Err(err) => {
        tracing::error!(error=?err, "registrar error");
        Err(ResponseError::InternalServerError(
          "registrar failed".to_owned(),
        ))
      }
    }
  } else {
    Ok(None)
  }
}

pub async fn compute_permissions<C>(
  db: &C, cfg: &r2s_database::config::Model, registrar_result: &Option<RegisterResult>,
) -> Result<Permissions, ResponseError>
where
  C: ConnectionTrait, {
  let mut permissions = match user::count(db, true, None, None, false).await? {
    0 => Permissions(vec![
      Permission::Basic,
      Permission::Verified,
      Permission::Calendar,
      Permission::Wiki,
      Permission::Bulletin,
      Permission::Game,
      Permission::Host,
      Permission::User,
      Permission::Statistics,
      Permission::DevOps,
    ]),
    _ => Permissions(vec![Permission::Basic]),
  };
  if (cfg.email.as_ref().is_some_and(|c| !c.enabled) // if email is disabled
    || (registrar_result // if registrar script explicitly bypass email verification
      .as_ref()
      .is_some_and(|r| r.bypass_email_verification)))
    && permissions.0.len() == 1
  // if permissions only contains basic
  {
    permissions.0.push(Permission::Verified);
  }
  Ok(permissions)
}

pub async fn resolve_institute<C>(
  db: &C, default_institute: Option<i64>, registrar_result: &Option<RegisterResult>,
) -> Result<Option<i64>, ResponseError>
where
  C: ConnectionTrait, {
  let mut institute_id = default_institute;
  if let Some(id) = registrar_result.as_ref().and_then(|r| r.institute_id) {
    if r2s_database::institute::get(db, id).await?.is_some() {
      institute_id = Some(id);
    } else {
      return Err(ResponseError::BadRequest("invalid institute id".to_owned()));
    }
  } else if let Some(token) = registrar_result
    .as_ref()
    .and_then(|r| r.institute_token.as_ref())
  {
    let i = r2s_database::institute::get_by_token(db, token).await?;
    if let Some(i) = i {
      institute_id = Some(i.id);
    } else {
      return Err(ResponseError::BadRequest(
        "invalid institute token".to_owned(),
      ));
    }
  }
  Ok(institute_id)
}
