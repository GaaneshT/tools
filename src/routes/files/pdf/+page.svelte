<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import PdfToolkit from '$lib/components/tools/PdfToolkit.svelte';
</script>

<svelte:head>
  <title>PDF Toolkit · tools.gaanesh.com</title>
  <meta name="description" content="Split, merge, convert images to PDF, and strip metadata. Browser-only — no uploads." />
</svelte:head>

<ToolFrame toolId="pdf" command="open pdf">
  <PdfToolkit />
</ToolFrame>
