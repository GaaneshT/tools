<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';

  type Codec = 'base64' | 'base64url' | 'url' | 'html' | 'hex' | 'binary' | 'json';
  const codecs: { id: Codec; label: string; hint: string }[] = [
    { id: 'base64',    label: 'Base64',     hint: 'standard padded' },
    { id: 'base64url', label: 'Base64URL',  hint: 'unpadded, URL-safe' },
    { id: 'url',       label: 'URL',        hint: 'percent-encoding' },
    { id: 'html',      label: 'HTML',       hint: 'entity escaping' },
    { id: 'hex',       label: 'Hex',        hint: 'lowercase, no spaces' },
    { id: 'binary',    label: 'Binary',     hint: '8-bit, space-separated' },
    { id: 'json',      label: 'JSON',       hint: 'string escape (no surrounding quotes)' }
  ];

  let codec: Codec = $state('base64');
  let input = $state('');
  let direction: 'encode' | 'decode' = $state('encode');

  // Encoder helpers --------------------------------------------------------
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  function strToBytes(s: string): Uint8Array { return encoder.encode(s); }
  function bytesToStr(b: Uint8Array): string { return decoder.decode(b); }

  function bytesToBase64(b: Uint8Array, urlSafe = false): string {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    const enc = btoa(s);
    return urlSafe ? enc.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') : enc;
  }
  function base64ToBytes(s: string, urlSafe = false): Uint8Array {
    let t = s.trim();
    if (urlSafe) {
      t = t.replaceAll('-', '+').replaceAll('_', '/');
      while (t.length % 4) t += '=';
    }
    const bin = atob(t);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToHex(b: Uint8Array): string {
    let s = '';
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  }
  function hexToBytes(s: string): Uint8Array {
    const clean = s.replace(/\s+/g, '');
    if (clean.length % 2) throw new Error('hex must have an even number of digits');
    if (!/^[0-9a-f]*$/i.test(clean)) throw new Error('hex contains invalid characters');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  function bytesToBinary(b: Uint8Array): string {
    const parts: string[] = new Array(b.length);
    for (let i = 0; i < b.length; i++) parts[i] = b[i].toString(2).padStart(8, '0');
    return parts.join(' ');
  }
  function binaryToBytes(s: string): Uint8Array {
    const tokens = s.split(/\s+/).filter(Boolean);
    const out = new Uint8Array(tokens.length);
    for (let i = 0; i < tokens.length; i++) {
      if (!/^[01]{1,8}$/.test(tokens[i])) throw new Error(`invalid binary token: "${tokens[i]}"`);
      const v = parseInt(tokens[i], 2);
      out[i] = v;
    }
    return out;
  }

  function htmlEncode(s: string): string {
    return s.replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
  }
  function htmlDecode(s: string): string {
    return s.replace(/&(amp|lt|gt|quot|#39|apos|#(?:x[0-9a-f]+|\d+));/gi, (_m, e: string) => {
      if (e === 'amp')  return '&';
      if (e === 'lt')   return '<';
      if (e === 'gt')   return '>';
      if (e === 'quot') return '"';
      if (e === '#39' || e === 'apos') return "'";
      if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#'))  return String.fromCodePoint(parseInt(e.slice(1), 10));
      return _m;
    });
  }

  function jsonEscape(s: string): string {
    // Use JSON.stringify and trim surrounding quotes
    return JSON.stringify(s).slice(1, -1);
  }
  function jsonUnescape(s: string): string {
    // Wrap in quotes and parse
    return JSON.parse(`"${s.replaceAll('"', '\\"')}"`);
  }

  // Process input ---------------------------------------------------------
  const output = $derived.by(() => {
    try {
      if (!input) return { ok: true as const, text: '' };
      if (direction === 'encode') {
        switch (codec) {
          case 'base64':    return { ok: true as const, text: bytesToBase64(strToBytes(input), false) };
          case 'base64url': return { ok: true as const, text: bytesToBase64(strToBytes(input), true) };
          case 'url':       return { ok: true as const, text: encodeURIComponent(input) };
          case 'html':      return { ok: true as const, text: htmlEncode(input) };
          case 'hex':       return { ok: true as const, text: bytesToHex(strToBytes(input)) };
          case 'binary':    return { ok: true as const, text: bytesToBinary(strToBytes(input)) };
          case 'json':      return { ok: true as const, text: jsonEscape(input) };
        }
      } else {
        switch (codec) {
          case 'base64':    return { ok: true as const, text: bytesToStr(base64ToBytes(input, false)) };
          case 'base64url': return { ok: true as const, text: bytesToStr(base64ToBytes(input, true)) };
          case 'url':       return { ok: true as const, text: decodeURIComponent(input) };
          case 'html':      return { ok: true as const, text: htmlDecode(input) };
          case 'hex':       return { ok: true as const, text: bytesToStr(hexToBytes(input)) };
          case 'binary':    return { ok: true as const, text: bytesToStr(binaryToBytes(input)) };
          case 'json':      return { ok: true as const, text: jsonUnescape(input) };
        }
      }
      return { ok: true as const, text: '' };
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  const swap = () => { if (output.ok) { input = output.text; direction = direction === 'encode' ? 'decode' : 'encode'; } };
</script>

<svelte:head>
  <title>Encode / Decode · tools.gaanesh.com</title>
  <meta name="description" content="Encode and decode Base64, URL, HTML, Hex, Binary, JSON in your browser." />
</svelte:head>

<ToolFrame toolId="encode" command={`${codec} ${direction}`}>
  {#snippet note()}
    Bidirectional. Pick a codec and direction, see the result live.
  {/snippet}

  <!-- Codec tabs -->
  <div class="mb-4 flex flex-wrap gap-1.5">
    {#each codecs as c}
      <button
        type="button"
        onclick={() => (codec = c.id)}
        class="rounded-full border px-3 py-1 font-mono text-xs transition {codec === c.id ? 'border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan' : 'border-ghost-200/70 text-ghost-500 hover:border-neon-cyan/30 hover:text-ink-900 dark:border-ink-600/60 dark:hover:text-white'}"
      >
        {c.label}
      </button>
    {/each}
  </div>

  <div class="mb-3 flex items-center gap-3 font-mono text-xs text-ghost-500">
    <span>codec:</span>
    <span class="text-neon-cyan">{codecs.find((c) => c.id === codec)?.hint}</span>
  </div>

  <!-- Direction toggle -->
  <div class="mb-4 inline-flex rounded-full border border-ghost-200/70 bg-ghost-50 p-1 font-mono text-xs dark:border-ink-600/60 dark:bg-ink-900/60">
    <button
      type="button"
      onclick={() => (direction = 'encode')}
      class="rounded-full px-4 py-1.5 transition {direction === 'encode' ? 'bg-ink-900 text-neon-cyan dark:bg-ink-700' : 'text-ghost-500 hover:text-ink-900 dark:hover:text-white'}"
    >encode →</button>
    <button
      type="button"
      onclick={() => (direction = 'decode')}
      class="rounded-full px-4 py-1.5 transition {direction === 'decode' ? 'bg-ink-900 text-neon-cyan dark:bg-ink-700' : 'text-ghost-500 hover:text-ink-900 dark:hover:text-white'}"
    >← decode</button>
  </div>

  <!-- Input + output panes -->
  <div class="grid gap-4 md:grid-cols-2">
    <div>
      <div class="mb-1 flex items-center justify-between">
        <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">{direction === 'encode' ? 'plain' : 'encoded'}</span>
        <button type="button" onclick={() => (input = '')} class="font-mono text-[10px] text-ghost-500 transition hover:text-neon-rose">clear</button>
      </div>
      <textarea
        bind:value={input}
        rows="10"
        placeholder={direction === 'encode' ? 'Type or paste text…' : 'Paste encoded value…'}
        class="w-full resize-y rounded-xl border border-ghost-200/70 bg-white/95 p-3 font-mono text-sm text-ink-900 outline-none transition focus:border-neon-cyan/60 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100"
      ></textarea>
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <span class="font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">{direction === 'encode' ? 'encoded' : 'plain'}</span>
        <div class="flex items-center gap-2">
          <button type="button" onclick={swap} class="font-mono text-[10px] text-ghost-500 transition hover:text-neon-cyan">↻ use as input</button>
          {#if output.ok && output.text}<CopyButton value={() => output.ok ? output.text : ''} />{/if}
        </div>
      </div>
      <div class="min-h-[14rem] w-full rounded-xl border border-ghost-200/70 bg-ghost-50/70 p-3 font-mono text-sm break-all dark:border-ink-600/60 dark:bg-ink-950/60">
        {#if !input}
          <span class="text-ghost-400">// output will appear here</span>
        {:else if output.ok}
          <span class="text-ink-900 dark:text-ghost-100">{output.text}</span>
        {:else}
          <span class="text-neon-rose">error · {output.error}</span>
        {/if}
      </div>
    </div>
  </div>
</ToolFrame>
