<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { tools } from '$lib/tools';
  import { externalLinks } from '$lib/identity';
  import Icon from './Icon.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  type Item = { id: string; label: string; hint: string; action: () => void; icon: string };

  let query = $state('');
  let selectedIdx = $state(0);
  let inputEl: HTMLInputElement | null = $state(null);

  const close = () => (open = false);
  const openUrl = (url: string) => () => { close(); window.open(url, '_blank', 'noopener,noreferrer'); };
  const navTo = (path: string) => () => { close(); goto(path); };

  const items = $derived<Item[]>([
    ...tools.map((t) => ({
      id: `tool:${t.id}`,
      label: t.name,
      hint: t.blurb,
      action: navTo(t.path),
      icon: t.icon
    })),
    ...externalLinks.map((l) => ({
      id: `link:${l.label}`,
      label: `Open ${l.label}`,
      hint: l.url.replace(/^https?:\/\//, ''),
      action: openUrl(l.url),
      icon: 'external'
    }))
  ]);

  const filtered = $derived(
    query.trim()
      ? items.filter((it) => (it.label + ' ' + it.hint).toLowerCase().includes(query.trim().toLowerCase()))
      : items
  );

  $effect(() => {
    if (selectedIdx >= filtered.length) selectedIdx = 0;
  });

  $effect(() => {
    if (open) {
      query = '';
      selectedIdx = 0;
      setTimeout(() => inputEl?.focus(), 30);
    }
  });

  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open = !open;
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); return; }
    if (e.key === 'Enter')     { e.preventDefault(); filtered[selectedIdx]?.action(); return; }
  }

  onMount(() => { window.addEventListener('keydown', onKey); });
  onDestroy(() => { if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey); });
</script>

{#if open}
  <div role="dialog" aria-modal="true" aria-label="Command palette" class="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh] backdrop-blur-md">
    <button type="button" class="absolute inset-0 cursor-default bg-ink-950/60" aria-label="Close palette" onclick={close}></button>

    <div class="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-ink-600/70 bg-ink-900/95 shadow-[var(--shadow-neon-cyan)] ring-1 ring-neon-cyan/10">
      <div class="flex items-center gap-3 border-b border-ink-600/60 px-4 py-3">
        <span class="text-neon-cyan"><Icon name="terminal" /></span>
        <input
          bind:this={inputEl}
          bind:value={query}
          placeholder="Type a tool name — try 'hash', 'jwt', 'finance'…"
          class="flex-1 bg-transparent font-mono text-sm text-ghost-100 placeholder-ghost-500 outline-none"
          autocomplete="off"
          spellcheck="false"
        />
        <span class="kbd">Esc</span>
      </div>

      <ul class="max-h-[55vh] overflow-y-auto py-1">
        {#if filtered.length === 0}
          <li class="px-4 py-6 text-center font-mono text-sm text-ghost-500">no matches.</li>
        {/if}
        {#each filtered as item, i (item.id)}
          <li>
            <button
              type="button"
              onclick={item.action}
              onmouseenter={() => (selectedIdx = i)}
              class="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition {selectedIdx === i ? 'bg-neon-cyan/10 text-white' : 'text-ghost-200 hover:bg-ink-800/80'}"
            >
              <span class="flex min-w-0 items-center gap-3">
                <span class="w-4 shrink-0 text-center text-neon-cyan"><Icon name={item.icon} size={14} /></span>
                <span class="truncate font-mono text-sm">{item.label}</span>
              </span>
              <span class="truncate font-mono text-[11px] text-ghost-500">{item.hint}</span>
            </button>
          </li>
        {/each}
      </ul>

      <div class="flex items-center justify-between border-t border-ink-600/60 px-4 py-2 text-[10px] font-mono text-ghost-500">
        <span><span class="kbd">↑</span> <span class="kbd">↓</span> navigate</span>
        <span><span class="kbd">↵</span> select</span>
        <span><span class="kbd">esc</span> close</span>
      </div>
    </div>
  </div>
{/if}
