<script lang="ts">
  import { onMount } from 'svelte';
  import { tools, categories } from '$lib/tools';
  import { identity } from '$lib/identity';
  import Icon from '$lib/components/Icon.svelte';
  import PromptHeading from '$lib/components/PromptHeading.svelte';

  const lines = [
    { prompt: '$', cmd: 'whoami' },
    { out: identity.tagline },
    { prompt: '$', cmd: `ls ~/toolbelt | wc -l` },
    { out: `${tools.length} tools available` },
    { prompt: '$', cmd: 'cat philosophy.txt' },
    { out: 'No uploads. No analytics. No backend. Open devtools and verify.' },
    { prompt: '$', cmd: '_' }
  ];

  let visibleCount = $state(0);
  let mounted = $state(false);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    mounted = true;
    if (reducedMotion) { visibleCount = lines.length; return; }
    let i = 0;
    const tick = () => {
      visibleCount = ++i;
      if (i < lines.length) setTimeout(tick, 340);
    };
    setTimeout(tick, 220);
  });

  const accentClasses: Record<NonNullable<(typeof tools)[number]['accent']>, string> = {
    cyan:   'group-hover:border-neon-cyan/50 [&_.tool-accent]:from-neon-cyan',
    violet: 'group-hover:border-neon-violet/50 [&_.tool-accent]:from-neon-violet',
    green:  'group-hover:border-neon-green/50 [&_.tool-accent]:from-neon-green',
    amber:  'group-hover:border-neon-amber/50 [&_.tool-accent]:from-neon-amber',
    rose:   'group-hover:border-neon-rose/50 [&_.tool-accent]:from-neon-rose',
    teal:   'group-hover:border-neon-teal/50 [&_.tool-accent]:from-neon-teal'
  };

  const statusBadge = (s: 'ready' | 'beta' | 'planned') => {
    if (s === 'ready')   return { label: 'ready',   cls: 'bg-neon-green/15 text-neon-green ring-1 ring-neon-green/30' };
    if (s === 'beta')    return { label: 'beta',    cls: 'bg-neon-amber/15 text-neon-amber ring-1 ring-neon-amber/30' };
    return                     { label: 'planned', cls: 'bg-ghost-500/15 text-ghost-300 ring-1 ring-ghost-500/30' };
  };

  const grouped = categories
    .map((cat) => ({ ...cat, items: tools.filter((t) => t.category === cat.id) }))
    .filter((c) => c.items.length > 0);
</script>

<svelte:head>
  <title>Toolbelt · gaanesh tools</title>
</svelte:head>

<!-- Terminal hero -->
<section class="relative overflow-hidden rounded-3xl border border-ghost-200/60 bg-white/85 p-6 shadow-2xl backdrop-blur-xl transition-colors dark:border-ink-600/60 dark:bg-ink-900/70 sm:p-8 md:p-10">
  <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-neon-cyan/[0.06] via-transparent to-neon-violet/[0.06]"></div>
  <div class="pointer-events-none absolute -right-24 top-10 hidden h-72 w-72 rounded-full bg-neon-cyan/10 blur-3xl md:block"></div>

  <div class="relative z-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_280px] md:items-center">
    <!-- Terminal -->
    <div>
      <div class="overflow-hidden rounded-2xl border border-ghost-200/70 bg-ghost-50 shadow-[var(--shadow-inset-line)] dark:border-ink-600 dark:bg-ink-950/80">
        <div class="flex items-center justify-between gap-3 border-b border-ghost-200/70 bg-white/60 px-3.5 py-2 font-mono text-[11px] text-ghost-500 dark:border-ink-600 dark:bg-ink-900/80 dark:text-ghost-400">
          <div class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-neon-rose/70"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-neon-amber/70"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-neon-green/70"></span>
          </div>
          <span class="truncate">{identity.handle}@{identity.host}:~</span>
          <span class="inline-flex items-center gap-1.5"><span class="dot-live"></span> live</span>
        </div>

        <div class="px-4 py-3.5 font-mono text-[13px] leading-relaxed sm:text-sm" style="min-height: 12rem;">
          {#each lines.slice(0, visibleCount) as line, i (i)}
            {#if line.prompt}
              <div class="text-ghost-700 dark:text-ghost-200">
                <span class="text-neon-green">{identity.handle}</span><span class="text-ghost-400">@</span><span class="text-neon-violet">{identity.host}</span><span class="text-ghost-400">:~$</span>
                <span class="ml-2 {i === visibleCount - 1 && line.cmd === '_' ? 'cursor' : ''} text-ink-900 dark:text-ghost-100">{line.cmd === '_' ? '' : line.cmd}</span>
              </div>
            {:else if line.out}
              <div class="pl-1 text-ink-900 dark:text-ghost-100">{line.out}</div>
            {/if}
          {/each}
          {#if !mounted}
            <div class="text-ghost-700 dark:text-ghost-200"><span class="text-neon-green">{identity.handle}</span><span class="text-ghost-400">@</span><span class="text-neon-violet">{identity.host}</span><span class="text-ghost-400">:~$</span> <span class="ml-2 text-ink-900 dark:text-ghost-100">whoami</span></div>
            <div class="pl-1 text-ink-900 dark:text-ghost-100">{identity.tagline}</div>
            <div class="pl-1 text-ink-900 dark:text-ghost-100">{tools.length} tools available</div>
          {/if}
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          class="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2 font-mono text-xs font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-ink-700 dark:bg-ghost-100 dark:text-ink-900 dark:hover:bg-white"
        >
          <Icon name="search" size={12} /> find a tool
          <span class="ml-1 rounded border border-current/30 px-1 text-[10px] opacity-60">⌘K</span>
        </button>
        <a
          href="#toolbelt"
          class="inline-flex items-center gap-2 rounded-full border border-ghost-200/70 bg-white/90 px-4 py-2 font-mono text-xs font-medium text-ink-900 transition hover:-translate-y-0.5 hover:border-neon-cyan/50 dark:border-ink-600/70 dark:bg-ink-800/70 dark:text-ghost-100"
        >
          browse ↓
        </a>
      </div>
    </div>

    <!-- Privacy badge -->
    <div class="rounded-2xl border border-neon-green/30 bg-neon-green/5 p-5">
      <p class="font-mono text-[10px] uppercase tracking-[0.25em] text-neon-green">// guarantee</p>
      <p class="mt-2 text-sm font-semibold text-ink-900 dark:text-white">Nothing leaves your browser.</p>
      <p class="mt-2 text-xs text-ink-600 dark:text-ghost-300">Every byte stays on your device. No uploads, no telemetry, no third-party requests.</p>
      <p class="mt-3 inline-flex items-center gap-1.5 rounded-full border border-neon-green/30 bg-neon-green/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-neon-green">
        <span class="dot-live"></span> verified
      </p>
    </div>
  </div>
</section>

<!-- Toolbelt grid -->
<section id="toolbelt" class="space-y-10">
  {#each grouped as group}
    <div class="space-y-4">
      <PromptHeading path={group.id} command="ls">
        {group.items.length} {group.items.length === 1 ? 'tool' : 'tools'} · {group.label.toLowerCase()}
      </PromptHeading>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {#each group.items as tool}
          {@const badge = statusBadge(tool.status)}
          <a
            href={tool.path}
            class="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-ghost-200/70 bg-white/90 p-5 shadow-lg transition hover:-translate-y-1 hover:shadow-xl dark:border-ink-600/60 dark:bg-ink-800/60 {accentClasses[tool.accent ?? 'cyan']}"
          >
            <div class="tool-accent absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-current via-transparent to-transparent opacity-60 transition group-hover:opacity-100"></div>

            <div class="flex items-start justify-between gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-ghost-200/60 bg-ghost-50 text-{tool.accent ?? 'cyan'}-400 dark:border-ink-600 dark:bg-ink-900/60">
                <span class="text-neon-cyan"><Icon name={tool.icon} size={18} /></span>
              </div>
              <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] {badge.cls}">
                {#if badge.label === 'ready'}<span class="dot-live"></span>{/if}
                {badge.label}
              </span>
            </div>

            <h3 class="text-balance text-lg font-semibold text-ink-900 transition group-hover:text-neon-cyan dark:text-white">{tool.name}</h3>
            <p class="flex-1 text-pretty text-sm leading-relaxed text-ink-600 dark:text-ghost-300">{tool.blurb}</p>

            <div class="mt-2 flex items-center justify-between">
              <span class="font-mono text-[11px] text-ghost-500 dark:text-ghost-400">{tool.path}</span>
              <span class="font-mono text-xs text-neon-cyan transition group-hover:translate-x-0.5">open ↗</span>
            </div>
          </a>
        {/each}
      </div>
    </div>
  {/each}
</section>
