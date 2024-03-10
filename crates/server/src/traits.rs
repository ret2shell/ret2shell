use axum::extract::FromRef;
use r2s_auditor::Auditor;
use r2s_cache::Cache;
use r2s_cluster::Cluster;
use r2s_config::GlobalConfig;
use r2s_license::License;
use r2s_migrator::Database;
use r2s_queue::Queue;

#[derive(Clone, FromRef)]
pub struct GlobalState {
    pub config: GlobalConfig,
    pub db: Database,
    pub cache: Cache,
    pub auditor: Option<Auditor>,
    pub queue: Queue,
    pub cluster: Cluster,
    pub license: License,
}
