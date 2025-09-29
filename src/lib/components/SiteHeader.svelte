<script lang="ts">
	const navLinks = [
		{ href: 'https://blog.gaanesh.com', label: 'My Blog' },
		{ href: 'https://gaanesh.com', label: 'Gaanesh.com' }
	];
</script>

<header class="border-b border-slate-800/70 bg-slate-950/70 backdrop-blur">
	<div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4">
		<div class="flex flex-col gap-1">
			<a href="/" class="text-lg font-semibold tracking-tight text-slate-50 hover:text-emerald-300" aria-label="gaanesh tools home">
				Toolkits
			</a>
			<p class="text-sm text-slate-400">Browser-only, file utilities for privacy</p>
		</div>
		<nav aria-label="Primary">
			<ul class="flex items-center gap-4 text-sm font-medium text-slate-300">
				{#each navLinks as link}
					<li>
						<a
							href={link.href}
							class="inline-flex items-center whitespace-nowrap rounded-full border border-slate-800/80 px-4 py-1.5 transition hover:border-emerald-400/50 hover:text-emerald-200"
							target="_blank"
							rel="noreferrer noopener"
						>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</header>
