<script lang="ts">
  /** Placeholder for the local tab; it is built in a later phase. */
  import SurfaceGuide from "$components/llm/SurfaceGuide.svelte";
  import { t } from "$lib/i18n";
</script>

<svelte:head><title>{$t("llm.tab.local")}</title></svelte:head>

<div class="page soon">
  <h1 class="page-title">{$t("llm.tab.local")}</h1>
  <SurfaceGuide text={$t("llm.surface.local_hint")} steps={$t("llm.surface.local_steps").split("|")} href="/help?article=local#guide" />
  <p class="page-lede">{$t("llm.local.explanation")}</p>
  <a class="button" href="/llm/models">{$t("llm.tab.models")} →</a>
</div>

<style>
  .soon {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
