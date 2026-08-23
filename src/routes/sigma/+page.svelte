<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import {
    parseRule, parseEvents, evaluate, findUnsupported, conditionOf, SUPPORTED_MODIFIERS
  } from '$lib/utils/sigma';

  const sampleRule = `title: Failed logon from an external address
status: experimental
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: 4625
    LogonType:
      - 3
      - 10
  filter_internal:
    IpAddress|cidr: '10.0.0.0/8'
  filter_service:
    TargetUserName|startswith: 'svc-'
  condition: selection and not 1 of filter_*
level: medium`;

  const sampleEvents = `{"EventID":4625,"LogonType":3,"TargetUserName":"jdoe","IpAddress":"203.0.113.9"}
{"EventID":4625,"LogonType":3,"TargetUserName":"jdoe","IpAddress":"10.2.0.14"}
{"EventID":4625,"LogonType":3,"TargetUserName":"svc-backup","IpAddress":"203.0.113.9"}
{"EventID":4625,"LogonType":2,"TargetUserName":"jdoe","IpAddress":"203.0.113.9"}
{"EventID":4624,"LogonType":3,"TargetUserName":"jdoe","IpAddress":"203.0.113.9"}`;

  let ruleText = $state('');
  let eventText = $state('');

  const parsed = $derived(ruleText.trim() ? parseRule(ruleText) : null);
  const rule = $derived(parsed?.ok ? parsed.rule : null);
  const unsupported = $derived(rule ? findUnsupported(rule) : []);
  const events = $derived(parseEvents(eventText));

  // A rule using features this evaluator does not model gets no verdict at
  // all. A wrong "no match" is worse than no answer.
  const results = $derived.by(() => {
    if (!rule || unsupported.length || !events.ok) return null;
    try {
      return {
        ok: true as const,
        rows: events.events.map((e, i) => ({ index: i + 1, event: e, ...evaluate(rule, e) }))
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  const matchCount = $derived(results?.ok ? results.rows.filter((r) => r.matched).length : 0);

  const chipBtn = 'rounded-[3px] border px-3 py-1 text-[12.5px] font-medium transition';
  const chipOff = 'border-ghost-300 text-ink-700 hover:border-neon-cyan hover:text-neon-cyan';

  function loadSample() {
    ruleText = sampleRule;
    eventText = sampleEvents;
  }
</script>

<svelte:head>
  <title>Sigma Rule Tester · tools.gaanesh.com</title>
  <meta
    name="description"
    content="Evaluate a Sigma detection rule against sample events in your browser. Shows which search identifiers matched and why. Nothing is uploaded."
  />
</svelte:head>

<ToolFrame toolId="sigma">
  {#snippet note()}
    Paste a rule and some events. Unsupported Sigma features are named rather than ignored, so a verdict is never guesswork.
  {/snippet}

  {#snippet actions()}
    <button type="button" class="{chipBtn} {chipOff}" onclick={loadSample}>Try a sample</button>
    {#if ruleText || eventText}
      <button type="button" class="{chipBtn} {chipOff}" onclick={() => { ruleText = ''; eventText = ''; }}>Clear</button>
    {/if}
  {/snippet}

  <div class="space-y-5">
    <div class="grid gap-4 lg:grid-cols-2">
      <label class="block">
        <span class="mb-1 block text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Sigma rule (YAML)</span>
        <textarea
          bind:value={ruleText}
          rows="16"
          spellcheck="false"
          placeholder={'title: ...\ndetection:\n  selection:\n    EventID: 4625\n  condition: selection'}
          class="w-full resize-y rounded-[3px] border border-ghost-300 bg-ghost-50 p-3 font-mono text-xs text-ink-900 outline-none transition focus:border-neon-cyan"
        ></textarea>
      </label>

      <label class="block">
        <span class="mb-1 block text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Events (one JSON object per line)</span>
        <textarea
          bind:value={eventText}
          rows="16"
          spellcheck="false"
          placeholder={'{"EventID":4625,"TargetUserName":"jdoe"}'}
          class="w-full resize-y rounded-[3px] border border-ghost-300 bg-ghost-50 p-3 font-mono text-xs text-ink-900 outline-none transition focus:border-neon-cyan"
        ></textarea>
      </label>
    </div>

    {#if parsed && !parsed.ok}
      <p class="rounded-[3px] border border-neon-rose/40 bg-neon-rose/10 p-3 font-mono text-[13px] text-neon-rose">
        {parsed.error}
      </p>
    {/if}

    {#if !events.ok}
      <p class="rounded-[3px] border border-neon-rose/40 bg-neon-rose/10 p-3 font-mono text-[13px] text-neon-rose">
        {events.error}
      </p>
    {/if}

    <!-- Refusal: named, never silently ignored -->
    {#if unsupported.length}
      <div class="rounded-[3px] border border-ghost-200 border-l-[3px] border-l-neon-rose bg-ghost-50 p-4">
        <h3 class="text-[15px] font-semibold text-ink-900">No verdict: this rule uses features that are not evaluated here</h3>
        <p class="mt-1.5 text-[14px] leading-relaxed text-ink-700">
          Reporting a match or a miss would be misleading, so nothing is shown. The rest of the rule is fine.
        </p>
        <ul class="mt-3 space-y-1.5">
          {#each unsupported as u}
            <li class="text-[14px] text-ink-700">
              <code class="rounded-[3px] border border-ghost-200 bg-paper px-1.5 py-0.5 font-mono text-[13px] text-ink-900">{u.feature}</code>
              in <span class="font-mono text-[13px]">{u.where}</span> — {u.detail}
            </li>
          {/each}
        </ul>
        <p class="mt-3 text-[13px] text-ghost-600">
          Supported: {SUPPORTED_MODIFIERS.map((m) => '|' + m).join(', ')}
        </p>
      </div>
    {/if}

    {#if results && !results.ok}
      <p class="rounded-[3px] border border-neon-rose/40 bg-neon-rose/10 p-3 font-mono text-[13px] text-neon-rose">
        {results.error}
      </p>
    {/if}

    {#if rule && !unsupported.length}
      <div class="rounded-[3px] border border-ghost-200 bg-ghost-50 p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p class="text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Rule</p>
            <p class="mt-1 text-[16px] font-semibold text-ink-900">{rule.title ?? 'Untitled'}</p>
          </div>
          {#if results?.ok}
            <p class="text-[14px] text-ink-700">
              <b class="font-semibold text-ink-900">{matchCount}</b> of {results.rows.length} event{results.rows.length === 1 ? '' : 's'} matched
            </p>
          {/if}
        </div>
        <p class="mt-2 font-mono text-[13px] break-all text-ghost-600">condition: {conditionOf(rule)}</p>
      </div>
    {/if}

    {#if results?.ok && results.rows.length}
      <div class="space-y-2">
        {#each results.rows as row}
          <article class="relative overflow-hidden rounded-[3px] border border-ghost-200 bg-ghost-50 p-4">
            <span class="absolute inset-y-0 left-0 w-[3px] {row.matched ? 'bg-neon-rose' : 'bg-ghost-300'}"></span>
            <div class="ml-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-[13px] text-ghost-600">event {row.index}</span>
                <span class="rounded-full px-2 py-0.5 text-[11px] uppercase {row.matched ? 'bg-neon-rose/15 text-neon-rose ring-1 ring-neon-rose/30' : 'bg-ghost-500/15 text-ghost-600 ring-1 ring-ghost-500/30'}">
                  {row.matched ? 'match' : 'no match'}
                </span>
              </div>

              <div class="mt-2 flex flex-wrap gap-1.5">
                {#each row.blocks as b}
                  <span class="rounded-[3px] border px-2 py-0.5 font-mono text-[12px] {b.matched ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan' : 'border-ghost-300 text-ghost-600'}">
                    {b.name}: {b.matched ? 'true' : 'false'}
                  </span>
                {/each}
              </div>

              <pre class="mt-2 overflow-x-auto rounded-[3px] border border-ghost-200 bg-paper p-2 font-mono text-[11.5px] whitespace-pre-wrap text-ink-700">{JSON.stringify(row.event)}</pre>
            </div>
          </article>
        {/each}
      </div>
    {:else if rule && !unsupported.length && events.ok && events.events.length === 0}
      <p class="rounded-[3px] border border-ghost-200 bg-ghost-50 p-4 font-mono text-[13px] text-ghost-600">
        Add some events to evaluate the rule against.
      </p>
    {/if}

    <details class="rounded-[3px] border border-ghost-200 bg-ghost-50 p-3">
      <summary class="cursor-pointer text-[14px] text-ink-700">What this implements</summary>
      <div class="mt-3 space-y-2 text-[14px] leading-relaxed text-ink-700">
        <p>
          Search identifiers as maps (fields joined by AND), lists of maps (OR), and keyword lists matched
          against the whole record. Values are case-insensitive with <code class="font-mono">*</code> and
          <code class="font-mono">?</code> wildcards, and a backslash escapes them. A list of values is OR
          unless <code class="font-mono">|all</code> is set. A <code class="font-mono">null</code> value
          matches an absent or null field.
        </p>
        <p>
          Conditions support <code class="font-mono">and</code>, <code class="font-mono">or</code>,
          <code class="font-mono">not</code>, parentheses, <code class="font-mono">1 of them</code>,
          <code class="font-mono">all of them</code>, and <code class="font-mono">N of prefix*</code>.
        </p>
        <p>
          Field lookup tries the exact key, then a dotted path, then a case-insensitive key. Real backends
          differ here, so confirm against your own pipeline before trusting a near miss.
        </p>
      </div>
    </details>
  </div>
</ToolFrame>
