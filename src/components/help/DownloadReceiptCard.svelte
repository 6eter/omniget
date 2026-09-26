<script lang="ts">
  import { helpDownloadStrings } from '$lib/help/strings';
  import { locale } from '$lib/i18n';
  import { getDownloads } from '$lib/stores/download-store.svelte';
  import type { DownloadReceipt } from '$lib/help/tool-results';
  let {id,receipt}:{id:number;receipt?:DownloadReceipt}=$props();
  let live=$derived(getDownloads().get(id));
  let lastLive=$state<DownloadReceipt|undefined>();
  $effect(()=>{if(live)lastLive={id:live.id,title:live.name,status:live.status,percent:live.percent,historical:false};});
  let item=$derived(lastLive??receipt);
  let copy=$derived(helpDownloadStrings($locale));
  let label=$derived(live?copy.live:copy.historical);
  let showPercent=$derived(item?.percent!=null&&item.status.toLowerCase()!=='unknown');
</script>
<a class="download-card" href="/downloads">
  <strong>{item?.title||`Download #${id}`}</strong>
  <small>{label} · #{id}</small>
  <span>{copy.status(item?.status??'unknown')}{#if showPercent&&item?.percent!=null} · {Math.round(item.percent)}%{/if}</span>
  {#if showPercent&&item?.percent!=null}<progress max="100" value={item.percent}></progress>{/if}
  {#if live?.error}<span>{live.error}</span>{/if}
</a>
<style>
.download-card{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--separator);border-radius:8px;margin-top:10px;text-decoration:none;color:var(--text)}small{color:var(--text-muted)}progress{width:100%;accent-color:var(--accent)}a:focus-visible{outline:2px solid var(--accent-hi,var(--accent));outline-offset:3px}
</style>
