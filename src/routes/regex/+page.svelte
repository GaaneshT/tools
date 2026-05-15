<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';

  let pattern = $state('');
  let testText = $state('');

  type FlagId = 'g' | 'i' | 'm' | 's' | 'u' | 'y';
  const flagDefs: { id: FlagId; label: string; desc: string }[] = [
    { id: 'g', label: 'g', desc: 'global — find all matches' },
    { id: 'i', label: 'i', desc: 'case-insensitive' },
    { id: 'm', label: 'm', desc: 'multiline — ^ and $ per line' },
    { id: 's', label: 's', desc: 'dotAll — . matches newlines' },
    { id: 'u', label: 'u', desc: 'unicode' },
    { id: 'y', label: 'y', desc: 'sticky' }
  ];
  let flags = $state<Record<FlagId, boolean>>({ g: true, i: false, m: false, s: false, u: false, y: false });

  const flagString = $derived(flagDefs.filter((f) => flags[f.id]).map((f) => f.id).join(''));

  const presets: { label: string; pattern: string; flags: Partial<Record<FlagId, boolean>>; sample: string }[] = [
    { label: 'Email',  pattern: String.raw`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`, flags: { g: true, i: true }, sample: 'contact: gaanesh@example.com or hi+spam@foo.co.uk' },
    { label: 'URL',    pattern: String.raw`https?:\/\/[^\s)]+`, flags: { g: true }, sample: 'visit https://gaanesh.com and http://example.org/x?y=1' },
    { label: 'IPv4',   pattern: String.raw`\b(?:\d{1,3}\.){3}\d{1,3}\b`, flags: { g: true }, sample: '10.0.0.1, 192.168.1.1, 256.999.0.0 (still matches numerically)' },
    { label: 'UUID',   pattern: String.raw`\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`, flags: { g: true, i: true }, sample: 'id: 550e8400-e29b-41d4-a716-446655440000' },
    { label: 'JWT',    pattern: String.raw`eyJ[\w-]+\.[\w-]+\.[\w-]+`, flags: { g: true }, sample: 'token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.sig123' }
  ];

  function applyPreset(p: (typeof presets)[number]) {
    pattern = p.pattern;
    testText = p.sample;
    flags = { g: false, i: false, m: false, s: false, u: false, y: false, ...p.flags };
  }

  type Match = { index: number; length: number; value: string; groups: { name: string; value: string }[] };

  const result = $derived.by<{ ok: boolean; matches?: Match[]; regex?: string; error?: string }>(() => {
    if (!pattern) return { ok: false, error: '' };
    let re: RegExp;
    try {
      re = new RegExp(pattern, flagString);
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const matches: Match[] = [];
    if (re.global || re.sticky) {
      let m: RegExpExecArray | null;
      let safety = 0;
      while ((m = re.exec(testText))) {
        if (safety++ > 5000) break;
        if (m[0].length === 0) re.lastIndex++;
        const groups: Match['groups'] = [];
        for (let i = 1; i < m.length; i++) groups.push({ name: String(i), value: m[i] ?? '' });
        if (m.groups) for (const [k, v] of Object.entries(m.groups)) groups.push({ name: k, value: v ?? '' });
        matches.push({ index: m.index, length: m[0].length, value: m[0], groups });
      }
    } else {
      const m = re.exec(testText);
      if (m) {
        const groups: Match['groups'] = [];
        for (let i = 1; i < m.length; i++) groups.push({ name: String(i), value: m[i] ?? '' });
        if (m.groups) for (const [k, v] of Object.entries(m.groups)) groups.push({ name: k, value: v ?? '' });
        matches.push({ index: m.index, length: m[0].length, value: m[0], groups });
      }
    }
    return { ok: true, matches, regex: re.toString() };
  });

  type Segment = { text: string; highlighted: boolean };
  const segments = $derived.by<Segment[]>(() => {
    if (!result.ok || !result.matches || result.matches.length === 0) return [{ text: testText, highlighted: false }];
    const segs: Segment[] = [];
    let cursor = 0;
    for (const m of result.matches) {
      if (m.index > cursor) segs.push({ text: testText.slice(cursor, m.index), highlighted: false });
      segs.push({ text: testText.slice(m.index, m.index + m.length), highlighted: true });
      cursor = m.index + m.length;
    }
    if (cursor < testText.length) segs.push({ text: testText.slice(cursor), highlighted: false });
    return segs;
  });
</script>

<svelte:head>
  <title>Regex Tester · tools.gaanesh.com</title>
  <meta name="description" content="Live regex tester with highlighted matches, capture groups, and common pattern presets." />
</svelte:head>

<ToolFrame toolId="regex" command={result.ok && result.regex ? result.regex : 'regex'}>
  {#snippet note()}
    JavaScript regex semantics (ECMAScript). Capture groups, named groups, and unicode all supported.
  {/snippet}

  <div class="space-y-5">
    <!-- Pattern + flags -->
    <div class="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
      <label class="block">
        <span class="mb-1 block font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">pattern</span>
        <div class="flex items-stretch overflow-hidden rounded-xl border border-ghost-200/70 bg-white/95 font-mono text-sm dark:border-ink-600/60 dark:bg-ink-950/70">
          <span class="flex items-center px-3 text-neon-cyan">/</span>
          <input
            bind:value={pattern}
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="e.g. \\b\\w+@\\w+\\.\\w+\\b"
            class="flex-1 bg-transparent px-1 py-2.5 outline-none text-ink-900 dark:text-ghost-100"
          />
          <span class="flex items-center pr-3 text-neon-cyan">/{flagString}</span>
        </div>
      </label>
      <div class="flex flex-wrap gap-1.5">
        {#each flagDefs as f}
          <button
            type="button"
            title={f.desc}
            onclick={() => (flags[f.id] = !flags[f.id])}
            class="h-9 w-9 rounded-md border font-mono text-xs transition {flags[f.id] ? 'border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan' : 'border-ghost-200/70 text-ghost-500 hover:border-neon-cyan/30 dark:border-ink-600/60'}"
          >{f.label}</button>
        {/each}
      </div>
    </div>

    {#if !result.ok && result.error}
      <p class="rounded-lg border border-neon-rose/30 bg-neon-rose/10 p-3 font-mono text-xs text-neon-rose">{result.error}</p>
    {/if}

    <!-- Presets -->
    <div class="flex flex-wrap gap-1.5">
      <span class="self-center font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">presets:</span>
      {#each presets as p}
        <button
          type="button"
          onclick={() => applyPreset(p)}
          class="rounded-full border border-ghost-200/70 px-3 py-1 font-mono text-[11px] text-ghost-500 transition hover:border-neon-cyan/50 hover:text-ink-900 dark:border-ink-600/60 dark:hover:text-white"
        >{p.label}</button>
      {/each}
    </div>

    <!-- Test text -->
    <label class="block">
      <span class="mb-1 block font-mono text-[11px] uppercase tracking-[0.2em] text-ghost-500">test string</span>
      <textarea
        bind:value={testText}
        rows="6"
        spellcheck="false"
        placeholder="Type or paste the text you want to match against…"
        class="w-full resize-y rounded-xl border border-ghost-200/70 bg-white/95 p-3 font-mono text-sm text-ink-900 outline-none transition focus:border-neon-cyan/60 dark:border-ink-600/60 dark:bg-ink-950/70 dark:text-ghost-100"
      ></textarea>
    </label>

    <!-- Highlighted preview -->
    {#if testText}
      <div class="rounded-2xl border border-ghost-200/70 bg-white/95 p-4 dark:border-ink-600/60 dark:bg-ink-800/60">
        <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">highlighted</p>
        <pre class="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-ink-900 dark:text-ghost-100">{#each segments as s}{#if s.highlighted}<mark class="rounded bg-neon-cyan/25 px-0.5 text-ink-900 dark:bg-neon-cyan/30 dark:text-neon-cyan">{s.text}</mark>{:else}{s.text}{/if}{/each}</pre>
      </div>
    {/if}

    <!-- Match table -->
    {#if result.ok && result.matches && result.matches.length > 0}
      <div class="rounded-2xl border border-ghost-200/70 bg-white/95 p-4 dark:border-ink-600/60 dark:bg-ink-800/60">
        <p class="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-ghost-500">
          <span>matches</span>
          <span class="text-neon-cyan">{result.matches.length} hit{result.matches.length === 1 ? '' : 's'}</span>
        </p>
        <div class="space-y-2">
          {#each result.matches as m, i}
            <div class="rounded-lg border border-ghost-200/60 bg-ghost-50/70 p-3 font-mono text-xs dark:border-ink-600/60 dark:bg-ink-950/60">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-ghost-500">#{i + 1} <span class="text-ghost-400">@</span> idx {m.index}</span>
                <CopyButton value={m.value} label="copy match" />
              </div>
              <div class="mt-1 break-all text-neon-cyan">{m.value}</div>
              {#if m.groups.length > 0}
                <div class="mt-2 grid gap-1">
                  {#each m.groups as g}
                    <div class="flex items-baseline gap-2">
                      <span class="w-12 shrink-0 text-neon-violet">${g.name}</span>
                      <span class="break-all text-ink-700 dark:text-ghost-200">{g.value}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {:else if pattern && testText && result.ok}
      <p class="rounded-lg border border-ghost-200/60 bg-ghost-50/70 p-4 font-mono text-xs text-ghost-500 dark:border-ink-600/60 dark:bg-ink-950/60">
        // no matches.
      </p>
    {/if}
  </div>
</ToolFrame>
