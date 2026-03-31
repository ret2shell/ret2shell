use axum::{Router, middleware, routing::get};
use r2s_database::user::Permission;

use crate::{middleware::auth, traits::GlobalState};

mod catalog;
mod direct;
mod serve;
mod source;

pub fn router(state: &GlobalState) -> Router<GlobalState> {
  Router::new()
    .nest("/v1", serve::router(state))
    .nest(
      "/source",
      Router::new()
        .route(
          "/",
          get(source::list_registry_sources).post(source::create_registry_source),
        )
        .route(
          "/{source}",
          axum::routing::patch(source::update_registry_source)
            .delete(source::delete_registry_source),
        )
        .route(
          "/{source}/fetch",
          axum::routing::post(source::fetch_registry_source),
        )
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::Basic,
          Permission::Verified,
          Permission::DevOps
        ))),
    )
    .nest(
      "/catalog",
      Router::new()
        .route("/games", get(catalog::list_catalog_games))
        .route("/games/{game_key}", get(catalog::list_catalog_releases))
        .route(
          "/games/{game_key}/releases/{release_id}",
          get(catalog::get_catalog_release_detail),
        )
        .route(
          "/import",
          axum::routing::post(catalog::import_catalog_release),
        )
        .route_layer(middleware::from_fn(auth::permission_required_any!(
          Permission::Host,
          Permission::DevOps
        )))
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::Basic,
          Permission::Verified
        ))),
    )
    .nest(
      "/direct",
      Router::new()
        .route(
          "/discover",
          axum::routing::post(direct::discover_remote_source),
        )
        .route(
          "/import",
          axum::routing::post(direct::import_remote_release),
        )
        .route("/job", get(direct::list_sync_jobs))
        .route("/job/{job}", get(direct::get_sync_job))
        .route(
          "/job/{job}/resume",
          axum::routing::post(direct::resume_sync_job),
        )
        .route(
          "/job/{job}/cancel",
          axum::routing::post(direct::cancel_sync_job),
        )
        .route_layer(middleware::from_fn(auth::permission_required_any!(
          Permission::Host,
          Permission::DevOps
        )))
        .route_layer(middleware::from_fn(auth::permission_required_all!(
          Permission::Basic,
          Permission::Verified
        ))),
    )
}
