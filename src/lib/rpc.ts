import { invoke } from "@tauri-apps/api/core";
import { getDownloadStats } from "$lib/stores/download-stats.svelte";

export async function rpcSyncIdleStats(): Promise<void> {
  const stats = getDownloadStats();
  try {
    await invoke("rpc_set_idle_stats", {
      downloadsCount: stats.totalDownloads,
      totalBytes: stats.totalBytes,
    });
  } catch {}
}

export async function rpcTestConnection(): Promise<{ ok: boolean; reason?: string }> {
  return await invoke("rpc_test_connection");
}
