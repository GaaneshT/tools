<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import SiteHeader from '$lib/components/SiteHeader.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta
		name="description"
		content="Privacy-first, browser-only toolbox for file conversion, editing, and sanitization."
	/>
	<meta name="theme-color" content="#020617" />
</svelte:head>

<div class="relative min-h-dvh bg-slate-950 text-slate-100">
	<div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
		<div
			class="absolute -top-1/2 left-1/2 size-[60rem] -translate-x-1/2 animate-[pulse_18s_ease-in-out_infinite] rounded-full bg-emerald-500/10 blur-3xl"
		></div>
		<div
			class="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,_185,_129,_0.12),_rgba(2,_6,_23,_0.6))]"
		></div>
	</div>
	<SiteHeader />
	<main class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
		{@render children?.()}
	</main>
	<SiteFooter />
</div>
