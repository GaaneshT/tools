<script lang="ts">
  import { identity, navLinks } from '$lib/identity';
</script>

<div class="bar">
  <a href={identity.portfolio} class="me">{identity.name}</a>
  <nav class="nav" aria-label="Primary">
    {#each navLinks as link}
      {#if link.external}
        <a href={link.url}>{link.label}</a>
      {:else}
        <a href={link.url} class:here={link.here}>{link.label}</a>
      {/if}
    {/each}
  </nav>
</div>
