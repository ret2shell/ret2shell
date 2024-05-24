use axum::{extract::State, middleware, response::IntoResponse, routing::get, Json, Router};
use r2s_cluster::Cluster;
use r2s_database::user::Permission;

use crate::{
    middleware::auth,
    traits::{GlobalState, ResponseError},
};

pub fn router(_state: &GlobalState) -> Router<GlobalState> {
    Router::new()
        .route("/config", get(get_cluster_config))
        .route("/nodes", get(get_cluster_nodes))
        .route_layer(middleware::from_fn(auth::permission_required_all!(
            Permission::DevOps
        )))
}

async fn get_cluster_config(
    State(ref cluster): State<Cluster>,
) -> Result<impl IntoResponse, ResponseError> {
    let configs = cluster.configs().await?;
    Ok(Json(configs))
}

async fn get_cluster_nodes(
    State(ref cluster): State<Cluster>,
) -> Result<impl IntoResponse, ResponseError> {
    let nodes = cluster.nodes().await?;
    Ok(Json(nodes))
}
