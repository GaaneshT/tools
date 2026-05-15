<script lang="ts">
  import PromptHeading from './PromptHeading.svelte';
  import { tools } from '$lib/tools';

  let {
    toolId,
    command = null,
    children,
    note,
    actions
  }: {
    toolId: string;
    command?: string | null;
    children?: import('svelte').Snippet;
    note?: import('svelte').Snippet;
    actions?: import('svelte').Snippet;
  } = $props();

  const tool = tools.find((t) => t.id === toolId);
</script>

<section class="space-y-5">
  <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="space-y-2">
      <a
        href="/"
        class="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500 transition hover:text-neon-cyan"
      >
        ← back to toolbelt
      </a>
      <PromptHeading path={tool?.id ?? 'tool'} {command}>
        {tool?.blurb ?? ''}
      </PromptHeading>
      <h1 class="text-2xl font-semibold text-balance text-ink-900 dark:text-white sm:text-3xl">
        {tool?.name ?? 'Tool'}
      </h1>
      {#if note}<div class="font-mono text-xs text-ghost-500 dark:text-ghost-400">{@render note()}</div>{/if}
    </div>
    {#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
  </header>

  <div class="rounded-3xl border border-ghost-200/60 bg-white/85 p-5 shadow-xl backdrop-blur-xl dark:border-ink-600/60 dark:bg-ink-900/60 sm:p-7">
    {@render children?.()}
  </div>

  <p class="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">
    <span class="dot-live"></span> all computation happens in your browser · nothing leaves this tab
  </p>
</section>
