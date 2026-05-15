<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    value = '',
    label = 'copy',
    class: className = ''
  }: { value: string | (() => string); label?: string; class?: string } = $props();

  let copied = $state(false);

  const click = async () => {
    const v = typeof value === 'function' ? value() : value;
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // noop
    }
  };
</script>

<button
  type="button"
  onclick={click}
  class="inline-flex items-center gap-1.5 rounded-md border border-ink-600/60 bg-ink-800/70 px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wide text-ghost-300 transition hover:border-neon-cyan/50 hover:text-white {className}"
>
  <Icon name={copied ? 'check' : 'copy'} size={11} />
  {copied ? 'copied' : label}
</button>
