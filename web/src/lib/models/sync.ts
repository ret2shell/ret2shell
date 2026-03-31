import type { DateTime } from "luxon";

export type RemoteSyncState = "mirror_locked" | "detached";

export type GameSyncStatus = {
  sync_key: string | null;
  sync_token: string | null;
  readonly: boolean;
  remote_state: RemoteSyncState | null;
  remote_release_id: string | null;
  remote_first_party_base_url: string | null;
};

export type SyncRegistrySource = {
  id: number;
  name: string;
  git_url: string;
  branch: string;
  enabled: boolean;
  priority: number;
  last_fetched_at: DateTime | null;
  last_error: string | null;
  created_at: DateTime;
  updated_at: DateTime;
};

export type GameReleaseSummary = {
  id: number;
  game_id: number;
  game_key: string;
  release_id: string;
  snapshot_commit: string;
  manifest_sha256: string;
  origin_role: "first_party" | "mirror";
  first_party_instance_id: string;
  first_party_base_url: string;
  published_at: DateTime;
  created_at: DateTime;
};

export type RegistryPublicationMetadata = {
  release: GameReleaseSummary;
  release_file_path: string;
  release_file_content: string;
  upstream_file_path: string;
  upstream_file_content: string;
};

export type RegistryUpstreamMetadata = {
  release: GameReleaseSummary;
  upstream_file_path: string;
  upstream_file_content: string;
};

export type CatalogGame = {
  game_key: string;
  release_count: number;
};

export type CatalogRelease = {
  game_key: string;
  release_id: string;
  snapshot_commit: string;
  first_party_instance_id: string;
  first_party_base_url: string;
  published_at: DateTime;
};

export type CatalogUpstream = {
  instance_id: string;
  role: string;
  base_url: string;
  auth_mode: string;
  protocol_version: number;
  published_at: DateTime;
};

export type CatalogReleaseConflict = {
  source_id: number;
  source_name: string;
  manifest_sha256: string;
  snapshot_commit: string;
};

export type CatalogReleaseDetail = {
  game_key: string;
  release_id: string;
  snapshot_commit: string;
  manifest_sha256: string;
  upstreams: CatalogUpstream[];
  conflicts: CatalogReleaseConflict[];
};

export type RemoteSyncInfo = {
  instance_id: string;
  base_url: string;
  protocol_version: number;
};

export type RemoteSyncGameSummary = {
  game_key: string;
  release_count: number;
};

export type RemoteSyncReleaseSummary = {
  game_key: string;
  release_id: string;
  snapshot_commit: string;
  first_party_instance_id: string;
  first_party_base_url: string;
  published_at: number;
};

export type RemoteSyncReleaseDetail = {
  game_key: string;
  release_id: string;
  snapshot_commit: string;
  manifest_sha256: string;
  manifest_body: string;
  first_party_instance_id: string;
  first_party_base_url: string;
  published_at: number;
};

export type DirectDiscoverResponse = {
  info: RemoteSyncInfo;
  games: RemoteSyncGameSummary[] | null;
  releases: RemoteSyncReleaseSummary[] | null;
  release: RemoteSyncReleaseDetail | null;
};

export type SyncJobStatus = "pending" | "running" | "paused" | "failed" | "completed" | "cancelled";

export type SyncJobMode = "registry" | "direct";

export type SyncJob = {
  id: number;
  mode: SyncJobMode;
  status: SyncJobStatus;
  stage: string;
  game_id: number | null;
  game_key: string | null;
  release_id: string | null;
  registry_source_id: number | null;
  upstream_instance_id: string | null;
  upstream_base_url: string | null;
  error_message: string | null;
  can_resume: boolean;
  can_cancel: boolean;
  created_at: DateTime;
  updated_at: DateTime;
  finished_at: DateTime | null;
};

export type SyncJobRequest = {
  base_url: string;
  has_sync_token: boolean;
  game_key: string;
  release_id: string;
};

export type SyncJobDiscovered = {
  remote_instance_id: string;
  remote_base_url: string;
  protocol_version: number;
  snapshot_commit: string;
  manifest_sha256: string;
  first_party_instance_id: string;
  first_party_base_url: string;
  published_at: DateTime;
  media_total: number;
  oci_total: number;
};

export type SyncJobRepoCheckpoint = {
  initialized: boolean;
  fetched_release_ref: boolean;
  checked_out_snapshot: boolean;
  verified_snapshot: boolean;
};

export type SyncJobAssetCheckpoint = {
  done: number;
  total: number;
  completed: boolean;
};

export type SyncJobCheckpoint = {
  bucket_name: string | null;
  discovered: SyncJobDiscovered | null;
  repo: SyncJobRepoCheckpoint;
  media: SyncJobAssetCheckpoint;
  oci: SyncJobAssetCheckpoint;
};

export type SyncJobDetail = SyncJob & {
  request: SyncJobRequest;
  checkpoint: SyncJobCheckpoint;
};
