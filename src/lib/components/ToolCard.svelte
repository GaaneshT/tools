<script lang="ts">
	export let title: string;
	export let description: string;
	export let badge: string | null = null;
	export let id: string | null = null;
</script>

<section
	id={id ?? undefined}
	class="relative flex flex-col gap-6 rounded-3xl border border-slate-800/70 bg-slate-950/80 p-6 shadow-[0_40px_120px_-60px_rgba(16,185,129,0.45)]"
>
	<header class="flex flex-col gap-2">
		<div class="flex items-center gap-3">
			<h2 class="text-xl font-semibold tracking-tight text-slate-50">{title}</h2>
			{#if badge}
				<span
					class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium tracking-wide text-emerald-200 uppercase"
				>
					{badge}
				</span>
			{/if}
		</div>
		<p class="max-w-2xl text-sm text-slate-400">{description}</p>
	</header>
	<div class="grid gap-5 text-sm text-slate-200">
		<slot />
	</div>
</section>
