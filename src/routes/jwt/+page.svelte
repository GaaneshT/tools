<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';

  let input = $state('');

  const sample = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkdhYW5lc2giLCJpYXQiOjE3MzAwMDAwMDAsImV4cCI6MTczMDAwMzYwMH0.dRBpRA4nN-W3CzvfV1V8e8K8WqM3wMtwDP_HnMxoH9c';

  type Decoded = {
    headerRaw: string;
    payloadRaw: string;
    signature: string;
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
  };

  function base64UrlDecode(s: string): string {
    let t = s.replaceAll('-', '+').replaceAll('_', '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    // Decode as UTF-8
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  const result = $derived.by<{ ok: boolean; data?: Decoded; error?: string }>(() => {
    if (!input.trim()) return { ok: false, error: '' };
    const parts = input.trim().split('.');
    if (parts.length < 2 || parts.length > 3) {
      return { ok: false, error: 'a JWT has three parts separated by "."' };
    }
    try {
      const headerRaw = base64UrlDecode(parts[0]);
      const payloadRaw = base64UrlDecode(parts[1]);
      const header = JSON.parse(headerRaw) as Record<string, unknown>;
      const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
      return {
        ok: true,
        data: { headerRaw, payloadRaw, signature: parts[2] ?? '', header, payload }
      };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : 'parse failed' };
    }
  });

  const claimDocs: Record<string, string> = {
    iss: 'Issuer — who created the token',
    sub: 'Subject — who the token is about',
    aud: 'Audience — who the token is for',
    exp: 'Expiration — token is invalid after this time',
    nbf: 'Not before — token is invalid before this time',
    iat: 'Issued at — when the token was created',
    jti: 'JWT ID — unique identifier for replay protection'
  };

  const tsClaims = ['exp', 'nbf', 'iat'];

  function fmtTime(value: unknown): string {
    if (typeof value !== 'number') return '';
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  }

  const expiryInfo = $derived.by(() => {
    if (!result.ok || !result.data) return null;
    const exp = result.data.payload['exp'];
    if (typeof exp !== 'number') return null;
    const now = Math.floor(Date.now() / 1000);
    const seconds = exp - now;
    if (seconds < 0) return { state: 'expired',  label: `expired ${humanDelta(-seconds)} ago`, cls: 'text-neon-rose'  };
    if (seconds < 60) return { state: 'expiring', label: `expires in ${seconds}s`,             cls: 'text-neon-amber' };
    return { state: 'valid', label: `valid for ${humanDelta(seconds)}`,                       cls: 'text-neon-green' };
  });

  function humanDelta(sec: number): string {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  }
</script>

<svelte:head>
  <title>JWT Inspector · tools.gaanesh.com</title>
  <meta name="description" content="Decode and inspect JSON Web Tokens (JWTs) in your browser. Decode-only — never verified online." />
</svelte:head>

<ToolFrame toolId="jwt" command="decode --no-verify">
  {#snippet note()}
    Decode-only. We never call jwt.io or any third party. Signature is shown but not verified.
  {/snippet}

  {#snippet actions()}
    <button
      type="button"
      onclick={() => (input = sample)}
      class="inline-flex items-center gap-1 rounded-full border border-ghost-200/70 bg-white/90 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-ghost-500 transition hover:border-neon-cyan/50 hover:text-ink-900 dark:border-ink-600/60 dark:bg-ink-800/70 dark:hover:text-white"
    >try sample</button>
  {/snippet}

  <div class="space-y-5">
    <label class="block">
      <span class="mb-1 block font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">jwt</span>
      <textarea
        bind:value={input}
        rows="4"
        placeholder="Paste your JWT (xxx.yyy.zzz)…"
        class="w-full resize-y rounded-xl border border-ghost-200/70 bg-white/95 p-3 font-mono text-sm break-all text-ink-900 outline-none transition focus:border-neon-cyan/60 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100"
      ></textarea>
    </label>

    {#if !result.ok && result.error}
      <p class="rounded-lg border border-neon-rose/30 bg-neon-rose/10 p-3 font-mono text-xs text-neon-rose">{result.error}</p>
    {/if}

    {#if result.ok && result.data}
      {@const d = result.data}

      <div class="grid gap-4 md:grid-cols-3">
        <!-- Header -->
        <div class="rounded-2xl border border-neon-cyan/30 bg-white/95 p-4 dark:bg-ink-800/60">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-neon-cyan">header</span>
            <CopyButton value={d.headerRaw} />
          </div>
          <pre class="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-ink-700 dark:text-ghost-200">{JSON.stringify(d.header, null, 2)}</pre>
        </div>

        <!-- Payload -->
        <div class="rounded-2xl border border-neon-violet/30 bg-white/95 p-4 dark:bg-ink-800/60">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-neon-violet">payload</span>
            <CopyButton value={d.payloadRaw} />
          </div>
          <pre class="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-ink-700 dark:text-ghost-200">{JSON.stringify(d.payload, null, 2)}</pre>
        </div>

        <!-- Signature -->
        <div class="rounded-2xl border border-neon-rose/30 bg-white/95 p-4 dark:bg-ink-800/60">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-neon-rose">signature</span>
            <CopyButton value={d.signature} />
          </div>
          <pre class="overflow-x-auto break-all font-mono text-xs text-ink-700 dark:text-ghost-200">{d.signature || '(none)'}</pre>
          <p class="mt-2 font-mono text-[10px] text-ghost-500">// not verified — paste your secret elsewhere to verify</p>
        </div>
      </div>

      <!-- Annotated claims -->
      <div class="rounded-2xl border border-ghost-200/70 bg-white/95 p-4 dark:border-ink-600/60 dark:bg-ink-800/60">
        <div class="mb-3 flex items-center justify-between">
          <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-neon-cyan">claims</span>
          {#if expiryInfo}
            <span class="font-mono text-[11px] {expiryInfo.cls}">{expiryInfo.label}</span>
          {/if}
        </div>

        <div class="grid gap-2">
          {#each Object.entries(d.payload) as [key, value]}
            <div class="grid grid-cols-[6rem_1fr] items-start gap-3 border-b border-ghost-200/40 py-1.5 last:border-b-0 dark:border-ink-600/40">
              <div class="font-mono text-xs">
                <span class="text-neon-cyan">{key}</span>
                {#if claimDocs[key]}<span class="ml-1 text-[10px] text-ghost-500">·</span>{/if}
              </div>
              <div class="font-mono text-xs text-ink-700 dark:text-ghost-200">
                <span class="break-all">{JSON.stringify(value)}</span>
                {#if tsClaims.includes(key) && typeof value === 'number'}
                  <span class="ml-2 text-ghost-500">// {fmtTime(value)}</span>
                {/if}
                {#if claimDocs[key]}
                  <div class="mt-0.5 text-[10px] text-ghost-500">{claimDocs[key]}</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</ToolFrame>
