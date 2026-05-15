<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { ALL_ALGOS, hashText, hashFile, shannonEntropy, type HashAlgo } from '$lib/utils/hash';

  type Mode = 'text' | 'file';
  let mode: Mode = $state('text');
  let text = $state('');
  let textHashes = $state<Record<HashAlgo, string> | null>(null);
  let textComputing = $state(false);
  let textError = $state('');

  let fileName = $state('');
  let fileSize = $state(0);
  let fileEntropy = $state<number | null>(null);
  let fileHashes = $state<Record<HashAlgo, string> | null>(null);
  let fileProgress = $state(0);
  let fileComputing = $state(false);
  let fileError = $state('');
  let dragOver = $state(false);

  const formatBytes = (n: number): string => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  $effect(() => {
    // recompute text hashes whenever text changes
    const t = text;
    if (mode !== 'text') return;
    if (!t) { textHashes = null; textError = ''; return; }
    textComputing = true;
    Promise.all(ALL_ALGOS.map(async (a) => [a, await hashText(a, t)] as const))
      .then((entries) => {
        textHashes = Object.fromEntries(entries) as Record<HashAlgo, string>;
        textError = '';
      })
      .catch((e: unknown) => { textError = e instanceof Error ? e.message : String(e); })
      .finally(() => { textComputing = false; });
  });

  async function processFile(file: File) {
    fileError = '';
    fileName = file.name;
    fileSize = file.size;
    fileEntropy = null;
    fileHashes = null;
    fileComputing = true;
    fileProgress = 0;
    try {
      // entropy on first chunk to keep it fast for huge files
      const sniffSize = Math.min(file.size, 1024 * 1024); // up to 1 MB
      const sniff = new Uint8Array(await file.slice(0, sniffSize).arrayBuffer());
      fileEntropy = shannonEntropy(sniff);

      fileHashes = await hashFile(ALL_ALGOS, file, (loaded, total) => {
        fileProgress = total ? loaded / total : 0;
      });
      fileProgress = 1;
    } catch (e: unknown) {
      fileError = e instanceof Error ? e.message : String(e);
    } finally {
      fileComputing = false;
    }
  }

  function onFileInput(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) processFile(f);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) processFile(f);
  }
</script>

<svelte:head>
  <title>Hashes · tools.gaanesh.com</title>
  <meta name="description" content="Compute MD5, SHA-1, SHA-256, SHA-512, SHA-3-256 hashes for text or files. Entirely in your browser." />
</svelte:head>

<ToolFrame toolId="hash" command={mode === 'text' ? 'sha 256 < text' : 'sha 256 < file'}>
  {#snippet note()}
    SubtleCrypto powers SHA-1/256/512. MD5 + SHA-3-256 are computed inline (no external deps).
  {/snippet}

  <!-- Mode tabs -->
  <div class="mb-5 inline-flex rounded-full border border-ghost-200/70 bg-ghost-50 p-1 font-mono text-xs dark:border-ink-600/60 dark:bg-ink-900/60">
    {#each ['text', 'file'] as m}
      <button
        type="button"
        onclick={() => (mode = m as Mode)}
        class="rounded-full px-4 py-1.5 transition {mode === m ? 'bg-ink-900 text-neon-cyan dark:bg-ink-700' : 'text-ghost-500 hover:text-ink-900 dark:hover:text-white'}"
      >
        {m}
      </button>
    {/each}
  </div>

  {#if mode === 'text'}
    <div class="space-y-4">
      <label class="block">
        <span class="mb-1 block font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">input</span>
        <textarea
          bind:value={text}
          rows="6"
          placeholder="Paste or type some text…"
          class="w-full resize-y rounded-xl border border-ghost-200/70 bg-white/95 px-4 py-3 font-mono text-sm text-ink-900 outline-none transition focus:border-neon-cyan/60 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100"
        ></textarea>
      </label>

      {#if textError}
        <p class="rounded-lg border border-neon-rose/30 bg-neon-rose/10 p-3 font-mono text-xs text-neon-rose">{textError}</p>
      {/if}

      <div class="grid gap-2">
        {#each ALL_ALGOS as algo}
          <div class="flex items-center gap-3 rounded-xl border border-ghost-200/60 bg-ghost-50/70 p-3 dark:border-ink-600/60 dark:bg-ink-950/60">
            <span class="w-20 shrink-0 font-mono text-xs font-semibold text-neon-cyan">{algo}</span>
            <span class="min-w-0 flex-1 truncate font-mono text-xs text-ink-700 dark:text-ghost-200">
              {textHashes?.[algo] ?? (textComputing ? 'computing…' : '—')}
            </span>
            {#if textHashes?.[algo]}
              <CopyButton value={textHashes[algo]} />
            {/if}
          </div>
        {/each}
      </div>

      <p class="font-mono text-[11px] text-ghost-500">
        bytes: <span class="text-neon-cyan">{new TextEncoder().encode(text).length}</span>
      </p>
    </div>
  {:else}
    <div class="space-y-4">
      <label
        class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ghost-300 bg-ghost-50/70 px-6 py-10 text-center transition hover:border-neon-cyan/50 dark:border-ink-600 dark:bg-ink-950/40 {dragOver ? 'border-neon-cyan/70 bg-neon-cyan/5' : ''}"
        ondragover={(e) => { e.preventDefault(); dragOver = true; }}
        ondragleave={() => (dragOver = false)}
        ondrop={onDrop}
      >
        <Icon name="upload" size={24} class="text-neon-cyan" />
        <span class="font-mono text-sm text-ink-900 dark:text-ghost-100">Drop a file or click to choose</span>
        <span class="font-mono text-[11px] text-ghost-500">Read entirely in-memory; never uploaded.</span>
        <input type="file" class="hidden" onchange={onFileInput} />
      </label>

      {#if fileError}
        <p class="rounded-lg border border-neon-rose/30 bg-neon-rose/10 p-3 font-mono text-xs text-neon-rose">{fileError}</p>
      {/if}

      {#if fileName}
        <div class="space-y-3 rounded-2xl border border-ghost-200/60 bg-white/95 p-4 dark:border-ink-600/60 dark:bg-ink-800/60">
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs sm:grid-cols-3">
            <div><span class="text-ghost-500">name:</span> <span class="text-ink-900 dark:text-ghost-100">{fileName}</span></div>
            <div><span class="text-ghost-500">size:</span> <span class="text-ink-900 dark:text-ghost-100">{formatBytes(fileSize)}</span></div>
            {#if fileEntropy !== null}
              <div><span class="text-ghost-500">entropy:</span> <span class="text-neon-cyan">{fileEntropy.toFixed(3)} bits/byte</span></div>
            {/if}
          </div>

          {#if fileComputing}
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-ghost-200/60 dark:bg-ink-700/70">
              <div class="h-full rounded-full bg-neon-cyan transition-[width]" style="width: {(fileProgress * 100).toFixed(1)}%;"></div>
            </div>
          {/if}

          <div class="grid gap-2">
            {#each ALL_ALGOS as algo}
              <div class="flex items-center gap-3 rounded-xl border border-ghost-200/60 bg-ghost-50/70 p-3 dark:border-ink-600/60 dark:bg-ink-950/60">
                <span class="w-20 shrink-0 font-mono text-xs font-semibold text-neon-cyan">{algo}</span>
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-ink-700 dark:text-ghost-200">
                  {fileHashes?.[algo] ?? (fileComputing ? 'computing…' : '—')}
                </span>
                {#if fileHashes?.[algo]}<CopyButton value={fileHashes[algo]} />{/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</ToolFrame>
