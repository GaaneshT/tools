<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import { audit, type Grade } from '$lib/utils/headers';

  let input = $state('');

  const sample = `HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=()
Server: nginx/1.24.0
X-Powered-By: Express`;

  const result = $derived(input.trim() ? audit(input) : null);

  const gradeStyle: Record<Grade, { bar: string; chip: string; label: string }> = {
    good: { bar: 'bg-neon-green',  chip: 'bg-neon-green/15 text-neon-green ring-1 ring-neon-green/30', label: 'pass'  },
    warn: { bar: 'bg-neon-amber',  chip: 'bg-neon-amber/15 text-neon-amber ring-1 ring-neon-amber/30', label: 'warn'  },
    bad:  { bar: 'bg-neon-rose',   chip: 'bg-neon-rose/15 text-neon-rose ring-1 ring-neon-rose/30',   label: 'fail'  },
    info: { bar: 'bg-ghost-400',   chip: 'bg-ghost-500/15 text-ghost-300 ring-1 ring-ghost-500/30',   label: 'info'  }
  };

  const counts = $derived.by(() => {
    if (!result) return { good: 0, warn: 0, bad: 0, info: 0 };
    return result.findings.reduce(
      (acc, f) => { acc[f.grade]++; return acc; },
      { good: 0, warn: 0, bad: 0, info: 0 } as Record<Grade, number>
    );
  });
</script>

<svelte:head>
  <title>HTTP Header Audit · tools.gaanesh.com</title>
  <meta name="description" content="Paste HTTP response headers. Get a graded report on HSTS, CSP, X-Frame-Options, COOP/COEP and more. Browser-only." />
</svelte:head>

<ToolFrame toolId="headers" command="audit --strict">
  {#snippet note()}
    Paste any HTTP response header block. Status line is optional. We never fetch — paste your real headers from devtools or curl.
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
      <span class="mb-1 block font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">headers</span>
      <textarea
        bind:value={input}
        rows="10"
        placeholder={'Strict-Transport-Security: max-age=...\nContent-Security-Policy: ...\nX-Frame-Options: DENY\n…'}
        class="w-full resize-y rounded-xl border border-ghost-200/70 bg-white/95 p-3 font-mono text-xs text-ink-900 outline-none transition focus:border-neon-cyan/60 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100"
      ></textarea>
    </label>

    {#if result}
      <!-- Summary bar -->
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ghost-200/70 bg-white/95 p-4 dark:border-ink-600/60 dark:bg-ink-800/60">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">overall score</p>
          <p class="mt-1 text-3xl font-bold text-ink-900 dark:text-white">
            <span class={result.score >= 80 ? 'text-neon-green' : result.score >= 50 ? 'text-neon-amber' : 'text-neon-rose'}>{result.score}</span>
            <span class="font-mono text-sm font-normal text-ghost-500">/100</span>
          </p>
        </div>
        <div class="flex items-center gap-2 font-mono text-xs">
          <span class="rounded-full px-2.5 py-0.5 {gradeStyle.good.chip}">✓ {counts.good} pass</span>
          <span class="rounded-full px-2.5 py-0.5 {gradeStyle.warn.chip}">! {counts.warn} warn</span>
          <span class="rounded-full px-2.5 py-0.5 {gradeStyle.bad.chip}">✗ {counts.bad} fail</span>
        </div>
      </div>

      <!-- Findings -->
      <div class="space-y-2">
        {#each result.findings as f}
          {@const style = gradeStyle[f.grade]}
          <article class="relative overflow-hidden rounded-xl border border-ghost-200/60 bg-white/95 p-4 dark:border-ink-600/60 dark:bg-ink-800/60">
            <span class="absolute inset-y-0 left-0 w-1 {style.bar}"></span>
            <div class="ml-3 flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-mono text-sm font-semibold text-ink-900 dark:text-white">{f.key}</h3>
                  <span class="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide {style.chip}">{style.label}</span>
                  <span class="font-mono text-xs text-ghost-500">— {f.summary}</span>
                </div>
                <p class="mt-1.5 text-sm text-ink-600 dark:text-ghost-300">{f.detail}</p>
                {#if f.raw}
                  <pre class="mt-2 overflow-x-auto rounded-lg border border-ghost-200/60 bg-ghost-50/70 p-2 font-mono text-[11px] text-ink-700 dark:border-ink-600/60 dark:bg-ink-950/60 dark:text-ghost-200">{f.raw}</pre>
                {/if}
              </div>
              {#if f.raw}<CopyButton value={f.raw} />{/if}
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <p class="rounded-lg border border-ghost-200/60 bg-ghost-50/70 p-4 font-mono text-xs text-ghost-500 dark:border-ink-600/60 dark:bg-ink-950/60">
        // paste headers above to start — or click "try sample"
      </p>
    {/if}
  </div>
</ToolFrame>
