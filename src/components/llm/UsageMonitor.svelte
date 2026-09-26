<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { acquireLimitsMonitor, getLimitsMonitor, saveLimitsPrefs } from '$lib/stores/limits-monitor.svelte';
  import LimitsStrip from './accounts/LimitsStrip.svelte';
  let monitor = $derived(getLimitsMonitor());
  let open = $state(false);
  let trigger: HTMLButtonElement;
  let attention = $derived(!!monitor.error || (monitor.prefs?.enabled && (!monitor.rings.length || monitor.rings.some(r => r.status !== 'ok'))));
  let status = $derived(attention ? 'attention' : monitor.prefs?.enabled ? 'on' : 'off');
  onMount(acquireLimitsMonitor);
  function close() { open = false; trigger?.focus(); }
</script>
<svelte:window onkeydown={e => { if (open && e.key === 'Escape') { e.preventDefault(); close(); } }} />
<div class="monitor">
  <button bind:this={trigger} class="monitor-trigger" aria-expanded={open} aria-controls="usage-monitor" onclick={() => open = !open}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>
    {$t('llm.workspace.monitor')} <span>{$t(`llm.workspace.${status}`)}</span>
  </button>
  {#if open}
    <section id="usage-monitor" class="monitor-panel" aria-label={$t('llm.workspace.monitor')}>
      <h2>{$t('llm.workspace.quotas')}</h2>
      {#if monitor.prefs}
        <button class="button" role="switch" aria-checked={monitor.prefs.enabled} disabled={monitor.busy} onclick={() => monitor.prefs && saveLimitsPrefs({ ...monitor.prefs, enabled: !monitor.prefs.enabled })}>{$t('llm.limits.enable')}: {$t(`llm.workspace.${monitor.prefs.enabled ? 'on' : 'off'}`)}</button>
      {/if}
      {#if monitor.error}<p role="alert">{monitor.error}</p>{/if}
      {#each monitor.rings as ring (ring.id)}
        <div class="source"><strong>{ring.label}{#if ring.account?.label || ring.account?.email} · {ring.account.label ?? ring.account.email}{/if}</strong><span>{ring.status === 'ok' ? '' : $t(`llm.limits.strip.status.${ring.status}`)}</span>
          {#each ring.reading?.windows ?? [] as window (window.id)}<p>{window.label}: {window.used === null ? $t('llm.workspace.unknown') : `${Math.round(window.used * 100)}%`}</p>{/each}
          <small>{$t('llm.workspace.updated')}: {ring.read_at ? new Date(ring.read_at).toLocaleString() : $t('llm.workspace.unknown')}</small>
        </div>
      {/each}
      <p class="hint">{$t('llm.workspace.monitor_hint')}</p>
      <details><summary>{$t('llm.workspace.sources')}</summary><LimitsStrip /></details>
      <a href="/llm/accounts#usage" onclick={close}>{$t('llm.workspace.usage')}</a>
      <a href="/llm/observatory" onclick={close}>{$t('llm.workspace.activity_hint')}</a>
    </section>
  {/if}
</div>
<style>
  .monitor { position: relative; }
  .monitor-trigger { display: flex; gap: 8px; align-items: center; padding: 8px 10px; background: var(--surface); color: var(--text); border: 1px solid var(--separator); border-radius: 8px; font: inherit; font-size: 12px; cursor: pointer; }
  .monitor-trigger span { color: var(--text-muted); }
  .monitor-panel { position: absolute; z-index: 40; inset-inline-end: 0; top: calc(100% + 8px); width: min(390px, calc(100vw - 40px)); max-height: 65vh; overflow: auto; padding: 20px; background: var(--surface-hi); color: var(--text); border: 1px solid var(--separator); border-radius: 12px; box-shadow: var(--elev-3); }
  h2 { font-size: 16px; margin: 0 0 12px; } .hint, small { font-size: 12px; color: var(--text-muted); }
  .source { padding-block: 12px; border-bottom: 1px solid var(--separator); } .source span { margin-inline-start: 8px; } .source p { margin: 4px 0; }
  summary { cursor: pointer; padding-block: 12px; } a { display: block; padding-block: 8px; color: var(--accent-hi); }
</style>
