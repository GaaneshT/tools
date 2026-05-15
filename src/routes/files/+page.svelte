<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { tools } from '$lib/tools';

  const fileTools = tools.filter((t) => t.category === 'files');
</script>

<svelte:head>
  <title>Files · tools.gaanesh.com</title>
  <meta name="description" content="Image and PDF utilities, all running in your browser." />
</svelte:head>

<ToolFrame toolId="image" command="cd files/">
  {#snippet note()}
    Image and PDF utilities — image cropping, format conversion, metadata cleanup, PDF split/merge, image-to-PDF.
  {/snippet}

  <div class="grid gap-4 md:grid-cols-2">
    {#each fileTools as tool}
      <a
        href={tool.path}
        class="group flex items-start gap-4 rounded-2xl border border-ghost-200/70 bg-white/95 p-5 transition hover:-translate-y-0.5 hover:border-neon-violet/50 dark:border-ink-600/60 dark:bg-ink-800/60"
      >
        <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ghost-200/60 bg-ghost-50 text-neon-violet dark:border-ink-600 dark:bg-ink-900/60">
          <Icon name={tool.icon} size={22} />
        </span>
        <div class="min-w-0">
          <h3 class="font-semibold text-ink-900 transition group-hover:text-neon-violet dark:text-white">{tool.name}</h3>
          <p class="mt-1 text-sm text-ink-600 dark:text-ghost-300">{tool.blurb}</p>
          <span class="mt-2 inline-block font-mono text-[11px] text-ghost-500 dark:text-ghost-400">{tool.path}</span>
        </div>
      </a>
    {/each}
  </div>
</ToolFrame>
