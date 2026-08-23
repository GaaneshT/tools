<script lang="ts">
	// ToolFrame already renders the page heading, blurb and surface for every
	// tool route, so this is a plain pass-through container. The props are kept
	// because the toolkits still pass them, but rendering them here would
	// duplicate the heading and nest a second bordered panel inside ToolFrame's.
	export let title: string = '';
	export let description: string = '';
	export let badge: string | null = null;
	export let id: string | null = null;

	void title;
	void description;
	void badge;
</script>

<section id={id ?? undefined} class="body">
	<slot />
</section>

<style>
	.body {
		display: grid;
		gap: 18px;
		font-size: 15px;
		color: var(--ink2);
	}
</style>
