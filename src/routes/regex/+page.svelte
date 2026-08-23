<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import {
    compile, findMatches, matchLines, groupColumns, analyzePattern, DEFAULT_LIMIT
  } from '$lib/utils/regex';

  type FlagId = 'g' | 'i' | 'm' | 's' | 'u' | 'y';
  const flagDefs: { id: FlagId; label: string; desc: string }[] = [
    { id: 'g', label: 'g', desc: 'global: find all matches' },
    { id: 'i', label: 'i', desc: 'case-insensitive' },
    { id: 'm', label: 'm', desc: 'multiline: ^ and $ per line' },
    { id: 's', label: 's', desc: 'dotAll: . matches newlines' },
    { id: 'u', label: 'u', desc: 'unicode' },
    { id: 'y', label: 'y', desc: 'sticky' }
  ];

  let pattern = $state('');
  let testText = $state('');
  let mode: 'text' | 'lines' = $state('text');
  let showOnly: 'all' | 'matched' | 'unmatched' = $state('all');
  let flags = $state<Record<FlagId, boolean>>({ g: true, i: false, m: false, s: false, u: false, y: false });

  const flagString = $derived(flagDefs.filter((f) => flags[f.id]).map((f) => f.id).join(''));

  const presets: { label: string; pattern: string; flags: Partial<Record<FlagId, boolean>>; sample: string }[] = [
    { label: 'Email',  pattern: String.raw`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`, flags: { g: true, i: true }, sample: 'contact: gaanesh@example.com or hi+spam@foo.co.uk' },
    { label: 'URL',    pattern: String.raw`https?:\/\/[^\s)]+`, flags: { g: true }, sample: 'visit https://gaanesh.com and http://example.org/x?y=1' },
    { label: 'IPv4',   pattern: String.raw`\b(?:\d{1,3}\.){3}\d{1,3}\b`, flags: { g: true }, sample: '10.0.0.1, 192.168.1.1, 256.999.0.0 (still matches numerically)' },
    { label: 'UUID',   pattern: String.raw`\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`, flags: { g: true, i: true }, sample: 'id: 550e8400-e29b-41d4-a716-446655440000' },
    { label: 'JWT',    pattern: String.raw`eyJ[\w-]+\.[\w-]+\.[\w-]+`, flags: { g: true }, sample: 'token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.sig123' }
  ];

  const logSample = [
    'Jan 12 09:14:01 web01 sshd[2011]: Accepted publickey for deploy from 10.2.0.14 port 51922',
    'Jan 12 09:14:07 web01 sshd[2013]: Failed password for invalid user admin from 203.0.113.9 port 40122',
    'Jan 12 09:14:09 web01 sshd[2013]: Failed password for invalid user root from 203.0.113.9 port 40124',
    'Jan 12 09:15:44 web01 sudo: deploy : TTY=pts/0 ; PWD=/srv ; USER=root ; COMMAND=/bin/systemctl restart api',
    'Jan 12 09:16:02 web01 sshd[2019]: Connection closed by 198.51.100.7 port 33110'
  ].join('\n');

  function applyPreset(p: (typeof presets)[number]) {
    pattern = p.pattern;
    testText = p.sample;
    mode = 'text';
    flags = { g: false, i: false, m: false, s: false, u: false, y: false, ...p.flags };
  }

  function loadLogSample() {
    pattern = String.raw`Failed password for (?:invalid user )?(?<user>\S+) from (?<ip>\d{1,3}(?:\.\d{1,3}){3})`;
    testText = logSample;
    mode = 'lines';
    flags = { g: true, i: false, m: false, s: false, u: false, y: false };
  }

  const compiled = $derived(pattern ? compile(pattern, flagString) : null);
  const warnings = $derived(pattern ? analyzePattern(pattern) : []);

  const textResult = $derived.by(() =>
    compiled?.ok && mode === 'text' ? findMatches(compiled.regex, testText, DEFAULT_LIMIT) : null
  );
  const lineResult = $derived.by(() =>
    compiled?.ok && mode === 'lines' ? matchLines(compiled.regex, testText, DEFAULT_LIMIT) : null
  );

  const allMatches = $derived(
    textResult ? textResult.matches : (lineResult?.lines.flatMap((l) => l.matches) ?? [])
  );
  const columns = $derived(groupColumns(allMatches));
  const truncated = $derived(textResult?.truncated || lineResult?.truncated || false);

  const visibleLines = $derived(
    (lineResult?.lines ?? []).filter((l) =>
      showOnly === 'all' ? true : showOnly === 'matched' ? l.matches.length > 0 : l.matches.length === 0
    )
  );

  // Highlight segments for whole-text mode.
  const segments = $derived.by(() => {
    const matches = textResult?.matches ?? [];
    if (!matches.length) return [{ text: testText, hit: false }];
    const segs: { text: string; hit: boolean }[] = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.index > cursor) segs.push({ text: testText.slice(cursor, m.index), hit: false });
      segs.push({ text: testText.slice(m.index, m.index + m.value.length), hit: true });
      cursor = m.index + m.value.length;
    }
    if (cursor < testText.length) segs.push({ text: testText.slice(cursor), hit: false });
    return segs;
  });

  const severityChip: Record<string, string> = {
    high: 'bg-neon-rose/15 text-neon-rose ring-1 ring-neon-rose/30',
    medium: 'bg-neon-amber/15 text-neon-amber ring-1 ring-neon-amber/30',
    low: 'bg-ghost-500/15 text-ghost-600 ring-1 ring-ghost-500/30'
  };

  const chipBtn =
    'rounded-[3px] border px-3 py-1 text-[12.5px] font-medium transition';
  const chipOn = 'border-neon-cyan bg-neon-cyan text-ghost-50';
  const chipOff = 'border-ghost-300 text-ink-700 hover:border-neon-cyan hover:text-neon-cyan';
</script>

<svelte:head>
  <title>Regex Tester · tools.gaanesh.com</title>
  <meta name="description" content="Live regex tester with per-line bulk matching, a capture-group table, and warnings for catastrophic backtracking. Browser-only." />
</svelte:head>

<ToolFrame toolId="regex">
  {#snippet note()}
    JavaScript (ECMAScript) semantics. Per-line mode is what you want when checking a pattern against log output.
  {/snippet}

  {#snippet actions()}
    <button type="button" class="{chipBtn} {chipOff}" onclick={loadLogSample}>Try a log sample</button>
  {/snippet}

  <div class="space-y-5">
    <!-- Pattern + flags -->
    <div class="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
      <label class="block">
        <span class="mb-1 block text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Pattern</span>
        <div class="flex items-stretch overflow-hidden rounded-[3px] border border-ghost-300 bg-ghost-50 font-mono text-sm">
          <span class="flex items-center px-3 text-ghost-600">/</span>
          <input
            bind:value={pattern}
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="e.g. Failed password for (?<user>\S+)"
            class="flex-1 bg-transparent px-1 py-2.5 text-ink-900 outline-none"
          />
          <span class="flex items-center pr-3 text-ghost-600">/{flagString}</span>
        </div>
      </label>
      <div class="flex flex-wrap gap-1.5">
        {#each flagDefs as f}
          <button
            type="button"
            title={f.desc}
            onclick={() => (flags[f.id] = !flags[f.id])}
            class="h-9 w-9 rounded-[3px] border font-mono text-xs transition {flags[f.id] ? 'border-neon-cyan bg-neon-cyan text-ghost-50' : 'border-ghost-300 text-ghost-600 hover:border-neon-cyan'}"
          >{f.label}</button>
        {/each}
      </div>
    </div>

    {#if compiled && !compiled.ok}
      <p class="rounded-[3px] border border-neon-rose/40 bg-neon-rose/10 p-3 font-mono text-[13px] text-neon-rose">
        {compiled.error}
      </p>
    {/if}

    <!-- Pattern review -->
    {#if warnings.length}
      <div class="space-y-2">
        {#each warnings as w}
          <div class="rounded-[3px] border border-ghost-200 border-l-[3px] border-l-neon-amber bg-ghost-50 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[15px] font-semibold text-ink-900">{w.message}</span>
              <span class="rounded-full px-2 py-0.5 text-[11px] uppercase {severityChip[w.severity]}">{w.severity}</span>
            </div>
            <p class="mt-1.5 text-[14px] leading-relaxed text-ink-700">{w.detail}</p>
          </div>
        {/each}
        <p class="text-[13px] text-ghost-600">
          This is a shape check, not a proof. A pattern with no warning can still backtrack badly on the right input.
        </p>
      </div>
    {/if}

    <!-- Presets -->
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Presets</span>
      {#each presets as p}
        <button type="button" onclick={() => applyPreset(p)} class="rounded-full border border-ghost-300 px-3 py-1 text-[12.5px] text-ink-700 transition hover:border-neon-cyan hover:text-neon-cyan">{p.label}</button>
      {/each}
    </div>

    <!-- Mode -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Mode</span>
      <button type="button" class="{chipBtn} {mode === 'text' ? chipOn : chipOff}" onclick={() => (mode = 'text')}>Whole text</button>
      <button type="button" class="{chipBtn} {mode === 'lines' ? chipOn : chipOff}" onclick={() => (mode = 'lines')}>Per line</button>
    </div>

    <!-- Input -->
    <label class="block">
      <span class="mb-1 block text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">
        {mode === 'lines' ? 'Log lines' : 'Test string'}
      </span>
      <textarea
        bind:value={testText}
        rows={mode === 'lines' ? 10 : 6}
        spellcheck="false"
        placeholder={mode === 'lines' ? 'Paste log output, one record per line…' : 'Type or paste the text you want to match against…'}
        class="w-full resize-y rounded-[3px] border border-ghost-300 bg-ghost-50 p-3 font-mono text-sm text-ink-900 outline-none transition focus:border-neon-cyan"
      ></textarea>
    </label>

    {#if truncated}
      <p class="rounded-[3px] border border-ghost-200 border-l-[3px] border-l-neon-amber bg-ghost-50 p-3 text-[14px] text-ink-700">
        Stopped after {DEFAULT_LIMIT.toLocaleString()} matches. Counts below are capped, not complete.
      </p>
    {/if}

    <!-- Whole-text mode -->
    {#if mode === 'text' && textResult}
      {#if testText}
        <div class="rounded-[3px] border border-ghost-200 bg-ghost-50 p-4">
          <p class="mb-2 text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Highlighted</p>
          <pre class="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-ink-900">{#each segments as s}{#if s.hit}<mark class="rounded-[2px] bg-neon-cyan/20 px-0.5 text-ink-900">{s.text}</mark>{:else}{s.text}{/if}{/each}</pre>
        </div>
      {/if}
      <p class="text-[14px] text-ink-700">
        <b class="font-semibold text-ink-900">{textResult.matches.length}</b>
        match{textResult.matches.length === 1 ? '' : 'es'}
      </p>
    {/if}

    <!-- Per-line mode -->
    {#if mode === 'lines' && lineResult}
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-ghost-200 bg-ghost-50 p-4">
        <div class="flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-ink-700">
          <span><b class="font-semibold text-ink-900">{lineResult.matchedLines}</b> of {lineResult.totalLines} lines matched</span>
          <span><b class="font-semibold text-ink-900">{lineResult.totalMatches}</b> total matches</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          {#each [['all', 'All'], ['matched', 'Matched'], ['unmatched', 'Not matched']] as [id, label]}
            <button
              type="button"
              class="{chipBtn} {showOnly === id ? chipOn : chipOff}"
              onclick={() => (showOnly = id as typeof showOnly)}
            >{label}</button>
          {/each}
        </div>
      </div>

      {#if visibleLines.length}
        <div class="overflow-hidden rounded-[3px] border border-ghost-200">
          {#each visibleLines as line}
            <div class="grid grid-cols-[52px_1fr] gap-2 border-b border-ghost-200 last:border-b-0 {line.matches.length ? 'bg-ghost-50' : 'bg-paper'}">
              <span class="border-r border-ghost-200 px-2 py-2 text-right font-mono text-[12px] text-ghost-600 tabular-nums">
                {line.number}
              </span>
              <span class="min-w-0 py-2 pr-2 font-mono text-[13px] break-all {line.matches.length ? 'text-ink-900' : 'text-ghost-600'}">
                {#if line.matches.length}
                  {@const parts = (() => {
                    const out: { text: string; hit: boolean }[] = [];
                    let c = 0;
                    for (const m of line.matches) {
                      if (m.index > c) out.push({ text: line.text.slice(c, m.index), hit: false });
                      out.push({ text: m.value, hit: true });
                      c = m.index + m.value.length;
                    }
                    if (c < line.text.length) out.push({ text: line.text.slice(c), hit: false });
                    return out;
                  })()}
                  {#each parts as p}{#if p.hit}<mark class="rounded-[2px] bg-neon-cyan/20 px-0.5 text-ink-900">{p.text}</mark>{:else}{p.text}{/if}{/each}
                {:else}
                  {line.text || ' '}
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="rounded-[3px] border border-ghost-200 bg-ghost-50 p-4 font-mono text-[13px] text-ghost-600">
          Nothing to show for this filter.
        </p>
      {/if}
    {/if}

    <!-- Capture-group table -->
    {#if columns.length && allMatches.length}
      <div>
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">
            Capture groups · {allMatches.length} row{allMatches.length === 1 ? '' : 's'}
          </h3>
          <CopyButton
            label="copy tsv"
            value={() =>
              [['match', ...columns].join('\t')]
                .concat(allMatches.map((m) => [m.value, ...columns.map((c) => m.groups.find((g) => g.name === c)?.value ?? '')].join('\t')))
                .join('\n')}
          />
        </div>
        <div class="overflow-x-auto rounded-[3px] border border-ghost-200">
          <table class="w-full border-collapse text-left font-mono text-[12.5px]">
            <thead>
              <tr class="bg-ghost-50">
                <th class="border-b border-ghost-200 px-3 py-2 font-semibold text-ink-900">match</th>
                {#each columns as c}
                  <th class="border-b border-ghost-200 px-3 py-2 font-semibold text-ink-900">{c}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each allMatches.slice(0, 500) as m}
                <tr>
                  <td class="border-b border-ghost-200 px-3 py-1.5 break-all text-ink-900">{m.value}</td>
                  {#each columns as c}
                    {@const v = m.groups.find((g) => g.name === c)?.value}
                    <td class="border-b border-ghost-200 px-3 py-1.5 break-all {v === undefined ? 'text-ghost-400' : 'text-ink-700'}">
                      {v === undefined ? '—' : v}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if allMatches.length > 500}
          <p class="mt-2 text-[13px] text-ghost-600">Showing the first 500 rows of {allMatches.length}.</p>
        {/if}
      </div>
    {/if}
  </div>
</ToolFrame>
