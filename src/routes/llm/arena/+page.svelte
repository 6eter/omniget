<script lang="ts">
  /** Placeholder for the arena tab; it is built in a later phase. */
  import SurfaceGuide from "$components/llm/SurfaceGuide.svelte";
  import { t } from "$lib/i18n";
</script>

<svelte:head><title>{$t("llm.tab.arena")}</title></svelte:head>

<div class="page soon">
  <h1 class="page-title">{$t("llm.tab.arena")}</h1>
  <span class="tag">{$t("llm.surface.unavailable_feature")}</span>
  <SurfaceGuide text={$t("llm.surface.arena_hint")} steps={$t("llm.surface.arena_steps").split("|")} href="/help?article=models#guide" />
  <p class="page-lede">{$t("llm.arena.explanation")}</p>
  <a class="button" href="/llm">{$t("llm.tab.chat")} →</a>
</div>

<style>
  .soon {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
