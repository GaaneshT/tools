<script lang="ts">
	import ImageToolkit from '$lib/components/tools/ImageToolkit.svelte';
</script>

<section class="flex flex-col gap-6">
	<span
		class="inline-flex max-w-fit items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-emerald-200 uppercase"
	>
		Privacy-first
		<span aria-hidden="true">•</span>
		Zero backend
	</span>
	<h1 class="text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
		Tools that make your life easier.
	</h1>
	<p class="max-w-2xl text-base text-slate-300">
		A growing collection of browser-native utilities for images, PDFs, audio, and developer
		workflows. Everything runs in JavaScript and WebAssembly LOCALLY. No uploads, no analytics.
	</p>
	<div class="grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
		<div class="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
			<h2 class="text-sm font-semibold tracking-wide text-slate-200 uppercase">
				Secure
			</h2>
			<ul class="mt-2 space-y-1 text-xs text-slate-400">
				<li>Content-Security-Policy tuned for offline-first workflows.</li>
				<li>Strict MIME and size checks before processing (50 MB cap).</li>
				<li>No external requests, no analytics, no third-party embeds.</li>
			</ul>
		</div>
		<div class="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4">
			<h2 class="text-sm font-semibold tracking-wide text-slate-200 uppercase">Modular toolkit</h2>
			<ul class="mt-2 space-y-1 text-xs text-slate-400">
				<li>Each tool is designed to be an isolated Svelte component.</li>
				<li>Lazy load heavy WASM bundles only when needed.</li>
			</ul>
		</div>
	</div>
</section>

<section class="mt-10 flex flex-col gap-6">
	<ImageToolkit />
</section>

<section
	class="mt-12 grid gap-4 rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 text-sm text-slate-300"
>
	<h2 class="text-lg font-semibold text-slate-100">My planned works</h2>
	<div class="grid gap-4 md:grid-cols-2">

		<div class="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
			<div class="flex items-center justify-between">
				<h3 class="text-sm font-semibold tracking-wide text-slate-200 uppercase">Image edits</h3>
				<span
					class="inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-200 uppercase"
					aria-label="Completed"
					title="Completed"
				>
					Done
				</span>
			</div>
			<p class="mt-1 text-xs text-slate-400">
				Crop, resize, convert, compress, and clean up image metadata. Works with JPG, PNG, WebP, and AVIF.
			</p>
		</div>

		<div class="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
			<h3 class="text-sm font-semibold tracking-wide text-slate-200 uppercase">PDF utilities</h3>
			<p class="mt-1 text-xs text-slate-400">
				Split and merge PDFs, turn images into PDFs, scrub metadata, and more. No more sus PDF sites.
			</p>
		</div>
		<div class="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
			<h3 class="text-sm font-semibold tracking-wide text-slate-200 uppercase">
				Audio &amp; video
			</h3>
			<p class="mt-1 text-xs text-slate-400">
				ffmpeg.wasm on tap to convert, trim, mute, and make GIFs from videos.
			</p>
		</div>
		<div class="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
			<h3 class="text-sm font-semibold tracking-wide text-slate-200 uppercase">
				Developer helpers
			</h3>
			<p class="mt-1 text-xs text-slate-400">
				Hash tools, Base64 encode and decode, text diff, and zip or unzip in the browser. Basically a shitty homemade cyberchef, lol.
			</p>
		</div>
	
	</div>
</section>
