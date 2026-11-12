use chrono::Utc;
use r2s_database::{distribution, sync_job};
use tracing::{error, info, warn};

use crate::{sync::job, traits::GlobalState};

/// Scan cadence of the scheduler: how often due distributions are looked up.
const SYNC_SCAN_INTERVAL_SECS: u64 = 15;

pub async fn spawn_sync_worker(state: GlobalState) {
  match sync_job::fail_interrupted_jobs(&state.db.conn).await {
    Ok(count) if count > 0 => {
      warn!(
        count,
        "marked leftover running sync jobs as interrupted failures"
      );
    }
    Ok(_) => {}
    Err(err) => {
      error!(error=?err, "failed to recover leftover running sync jobs");
    }
  }
  match distribution::fail_interrupted_distributions(&state.db.conn).await {
    Ok(count) if count > 0 => {
      warn!(count, "marked interrupted distributions as failed");
    }
    Ok(_) => {}
    Err(err) => {
      error!(error=?err, "failed to recover interrupted distributions");
    }
  }
  info!(
    interval_secs = SYNC_SCAN_INTERVAL_SECS,
    "sync scheduler worker started"
  );
  let mut ticker = tokio::time::interval(std::time::Duration::from_secs(SYNC_SCAN_INTERVAL_SECS));
  ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
  loop {
    ticker.tick().await;
    scan_due_distributions(&state).await;
  }
}

/// Runs every due distribution sequentially, one sync at a time. A
/// distribution that still has an active job is rejected by the enqueue guard
/// and simply keeps its due time until the job settles; a distribution
/// without a managed game is skipped the same way.
async fn scan_due_distributions(state: &GlobalState) {
  let due = match distribution::get_due_list(&state.db.conn, Utc::now()).await {
    Ok(due) => due,
    Err(err) => {
      error!(error=?err, "failed to list due distributions");
      return;
    }
  };
  for model in due {
    let job = match job::enqueue_job(state, model.id, sync_job::TRIGGER_SCHEDULED, None).await {
      Ok(job) => job,
      Err(err) => {
        warn!(
          distribution_id = model.id,
          error = %err,
          "failed to enqueue the scheduled sync job"
        );
        continue;
      }
    };
    job::run_job(state.clone(), model.id, job.id).await;
  }
}
