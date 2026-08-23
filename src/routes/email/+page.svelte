<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import { analyze, formatDuration, type Grade } from '$lib/utils/email';

  let input = $state('');

  const sample = `Return-Path: <bounce@mailer-xyz.test>
Received: from mx.corp.test (mx.corp.test [198.51.100.5])
	by inbox.corp.test with ESMTPS id 4bQ7xK
	for <me@corp.test>; Thu, 1 Jan 2026 09:14:22 +0800
Received: from unknown (relay.mailer-xyz.test [192.0.2.44])
	by mx.corp.test with SMTP id 8fT2mP; Thu, 1 Jan 2026 09:11:58 +0800
Authentication-Results: mx.corp.test; spf=softfail smtp.mailfrom=mailer-xyz.test; dkim=none; dmarc=fail header.from=corp.test
From: "IT Helpdesk <helpdesk@corp.test>" <billing@mailer-xyz.test>
Reply-To: account-recovery@corp-secure-login.test
To: me@corp.test
Subject: Action required: your password expires today`;

  const result = $derived(input.trim() ? analyze(input) : null);

  const gradeStyle: Record<Grade, { bar: string; chip: string; label: string }> = {
    good: { bar: 'bg-neon-green', chip: 'bg-neon-green/15 text-neon-green ring-1 ring-neon-green/30', label: 'ok' },
    warn: { bar: 'bg-neon-amber', chip: 'bg-neon-amber/15 text-neon-amber ring-1 ring-neon-amber/30', label: 'check' },
    bad:  { bar: 'bg-neon-rose',  chip: 'bg-neon-rose/15 text-neon-rose ring-1 ring-neon-rose/30',   label: 'flag' },
    info: { bar: 'bg-ghost-300',  chip: 'bg-ghost-500/15 text-ghost-600 ring-1 ring-ghost-500/30',   label: 'note' }
  };

  const verdictCopy = {
    clean:      { label: 'No red flags',  cls: 'text-neon-green' },
    review:     { label: 'Worth a look',  cls: 'text-neon-amber' },
    suspicious: { label: 'Suspicious',    cls: 'text-neon-rose' }
  };
</script>

<svelte:head>
  <title>Email Header Analyzer · tools.gaanesh.com</title>
  <meta
    name="description"
    content="Paste raw email headers to reconstruct the delivery path and flag phishing indicators. Runs entirely in your browser, nothing is uploaded."
  />
</svelte:head>

<ToolFrame toolId="email">
  {#snippet note()}
    Paste the full original headers. In Gmail use "Show original", in Outlook "View message source".
  {/snippet}

  {#snippet actions()}
    <button
      type="button"
      onclick={() => (input = sample)}
      class="inline-flex items-center gap-1 rounded-[3px] border border-ghost-300 px-3 py-1 text-[12.5px] font-medium text-ink-700 transition hover:border-neon-cyan hover:text-neon-cyan"
    >Try a sample</button>
    {#if input}
      <button
        type="button"
        onclick={() => (input = '')}
        class="inline-flex items-center gap-1 rounded-[3px] border border-ghost-300 px-3 py-1 text-[12.5px] font-medium text-ink-700 transition hover:border-neon-cyan hover:text-neon-cyan"
      >Clear</button>
    {/if}
  {/snippet}

  <div class="space-y-5">
    <label class="block">
      <span class="mb-1 block text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Raw headers</span>
      <textarea
        bind:value={input}
        rows="10"
        spellcheck="false"
        placeholder={'Return-Path: <...>\nReceived: from ...\nAuthentication-Results: ...\nFrom: ...'}
        class="w-full resize-y rounded-[3px] border border-ghost-300 bg-ghost-50 p-3 font-mono text-xs text-ink-900 outline-none transition focus:border-neon-cyan"
      ></textarea>
    </label>

    <p class="rounded-[3px] border border-ghost-200 border-l-[3px] border-l-neon-cyan bg-ghost-50 p-3 text-[14px] text-ink-700">
      <b class="font-semibold text-ink-900">SPF, DKIM and DMARC results below are read back from what the
      receiving mail server recorded.</b> They are not re-checked here, because that needs DNS and nothing
      on this page talks to the network. A forged header block can claim anything.
    </p>

    {#if result}
      <!-- Verdict -->
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-ghost-200 bg-ghost-50 p-4">
        <div>
          <p class="text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Verdict</p>
          <p class="mt-1 text-2xl font-semibold {verdictCopy[result.verdict].cls}">
            {verdictCopy[result.verdict].label}
          </p>
        </div>
        {#if result.transitSeconds !== null}
          <div class="text-right">
            <p class="text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">Total transit</p>
            <p class="mt-1 font-mono text-lg text-ink-900">{formatDuration(result.transitSeconds)}</p>
          </div>
        {/if}
      </div>

      <!-- Identity summary -->
      <div class="grid gap-px overflow-hidden rounded-[3px] border border-ghost-200 bg-ghost-200 sm:grid-cols-2">
        {#each [
          ['From',        result.from?.address ?? '—', result.from?.display ?? ''],
          ['Reply-To',    result.replyTo?.address ?? '—', ''],
          ['Return-Path', result.returnPath?.address ?? '—', ''],
          ['Subject',     result.subject || '—', '']
        ] as [label, value, sub]}
          <div class="bg-ghost-50 p-3">
            <p class="text-[12px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">{label}</p>
            <p class="mt-1 break-all font-mono text-[13px] text-ink-900">{value}</p>
            {#if sub}<p class="mt-0.5 break-all text-[13px] text-ghost-600">displayed as "{sub}"</p>{/if}
          </div>
        {/each}
      </div>

      <!-- Findings -->
      {#if result.findings.length}
        <div class="space-y-2">
          {#each result.findings as f}
            {@const style = gradeStyle[f.grade]}
            <article class="relative overflow-hidden rounded-[3px] border border-ghost-200 bg-ghost-50 p-4">
              <span class="absolute inset-y-0 left-0 w-[3px] {style.bar}"></span>
              <div class="ml-3 flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-[15px] font-semibold text-ink-900">{f.key}</h3>
                    <span class="rounded-full px-2 py-0.5 text-[11px] uppercase {style.chip}">{style.label}</span>
                    <span class="font-mono text-[13px] text-ghost-600">{f.summary}</span>
                  </div>
                  <p class="mt-1.5 text-[14px] leading-relaxed text-ink-700">{f.detail}</p>
                  {#if f.raw}
                    <pre class="mt-2 overflow-x-auto rounded-[3px] border border-ghost-200 bg-paper p-2 font-mono text-[11px] whitespace-pre-wrap text-ink-700">{f.raw}</pre>
                  {/if}
                </div>
                {#if f.raw}<CopyButton value={f.raw} />{/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}

      <!-- Delivery path -->
      {#if result.hops.length}
        <div>
          <h3 class="mb-2 text-[13px] font-semibold tracking-[0.02em] text-ghost-600 uppercase">
            Delivery path · {result.hops.length} hop{result.hops.length === 1 ? '' : 's'}, origin first
          </h3>
          <div class="space-y-2">
            {#each result.hops as hop}
              <article class="rounded-[3px] border border-ghost-200 bg-ghost-50 p-3">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <span class="font-mono text-[13px] text-ink-900">
                    <span class="text-ghost-600">{hop.index}.</span>
                    {hop.from || 'unknown'} <span class="text-ghost-600">→</span> {hop.by || 'unknown'}
                  </span>
                  <span class="font-mono text-[12px] text-ghost-600">
                    {#if hop.delaySeconds !== null}+{formatDuration(hop.delaySeconds)}{/if}
                  </span>
                </div>
                <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-ghost-600">
                  {#if hop.ip}<span>ip {hop.ip}</span>{/if}
                  {#if hop.protocol}<span>via {hop.protocol}</span>{/if}
                  {#if hop.dateRaw}<span>{hop.dateRaw}</span>{/if}
                </div>
              </article>
            {/each}
          </div>
        </div>
      {/if}

      <!-- All headers -->
      <details class="rounded-[3px] border border-ghost-200 bg-ghost-50 p-3">
        <summary class="cursor-pointer text-[14px] text-ink-700">
          All {result.headers.length} parsed headers
        </summary>
        <div class="mt-3 space-y-1">
          {#each result.headers as h}
            <div class="grid gap-1 sm:grid-cols-[180px_1fr]">
              <span class="font-mono text-[12px] text-ghost-600">{h.name}</span>
              <span class="font-mono text-[12px] break-all text-ink-700">{h.value}</span>
            </div>
          {/each}
        </div>
      </details>
    {:else}
      <p class="rounded-[3px] border border-ghost-200 bg-ghost-50 p-4 font-mono text-[13px] text-ghost-600">
        Paste headers above to start, or try the sample.
      </p>
    {/if}
  </div>
</ToolFrame>
