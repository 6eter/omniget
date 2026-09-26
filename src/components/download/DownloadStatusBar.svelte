<script lang="ts">
  import { page } from "$app/state";
  import { t, locale } from "$lib/i18n";
  import DownloadSpeedGraph from "./DownloadSpeedGraph.svelte";
  import {
    getAggregate,
    getAggregateSpeedHistory,
    dismissAggregateFailures,
    formatBytes,
    formatSpeed,
    formatEta,
  } from "$lib/stores/download-store.svelte";

  let agg = $derived(getAggregate());
  let busy = $derived(agg.outcome === "working");
  let expiredBatch = $state(-1);
  let showComplete = $derived(
    agg.outcome === "complete" && agg.failedCount === 0 && expiredBatch !== agg.batchId,
  );
  let visible = $derived(busy || agg.failedCount > 0 || showComplete);
  let onDownloads = $derived(page.url.pathname.replace(/\/$/, "") === "/downloads");
  let allPaused = $derived(agg.activeCount === 0 && agg.queuedCount === 0 && agg.pausedCount > 0);
  let percent = $derived(agg.percent === null ? null : Math.floor(agg.percent));
  let etaText = $derived(formatEta(agg.etaSeconds));
  let indeterminate = $derived(busy && agg.percent === null && agg.activeCount > 0);
  let stateIcon = $derived(
    agg.failedCount > 0 ? "shield-warning"
      : showComplete ? "list-checks"
      : allPaused ? "pause"
      : "tray-arrow-down",
  );
  let summary = $derived.by(() => {
    if (showComplete) return $t("downloads.status_bar.complete") as string;
    const parts: string[] = [];
    if (agg.activeCount) parts.push($t("downloads.status_bar.active", { count: agg.activeCount }) as string);
    if (agg.pausedCount) {
      parts.push(allPaused
        ? $t("downloads.status_bar.paused_all") as string
        : $t("downloads.status_bar.paused", { count: agg.pausedCount }) as string);
    }
    if (agg.queuedCount) parts.push($t("downloads.status_bar.queued", { count: agg.queuedCount }) as string);
    if (agg.failedCount) parts.push($t("downloads.status_bar.failed", { count: agg.failedCount }) as string);
    return parts.join(" · ");
  });
  let progressText = $derived.by(() => {
    if (agg.totalBytes !== null) {
      return `${percent}% · ${formatBytes(agg.downloadedBytes)} / ${formatBytes(agg.totalBytes)}`;
    }
    const transferred = $t("downloads.status_bar.transferred", {
      size: formatBytes(agg.downloadedBytes),
    }) as string;
    return percent === null ? transferred : `${percent}% · ${transferred}`;
  });

  let completionKey = $derived(agg.outcome === "complete" ? agg.batchId : null);
  $effect(() => {
    const batch = completionKey;
    if (batch === null) return;
    const timer = setTimeout(() => { expiredBatch = batch; }, 2000);
    return () => clearTimeout(timer);
  });

  let announceKey = $derived(!visible ? "" : [
    $locale, agg.batchId, agg.outcome,
    agg.activeCount, agg.queuedCount, agg.pausedCount, agg.failedCount,
    percent === null ? "unknown" : Math.floor(percent / 25),
  ].join(":"));
  let announcement = $state("");
  let lastKey = "";
  $effect(() => {
    if (announceKey === lastKey) return;
    lastKey = announceKey;
    announcement = visible ? summary + (busy && percent !== null ? `, ${percent}%` : "") : "";
  });

  function dismissFailures() {
    const target = document.querySelector<HTMLElement>(busy && !onDownloads ? ".dl-link" : "main");
    if (target) {
      const hadTabIndex = target.hasAttribute("tabindex");
      if (!hadTabIndex) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      if (!hadTabIndex) {
        target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
      }
    }
    dismissAggregateFailures();
  }
</script>

<span class="dl-sr" aria-live="polite" aria-atomic="true">{announcement}</span>
{#if visible}
  <section
    class="dl-status-bar"
    class:is-complete={showComplete}
    class:has-failures={agg.failedCount > 0}
    aria-label={$t("downloads.status_bar.region_label") as string}
  >
    {#if busy || showComplete}
      <div
        class="progress dl-track"
        class:indeterminate={indeterminate}
        role="progressbar"
        aria-label={$t("downloads.status_bar.region_label") as string}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={showComplete ? 100 : percent ?? undefined}
        aria-valuetext={showComplete ? summary : `${summary}, ${progressText}`}
      >
        <div
          class="progress-fill"
          class:success={showComplete}
          class:paused={allPaused}
          style:width={showComplete ? "100%" : agg.percent !== null ? `${agg.percent}%` : indeterminate ? undefined : "0%"}
        ></div>
      </div>
    {/if}
    <div class="dl-content">
      <div class="dl-summary">
        <span class="dl-icon" style:--glyph={`url(/icons/${stateIcon}.svg)`} aria-hidden="true"></span>
        <span>{summary}</span>
      </div>
      {#if busy}
        <div class="dl-metrics">
          <bdi class="dl-size" dir={agg.totalBytes !== null ? "ltr" : "auto"}>{progressText}</bdi>
          {#if agg.activeCount > 0}
            <bdi dir="ltr">{formatSpeed(agg.speedBps)}</bdi>
          {/if}
          {#if etaText}
            <span class="dl-eta">{$t("downloads.status_bar.eta", { eta: etaText })}</span>
          {/if}
          {#if agg.activeCount > 0}
            <span class="dl-graph" aria-hidden="true">
              <DownloadSpeedGraph
                points={getAggregateSpeedHistory()}
                windowMs={30_000}
                width={132}
                height={30}
                showTooltip={false}
                status
              />
            </span>
          {/if}
        </div>
      {/if}
      <div class="dl-actions">
        {#if !onDownloads}
          <a class="dl-link" href="/downloads">{$t("downloads.status_bar.open")}</a>
        {/if}
        {#if agg.failedCount > 0}
          <button class="dl-dismiss" onclick={dismissFailures}>{$t("downloads.status_bar.dismiss")}</button>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .dl-status-bar  {
    flex: 0 0 auto;
    min-width: 0;
    background: var(--surface-mut);
    border-top: var(--hairline) solid var(--border);
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    container-type: inline-size;
  }

  .dl-track  {
    height: 3px;
    margin-block-end: var(--space-2);
  }

  .dl-track .progress-fill:not(.success):not(.paused)  {
    background: var(--accent-text);
  }

  .dl-content  {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-1) var(--space-3);
  }

  .dl-summary  {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    font-size: var(--text-base);
    font-weight: 500;
    line-height: var(--leading-base);
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .dl-icon  {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    background: currentColor;
    mask: var(--glyph) center / contain no-repeat;
    pointer-events: none;
  }

  .is-complete .dl-icon  {
    color: var(--success);
  }

  .has-failures .dl-icon  {
    color: var(--error);
  }

  .dl-metrics  {
    grid-column: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .dl-size  {
    color: var(--text);
  }

  .dl-graph  {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
  }

  .dl-actions  {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .dl-link, .dl-dismiss  {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    font: inherit;
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
  }

  .dl-link  {
    color: var(--accent-text);
  }

  .dl-dismiss  {
    color: var(--text-muted);
  }

  @media (hover: hover)  {
    .dl-link:hover, .dl-dismiss:hover  {
      background: var(--accent-soft);
      color: var(--text);
    }

  }

  .dl-link:active, .dl-dismiss:active  {
    background: var(--accent-soft);
  }

  .dl-link:focus-visible, .dl-dismiss:focus-visible  {
    outline: 2px solid var(--accent-text);
    outline-offset: var(--focus-ring-offset);
  }

  @container (min-width: 1000px)  {
    .dl-content  {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }

    .dl-metrics  {
      grid-column: 2;
      grid-row: 1;
    }

    .dl-actions  {
      grid-column: 3;
      grid-row: 1;
    }

  }

  @container (max-width: 640px)  {
    .dl-metrics  {
      grid-column: 1 / -1;
    }

    .dl-actions  {
      grid-row: 1;
      max-width: 160px;
    }

    .dl-graph  {
      display: none;
    }

  }

  @container (max-width: 360px)  {
    .dl-content  {
      grid-template-columns: minmax(0, 1fr);
    }

    .dl-actions  {
      grid-column: 1;
      grid-row: auto;
      max-width: none;
      justify-content: flex-start;
    }

    .dl-eta  {
      display: none;
    }

  }

  .dl-sr  {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (forced-colors: active)  {
    .dl-icon  {
      background: CanvasText;
    }

    .dl-track  {
      border: 1px solid CanvasText;
    }

    .dl-track .progress-fill  {
      background: Highlight;
    }

  }

  @media (prefers-reduced-motion: reduce)  {
    .dl-track .progress-fill  {
      animation: none;
      transition: none;
      transform: none;
    }

  }

  :global([data-reduce-motion="true"]) .dl-track .progress-fill  {
    animation: none;
    transition: none;
    transform: none;
  }
</style>
