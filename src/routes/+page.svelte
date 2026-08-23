<script lang="ts">
  import { tools, categories } from '$lib/tools';
  import { identity } from '$lib/identity';

  const groups = categories
    .map((category) => ({
      ...category,
      items: tools.filter((tool) => tool.category === category.id)
    }))
    .filter((group) => group.items.length > 0);
</script>

<svelte:head>
  <title>Tools — {identity.name}</title>
  <meta
    name="description"
    content="Browser-only utilities for security and everyday work. No uploads, no server, nothing leaves the tab."
  />
</svelte:head>

<div class="phead">
  <h1>Tools</h1>
  <p>{identity.tagline}</p>
</div>

<div class="privacy">
  <p>
    <b>Nothing is uploaded.</b> Every tool on this site does its work in your browser. There is no
    backend to send your files or text to, which you can check for yourself in the network tab.
  </p>
</div>

{#each groups as group}
  <div>
    <div class="grouphead">
      <span class="y">{group.label}</span>
      <span class="n">{group.items.length} {group.items.length === 1 ? 'tool' : 'tools'}</span>
      <span class="ln"></span>
    </div>
    {#each group.items as tool}
      <a class="trow" href={tool.path}>
        <span class="t">
          {tool.name}
          <em>{tool.blurb}</em>
        </span>
        {#if tool.status !== 'ready'}<span class="r">{tool.status}</span>{/if}
      </a>
    {/each}
  </div>
{/each}
