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
  class="inline-flex items-center gap-1.5 rounded-[3px] border border-ghost-300 bg-transparent px-2.5 py-1 text-[12.5px] font-medium text-ink-700 transition hover:border-neon-cyan hover:text-neon-cyan {className}"
>
  <Icon name={copied ? 'check' : 'copy'} size={11} />
  {copied ? 'copied' : label}
</button>
