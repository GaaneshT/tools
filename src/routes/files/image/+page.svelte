<script lang="ts">
  import ToolFrame from '$lib/components/ToolFrame.svelte';
  import ImageToolkit from '$lib/components/tools/ImageToolkit.svelte';
</script>

<svelte:head>
  <title>Image Toolkit · tools.gaanesh.com</title>
  <meta name="description" content="Crop, resize, convert, compress, and strip metadata from images. Runs entirely in your browser." />
</svelte:head>

<ToolFrame toolId="image" command="open image">
  <ImageToolkit />
</ToolFrame>
