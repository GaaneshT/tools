<script lang="ts">
  import { tools } from '$lib/tools';

  let {
    toolId,
    command = null,
    children,
    note,
    actions
  }: {
    toolId: string;
    command?: string | null;
    children?: import('svelte').Snippet;
    note?: import('svelte').Snippet;
    actions?: import('svelte').Snippet;
  } = $props();

  const tool = tools.find((t) => t.id === toolId);
  void command;

  const SITE = 'https://tools.gaanesh.com';
  const url = `${SITE}${tool?.path ?? ''}`;
</script>

<!-- Each route sets its own title and description. Canonical and og live here
     so every tool page identifies itself rather than pointing at the suite
     root, which is what happened while these were defaults in app.html. -->
<svelte:head>
  <link rel="canonical" href={url} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={`${tool?.name ?? 'Tool'} · tools.gaanesh.com`} />
  <meta property="og:description" content={tool?.blurb ?? ''} />
  <meta property="og:url" content={url} />
  <meta name="twitter:card" content="summary" />
</svelte:head>

<section>
  <div class="phead">
    <a href="/" class="back"><span aria-hidden="true">&larr;</span> All tools</a>
    <h1>{tool?.name ?? 'Tool'}</h1>
    <p>{tool?.blurb ?? ''}</p>
    {#if note}
      <p class="note">{@render note()}</p>
    {/if}
  </div>

  {#if actions}
    <div class="frame-actions">{@render actions()}</div>
  {/if}

  <div class="panel">
    {@render children?.()}
  </div>

  <p class="assure">Everything here runs in your browser. Nothing leaves this tab.</p>
</section>

<style>
  .phead .back { margin-bottom: 22px; }
  .phead .note {
    font-size: 14.5px;
    color: var(--faint);
    margin-top: 10px;
  }

  .frame-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 24px;
  }

  .panel {
    margin-top: 30px;
    padding: 26px;
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: 4px;
  }

  @media (max-width: 600px) {
    .panel { padding: 20px; }
  }

  .assure {
    margin-top: 18px;
    font-size: 13.5px;
    color: var(--faint);
  }
</style>
