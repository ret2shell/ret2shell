use std::path::Path;

use image::imageops::FilterType;
use tracing::{debug, info, warn};
use traits::MediaError;

mod mime_util;
mod traits;

pub async fn make_thumbnail<PA, PB>(
    original: PA, dest: PB, longest_edge: u32,
) -> Result<(), MediaError>
where
    PA: AsRef<Path>,
    PB: AsRef<Path>,
{
    // prevent generate thumbnail repeatedly
    if tokio::fs::metadata(&dest).await.is_ok() {
        return Ok(());
    }
    // prevent generate thumbnail for svg
    if original.as_ref().extension().unwrap_or_default() == "svg" {
        let _ = tokio::fs::hard_link(original, dest).await;
        return Ok(());
    }
    debug!("generating thumbnail for {}", original.as_ref().display());
    let img = image::open(&original)?;

    match img
        .resize(longest_edge, longest_edge, FilterType::Nearest)
        .save(&dest)
    {
        Err(err) => {
            warn!("resize image to thumbnail error: {err}");
            info!("image will be directly save to {}", dest.as_ref().display());
            let _ = tokio::fs::hard_link(original, dest).await;
            Ok(())
        }
        Ok(_) => Ok(()),
    }
}
