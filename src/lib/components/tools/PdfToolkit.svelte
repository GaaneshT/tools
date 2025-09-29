<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import ToolCard from '$lib/components/ToolCard.svelte';
  import { downloadBlob } from '$lib/utils/download';
  import { deriveFileName } from '$lib/utils/file';
  import { formatBytes } from '$lib/utils/format';
  import { PDFDocument } from 'pdf-lib';

  const MM_TO_PT = 72 / 25.4;
  const LOCAL_STORAGE_KEY = 'pdfToolkitSettings';
  const MAX_RENDERED_THUMBNAILS = 9999; // render all (progressively)
  const rendering = new Set<string>();

  type PageSizeOption =
    | { id: 'auto'; label: 'Auto (fit image)'; width: null; height: null }
    | { id: 'a4'; label: 'A4 (210×297 mm)'; width: number; height: number }
    | { id: 'letter'; label: 'Letter (216×279 mm)'; width: number; height: number }
    | { id: 'custom'; label: 'Custom'; width: null; height: null };

  type FitOption = 'fit' | 'fill' | 'stretch';
  type OrientationOption = 'auto' | 'portrait' | 'landscape';

  type LoadedPdf = {
    id: string;
    name: string;
    size: number;
    arrayBuffer: ArrayBuffer | Uint8Array;
    objectUrl: string;
    pageCount: number;
    metadata: Record<string, string | undefined>;
    pageThumbs: (string | null)[];
    pageSelection: Set<number>;
    lastSelectedIndex: number | null;
    pageOrder: number[]; // logical order of pages (indices in the original doc)
    previewUrl: string | null;
  };

  type ImageAsset = {
    id: string;
    file: File;
    objectUrl: string;
    name: string;
    size: number;
    type: string;
    width: number;
    height: number;
  };

  let pdfFiles: LoadedPdf[] = [];
  let imageAssets: ImageAsset[] = [];
  let pdfjsLib: any = null;
  let pdfWorker: Worker | null = null;
  let statusMessage = '';
  let errorMessage = '';
  let processing = false;

  let addPrivateSuffix = true;
  let pageSizeOption: PageSizeOption['id'] = 'auto';
  let customPageWidthMm = 210;
  let customPageHeightMm = 297;
  let fitOption: FitOption = 'fit';
  let orientationOption: OrientationOption = 'auto';

  const PAGE_SIZES: PageSizeOption[] = [
    { id: 'auto', label: 'Auto (fit image)', width: null, height: null },
    { id: 'a4', label: 'A4 (210×297 mm)', width: 210, height: 297 },
    { id: 'letter', label: 'Letter (216×279 mm)', width: 216, height: 279 },
    { id: 'custom', label: 'Custom', width: null, height: null }
  ];

  /** Always give pdf.js/pdf-lib a fresh copy to avoid detached buffers */
  function cloneBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
    return buf instanceof Uint8Array ? new Uint8Array(buf) : new Uint8Array(buf.slice(0));
  }

  // Robust pdf.js init for Vite
  onMount(async () => {
    try {
      const core = await import('pdfjs-dist');
      const PdfWorker = (await import('pdfjs-dist/build/pdf.worker.mjs?worker')).default;
      pdfjsLib = core;
      pdfWorker = new PdfWorker();
      pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorker;
    } catch (err) {
      console.error('Failed to initialise pdf.js', err);
      errorMessage = 'Unable to initialise PDF renderer.';
    }

    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        addPrivateSuffix   = parsed.addPrivateSuffix   ?? addPrivateSuffix;
        pageSizeOption     = parsed.pageSizeOption     ?? pageSizeOption;
        customPageWidthMm  = parsed.customPageWidthMm  ?? customPageWidthMm;
        customPageHeightMm = parsed.customPageHeightMm ?? customPageHeightMm;
        fitOption          = parsed.fitOption          ?? fitOption;
        orientationOption  = parsed.orientationOption  ?? orientationOption;
      } catch { /* ignore */ }
    }
  });

  onDestroy(() => {
    cleanupAll();
    pdfWorker?.terminate();
    pdfWorker = null;
  });

  // Render thumbs as soon as pdf.js is ready (covers the "first PDF" race)
  $: if (pdfjsLib && pdfFiles.length) {
    for (const pdf of pdfFiles) {
      if (!rendering.has(pdf.id) && pdf.pageThumbs.some(t => t === null)) {
        rendering.add(pdf.id);
        renderThumbnailsForPdf(pdf, pdf.pageCount)
          .catch(err => console.error('thumbs failed', err))
          .finally(() => rendering.delete(pdf.id));
      }
    }
  }

  // --- Page DnD (PDF thumbnails) ---
  let dragPos: number | null = null;
  function onDragStart(pos: number, e?: DragEvent) {
    dragPos = pos;
    e?.dataTransfer?.setData('text/plain', String(pos));
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
  }
  function onDrop(pdf: LoadedPdf, pos: number) {
    if (dragPos === null) return;
    movePage(pdf, dragPos, pos);
    dragPos = null;
  }

  function getPdfById(id: string): LoadedPdf | undefined {
    return pdfFiles.find(p => p.id === id);
  }

  function replacePdfById(id: string, patch: Partial<LoadedPdf>) {
    const idx = pdfFiles.findIndex(p => p.id === id);
    if (idx === -1) return;
    const next = { ...pdfFiles[idx], ...patch };
    pdfFiles = [...pdfFiles.slice(0, idx), next, ...pdfFiles.slice(idx + 1)];
  }

  async function buildReorderedBytes(pdfId: string): Promise<Uint8Array> {
    const live = getPdfById(pdfId);
    if (!live) throw new Error('PDF not found');

    const src = await PDFDocument.load(cloneBytes(live.arrayBuffer), {
      ignoreEncryption: true,
      updateMetadata: false
    });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, live.pageOrder);
    copied.forEach(p => out.addPage(p));
    return out.save();
  }

  async function previewReordered(pdf: LoadedPdf) {
    processing = true;
    try {
      const bytes = await buildReorderedBytes(pdf.id);
      const live = getPdfById(pdf.id);
      if (!live) return;

      if (live.previewUrl) URL.revokeObjectURL(live.previewUrl);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      replacePdfById(pdf.id, { previewUrl: url });
      statusMessage = 'Preview generated.';
    } catch (e) {
      console.error('previewReordered failed', e);
      errorMessage = (e as Error).message ?? 'Unable to build preview.';
    } finally {
      processing = false;
    }
  }

  async function downloadReordered(pdf: LoadedPdf) {
    processing = true;
    try {
      const bytes = await buildReorderedBytes(pdf.id);
      const suffix = addPrivateSuffix ? '.private' : '';
      const base = pdf.name.replace(/\.pdf$/i, '');
      const name = `${base}-reordered${suffix}.pdf`;
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
      statusMessage = 'Downloaded reordered PDF.';
    } catch (e) {
      console.error('downloadReordered failed', e);
      errorMessage = (e as Error).message ?? 'Unable to download reordered PDF.';
    } finally {
      processing = false;
    }
  }

  function hasAnyMeta(pdf: LoadedPdf) {
    return Object.values(pdf.metadata).some(Boolean);
  }

  function setPageSelection(pdf: LoadedPdf, next: Set<number>, last: number | null = pdf.lastSelectedIndex) {
    replacePdfById(pdf.id, { pageSelection: next, lastSelectedIndex: last });
  }

  function persistSettings() {
    if (typeof localStorage === 'undefined') return;
    const payload = {
      addPrivateSuffix, pageSizeOption, customPageWidthMm, customPageHeightMm, fitOption, orientationOption
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  }

  function cleanupAll() {
    for (const pdf of pdfFiles) {
      URL.revokeObjectURL(pdf.objectUrl);
      if (pdf.previewUrl) URL.revokeObjectURL(pdf.previewUrl);
      pdf.pageThumbs.forEach((t) => t && URL.revokeObjectURL(t));
    }
    for (const img of imageAssets) URL.revokeObjectURL(img.objectUrl);
    pdfFiles = [];
    imageAssets = [];
  }

  async function handlePdfInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    await loadPdfFiles(Array.from(files));
    input.value = '';
  }

  async function loadPdfFiles(files: File[]) {
    const newPdfs: LoadedPdf[] = [];
    for (const file of files) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        errorMessage = `Skipped ${file.name} (not a PDF).`;
        continue;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pageCount = doc.getPageCount();
        const metadata = {
          Title: doc.getTitle(),
          Author: doc.getAuthor(),
          Subject: doc.getSubject(),
          Keywords: doc.getKeywords()?.join(', '),
          Creator: doc.getCreator(),
          Producer: doc.getProducer()
        };
        const objectUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: 'application/pdf' }));
        const id = crypto.randomUUID();
        const pdf: LoadedPdf = {
          id,
          name: file.name,
          size: file.size,
          arrayBuffer,
          objectUrl,
          pageCount,
          metadata,
          pageThumbs: new Array(pageCount).fill(null),
          pageSelection: new Set(),
          lastSelectedIndex: null,
          pageOrder: Array.from({ length: pageCount }, (_, i) => i),
          previewUrl: null
        };
        newPdfs.push(pdf);
      } catch (err) {
        console.error('Failed to load PDF', err);
        errorMessage = `Unable to read ${file.name}.`;
      }
    }
    pdfFiles = [...pdfFiles, ...newPdfs];
    statusMessage = `Loaded ${newPdfs.length} PDF${newPdfs.length === 1 ? '' : 's'}.`;
  }

  async function renderInitialThumbnails() {
    await tick();
    for (const pdf of pdfFiles) {
      await renderThumbnailsForPdf(pdf, pdf.pageCount);
    }
  }

  async function renderThumbnailsForPdf(pdf: LoadedPdf, maxPages = MAX_RENDERED_THUMBNAILS) {
    if (!pdfjsLib) return;
    const data = cloneBytes(pdf.arrayBuffer);
    const loadingTask = pdfjsLib.getDocument({ data });

    try {
      const pdfDoc = await loadingTask.promise;
      const renderCount = Math.min(pdf.pageCount, maxPages ?? pdf.pageCount);

      for (let i = 0; i < renderCount; i += 1) {
        if (pdf.pageThumbs[i]) continue;
        const page = await pdfDoc.getPage(i + 1);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;

        pdf.pageThumbs[i] = canvas.toDataURL('image/png');

        const idx = pdfFiles.findIndex(p => p.id === pdf.id);
        if (idx !== -1) {
          pdfFiles = [
            ...pdfFiles.slice(0, idx),
            { ...pdfFiles[idx], pageThumbs: [...pdf.pageThumbs] },
            ...pdfFiles.slice(idx + 1)
          ];
        }

        await tick();
      }
    } catch (err) {
      console.error('Thumbnail render failed', err);
    } finally {
      await loadingTask.destroy();
    }
  }

  function togglePageSelection(pdf: LoadedPdf, pageIndex: number, event: MouseEvent) {
    const next = new Set(pdf.pageSelection);
    if (event.shiftKey && pdf.lastSelectedIndex !== null) {
      const [start, end] = [pdf.lastSelectedIndex, pageIndex].sort((a, b) => a - b);
      for (let i = start; i <= end; i += 1) next.add(i);
    } else if (next.has(pageIndex)) {
      next.delete(pageIndex);
    } else {
      next.add(pageIndex);
    }
    setPageSelection(pdf, next, pageIndex);
  }

  function selectAllPages(pdf: LoadedPdf) {
    const next = new Set<number>();
    for (let i = 0; i < pdf.pageCount; i += 1) next.add(i);
    setPageSelection(pdf, next);
  }

  function clearPageSelection(pdf: LoadedPdf) {
    setPageSelection(pdf, new Set(), null);
  }

  function onPageGridKeydown(pdf: LoadedPdf, event: KeyboardEvent) {
    if (event.key.toLowerCase() === 'a') {
      if (pdf.pageSelection.size === pdf.pageCount) clearPageSelection(pdf);
      else selectAllPages(pdf);
    }
  }

  function movePage(pdf: LoadedPdf, fromPos: number, toPos: number) {
    if (fromPos === toPos) return;
    const order = [...pdf.pageOrder];
    if (fromPos < 0 || fromPos >= order.length) return;
    if (toPos   < 0 || toPos   >= order.length) return;
    const [id] = order.splice(fromPos, 1);
    order.splice(toPos, 0, id);
    const idx = pdfFiles.findIndex((p) => p.id === pdf.id);
    if (idx !== -1) {
      pdfFiles = [
        ...pdfFiles.slice(0, idx),
        { ...pdfFiles[idx], pageOrder: order },
        ...pdfFiles.slice(idx + 1)
      ];
    }
  }

  function movePageStep(pdf: LoadedPdf, pos: number, dir: -1 | 1) {
    movePage(pdf, pos, pos + dir);
  }

  async function exportSelectedPages(pdf: LoadedPdf) {
    if (pdf.pageSelection.size === 0) {
      errorMessage = 'Select pages to export.';
      return;
    }
    processing = true;
    errorMessage = '';
    statusMessage = '';

    try {
      const data = pdf.arrayBuffer instanceof Uint8Array ? pdf.arrayBuffer : new Uint8Array(pdf.arrayBuffer);
      const src = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
      const out = await PDFDocument.create();

      const inOrder = pdf.pageOrder.filter((idx) => pdf.pageSelection.has(idx));
      const copied = await out.copyPages(src, inOrder);
      for (const page of copied) out.addPage(page);

      const bytes = await out.save();
      const suffix = addPrivateSuffix ? '.private' : '';
      const name = deriveFileName({
        originalName: pdf.name,
        targetExtension: 'pdf',
        suffix: `pages-${inOrder.map((p) => p + 1).join('-')}${suffix}`
      });

      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
      statusMessage = `Exported ${inOrder.length} page${inOrder.length === 1 ? '' : 's'} from ${pdf.name}.`;
    } catch (err) {
      console.error('Split/export failed', err);
      errorMessage = (err as Error)?.message || 'Unable to export selected pages.';
    } finally {
      processing = false;
    }
  }

  function movePdf(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= pdfFiles.length) return;
    const updated = [...pdfFiles];
    const [item] = updated.splice(index, 1);
    updated.splice(newIndex, 0, item);
    pdfFiles = updated;
  }

  async function mergePdfs() {
    if (pdfFiles.length < 2) {
      errorMessage = 'Add at least two PDFs to merge.';
      return;
    }
    processing = true;
    statusMessage = '';
    errorMessage = '';

    try {
      const out = await PDFDocument.create();

      for (const pdf of pdfFiles) {
        const src = await PDFDocument.load(cloneBytes(pdf.arrayBuffer), {
          ignoreEncryption: true,
          updateMetadata: false
        });

        const order = pdf.pageSelection.size
          ? pdf.pageOrder.filter(i => pdf.pageSelection.has(i))
          : [...pdf.pageOrder];

        const copied = await out.copyPages(src, order);
        for (const p of copied) out.addPage(p);
      }

      const bytes = await out.save();
      const base = pdfFiles[0].name.replace(/\.pdf$/i, '') || 'merged';
      const suffix = addPrivateSuffix ? '.private' : '';
      const name = `${base}-merged${suffix}.pdf`;
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
      statusMessage = `Merged ${pdfFiles.length} PDFs.`;
    } catch (e: unknown) {
      console.error('Merge failed', e);
      errorMessage = (e as Error)?.message || 'Unable to merge PDFs.';
    } finally {
      processing = false;
    }
  }

  // --- Images: add drag & drop reorder ---
  let imgDragPos: number | null = null;

  function onImageDragStart(pos: number, e?: DragEvent) {
    imgDragPos = pos;
    e?.dataTransfer?.setData('text/plain', String(pos));
  }
  function onImageDragOver(e: DragEvent) {
    e.preventDefault();
  }
  function onImageDrop(pos: number) {
    if (imgDragPos === null) return;
    moveImage(imgDragPos, pos);
    imgDragPos = null;
  }

  function moveImage(fromPos: number, toPos: number) {
    if (fromPos === toPos) return;
    const next = [...imageAssets];
    if (fromPos < 0 || fromPos >= next.length) return;
    if (toPos   < 0 || toPos   >= next.length) return;
    const [item] = next.splice(fromPos, 1);
    next.splice(toPos, 0, item);
    imageAssets = next; // triggers Svelte reactivity
  }

  function moveImageStep(pos: number, dir: -1 | 1) {
    moveImage(pos, pos + dir);
  }

  async function handleImageInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    await loadImageAssets(Array.from(files));
    input.value = '';
  }

  async function loadImageAssets(files: File[]) {
    const newAssets: ImageAsset[] = [];
    for (const file of files) {
      if (!/^image\/(png|jpe?g|webp|avif)$/i.test(file.type)) {
        errorMessage = `Skipped ${file.name} (unsupported image type).`;
        continue;
      }
      try {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;
        await img.decode();
        const asset: ImageAsset = {
          id: crypto.randomUUID(),
          file,
          objectUrl,
          name: file.name,
          size: file.size,
          type: file.type,
          width: img.naturalWidth,
          height: img.naturalHeight
        };
        newAssets.push(asset);
      } catch (err) {
        console.error('Failed to load image', err);
        errorMessage = `Unable to read ${file.name}.`;
      }
    }
    imageAssets = [...imageAssets, ...newAssets];
    statusMessage = `Loaded ${newAssets.length} image${newAssets.length === 1 ? '' : 's'}.`;
  }

  function removeImage(id: string) {
    const asset = imageAssets.find((i) => i.id === id);
    if (!asset) return;
    URL.revokeObjectURL(asset.objectUrl);
    imageAssets = imageAssets.filter((i) => i.id !== id);
  }
  function clearImageList() {
    imageAssets.forEach((asset) => URL.revokeObjectURL(asset.objectUrl));
    imageAssets = [];
  }
  function onImageListKeydown(event: KeyboardEvent) {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearImageList();
    }
  }

  function mmToPoints(mm: number) {
    return mm * MM_TO_PT;
  }
  function resolvePageSize() {
    const option = PAGE_SIZES.find((opt) => opt.id === pageSizeOption) || PAGE_SIZES[0];
    if (option.id === 'auto') return null;
    if (option.id === 'custom') {
      return { width: mmToPoints(customPageWidthMm), height: mmToPoints(customPageHeightMm) };
    }
    return { width: mmToPoints(option.width!), height: mmToPoints(option.height!) };
  }

  async function imagesToPdf() {
    if (imageAssets.length === 0) {
      errorMessage = 'Add images to build a PDF.';
      return;
    }
    processing = true;
    try {
      const out = await PDFDocument.create();
      for (const asset of imageAssets) {
        const { file, type } = asset;
        let data = await file.arrayBuffer();
        let mime = type;

        // Re-encode WebP/AVIF to PNG for pdf-lib
        if (/image\/(webp|avif)/i.test(type)) {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas unsupported');
          ctx.drawImage(bitmap, 0, 0);
          data = await new Promise<ArrayBuffer>((resolve) =>
            canvas.toBlob((blob) => resolve(blob?.arrayBuffer() ?? new ArrayBuffer(0)), 'image/png', 1)
          );
          mime = 'image/png';
          bitmap.close();
        }

        const embedded = mime === 'image/png' ? await out.embedPng(data) : await out.embedJpg(data);

        let pageSize = resolvePageSize();
        if (!pageSize) pageSize = { width: embedded.width, height: embedded.height };

        let width = embedded.width;
        let height = embedded.height;

        const orientation =
          orientationOption === 'auto'
            ? width >= height ? 'landscape' : 'portrait'
            : orientationOption;

        if (orientation === 'landscape' && pageSize.width < pageSize.height) {
          [pageSize.width, pageSize.height] = [pageSize.height, pageSize.width];
        } else if (orientation === 'portrait' && pageSize.width > pageSize.height) {
          [pageSize.width, pageSize.height] = [pageSize.height, pageSize.width];
        }

        const page = out.addPage([pageSize.width, pageSize.height]);

        const scaleX = pageSize.width / width;
        const scaleY = pageSize.height / height;

        switch (fitOption) {
          case 'fit': {
            const s = Math.min(scaleX, scaleY); width *= s; height *= s; break;
          }
          case 'fill': {
            const s = Math.max(scaleX, scaleY); width *= s; height *= s; break;
          }
          case 'stretch':
            width = pageSize.width; height = pageSize.height; break;
        }

        const x = (pageSize.width - width) / 2;
        const y = (pageSize.height - height) / 2;
        page.drawImage(embedded, { x, y, width, height });
      }

      const bytes = await out.save();
      const suffix = addPrivateSuffix ? '.private' : '';
      const base = imageAssets[0]?.name.replace(/\.[^.]+$/, '') ?? 'images';
      const name = `${base}-images${suffix}.pdf`;
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
      statusMessage = `Created PDF with ${imageAssets.length} image${imageAssets.length === 1 ? '' : 's'}.`;
    } catch (err) {
      console.error('Images to PDF failed', err);
      errorMessage = 'Unable to convert images to PDF.';
    } finally {
      processing = false;
    }
  }

  async function clearMetadata(pdf: LoadedPdf) {
    processing = true;
    try {
      const doc = await PDFDocument.load(cloneBytes(pdf.arrayBuffer), {
        ignoreEncryption: true,
        updateMetadata: true
      });
      doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]);
      doc.setCreator('');
      const bytes = await doc.save();
      const oldUrl = pdf.objectUrl;
      const newUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      replacePdfById(pdf.id, {
        arrayBuffer: bytes,
        objectUrl: newUrl,
        metadata: { Title:'', Author:'', Subject:'', Keywords:'', Creator:'', Producer:'' }
      });
      URL.revokeObjectURL(oldUrl);
      statusMessage = `Cleared metadata for ${pdf.name} (Producer may remain).`;
    } catch (err) {
      console.error('Clear metadata failed', err);
      errorMessage = 'Unable to clear metadata.';
    } finally {
      processing = false;
    }
  }

  function onPageSizeChange(event: Event) {
    pageSizeOption = (event.currentTarget as HTMLSelectElement).value as PageSizeOption['id'];
    persistSettings();
  }
  function onFitChange(event: Event) {
    fitOption = (event.currentTarget as HTMLSelectElement).value as FitOption;
    persistSettings();
  }
  function onOrientationChange(event: Event) {
    orientationOption = (event.currentTarget as HTMLSelectElement).value as OrientationOption;
    persistSettings();
  }
  function toggleAddPrivateSuffix() {
    addPrivateSuffix = !addPrivateSuffix;
    persistSettings();
  }
  function clearStatus() {
    statusMessage = '';
    errorMessage = '';
  }
</script>

<ToolCard
  title="PDF Toolkit"
  description="Split, merge, make PDFs from images, and clear basic metadata. All local."
  badge="MVP"
  id="pdf-toolkit"
>
  <div class="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
    <!-- LEFT -->
    <div class="flex flex-col gap-6">
      <!-- Top controls -->
      <div class="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-5">
        <div class="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <label class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 font-semibold uppercase tracking-wide text-emerald-200">
            <input
              type="checkbox"
              bind:checked={addPrivateSuffix}
              on:change={toggleAddPrivateSuffix}
              class="size-4 rounded border border-slate-700 bg-slate-900/60 text-emerald-400 focus:ring-emerald-500"
            />
            Add “.private” suffix
          </label>

          <div class="flex flex-wrap items-center gap-2">
            <select value={fitOption} on:change={onFitChange} class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-2 py-1 text-xs text-slate-200">
              <option value="fit">Fit inside</option>
              <option value="fill">Fill page</option>
              <option value="stretch">Stretch</option>
            </select>
            <select value={orientationOption} on:change={onOrientationChange} class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-2 py-1 text-xs text-slate-200">
              <option value="auto">Auto orientation</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
            <select value={pageSizeOption} on:change={onPageSizeChange} class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-2 py-1 text-xs text-slate-200">
              {#each PAGE_SIZES as option}
                <option value={option.id}>{option.label}</option>
              {/each}
            </select>
            {#if pageSizeOption === 'custom'}
              <div class="flex items-center gap-1 text-xs text-slate-400">
                <input type="number" min="10" max="500" bind:value={customPageWidthMm} on:change={persistSettings} class="w-16 rounded border border-slate-800/70 bg-slate-900/70 px-2 py-1 text-xs text-slate-100" placeholder="Width" />
                <span>×</span>
                <input type="number" min="10" max="500" bind:value={customPageHeightMm} on:change={persistSettings} class="w-16 rounded border border-slate-800/70 bg-slate-900/70 px-2 py-1 text-xs text-slate-100" placeholder="Height" />
                <span>mm</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- PDFs panel -->
      <div class="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-5">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-300">PDFs</h3>
          <label class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            Add PDFs
            <input type="file" accept="application/pdf" multiple on:change={handlePdfInput} class="sr-only" />
          </label>
        </div>

        {#if pdfFiles.length === 0}
          <p class="mt-3 text-xs text-slate-500">Load one or more PDFs to split pages, merge, or scrub metadata.</p>
        {:else}
          <div class="mt-4 space-y-6">
            {#each pdfFiles as pdf, index (pdf.id)}
              <section class="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4">
                <header class="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                  <div class="min-w-0">
                    <p class="font-semibold text-slate-100 truncate">{pdf.name}</p>
                    <p class="text-xs text-slate-500">{formatBytes(pdf.size)} · {pdf.pageCount} page{pdf.pageCount === 1 ? '' : 's'}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button type="button" on:click={() => movePdf(index, -1)} class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-emerald-400/60 hover:text-emerald-200 disabled:opacity-40" disabled={index === 0}>▲</button>
                    <button type="button" on:click={() => movePdf(index, 1)} class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-emerald-400/60 hover:text-emerald-200 disabled:opacity-40" disabled={index === pdfFiles.length - 1}>▼</button>
                  </div>
                </header>

                <!-- Details & Actions row -->
                <div class="mt-3 rounded-xl border border-slate-800/70 bg-slate-900/70 p-3 text-xs text-slate-400">
                  <div class="grid gap-3 md:grid-cols-3 md:items-start">
                    <div class="min-w-0 md:col-span-2 md:pr-3">
                      {#if hasAnyMeta(pdf)}
                        <ul class="space-y-1 break-words [overflow-wrap:anywhere] [word-break:break-word]">
                          {#each Object.entries(pdf.metadata) as [key, value]}
                            {#if value}
                              <li class="whitespace-pre-wrap">
                                <span class="font-semibold text-slate-300">{key}</span>: {value}
                              </li>
                            {/if}
                          {/each}
                        </ul>
                      {:else}
                        <p class="text-slate-500">No descriptive metadata present.</p>
                      {/if}
                    </div>

                    <div class="flex w-full flex-wrap items-center gap-2 justify-start md:justify-end md:max-w-[22rem] md:justify-self-end">
                      <button
                        type="button"
                        on:click={() => previewReordered(pdf)}
                        class="rounded-full border border-slate-700 px-3 py-1 transition hover:border-emerald-400/60 hover:text-emerald-200 disabled:opacity-40"
                        disabled={processing}
                      >
                        Preview reordered
                      </button>

                      <button
                        type="button"
                        on:click={() => downloadReordered(pdf)}
                        class="rounded-full bg-emerald-500 px-3 py-1 text-emerald-950 font-semibold transition hover:bg-emerald-400 disabled:opacity-40"
                        disabled={processing}
                      >
                        Download reordered
                      </button>

                      <button
                        type="button"
                        on:click={() => clearMetadata(pdf)}
                        class="inline-flex items-center gap-2 rounded-full border border-red-400/60 px-3 py-1 text-red-200 transition hover:bg-red-500/10 disabled:opacity-40"
                        disabled={!hasAnyMeta(pdf) || processing}
                        title={hasAnyMeta(pdf) ? 'Clear basic metadata' : 'Nothing to clear'}
                      >
                        Clear basic metadata
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mt-4 grid gap-3" role="grid" on:keydown={(e) => onPageGridKeydown(pdf, e)} tabindex="0">
                  <div class="flex items-center gap-2 text-xs text-slate-400">
                    <button type="button" on:click={() => selectAllPages(pdf)} class="rounded-full border border-slate-700 px-3 py-1 transition hover:border-emerald-400/60 hover:text-emerald-200">Select all</button>
                    <button type="button" on:click={() => clearPageSelection(pdf)} class="rounded-full border border-slate-700 px-3 py-1 transition hover:border-emerald-400/60 hover:text-emerald-200">Clear</button>
                    <button type="button" on:click={() => exportSelectedPages(pdf)} class="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40" disabled={pdf.pageSelection.size === 0 || processing}>Export selection</button>
                  </div>

                  {#if pdf.previewUrl}
                    <div class="mt-3 overflow-hidden rounded-xl border border-slate-800/70">
                      <iframe
                        title="Reordered preview"
                        src={pdf.previewUrl}
                        class="h-[480px] w-full bg-slate-950"
                      />
                    </div>
                  {/if}

                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {#each pdf.pageOrder as pageIndex, pos (pageIndex)}
                      <div
                        role="gridcell"
                        draggable="true"
                        tabindex="0"
                        on:dragstart={(e) => onDragStart(pos, e)}
                        on:dragover|preventDefault={onDragOver}
                        on:drop={() => onDrop(pdf, pos)}
                        class={`group flex flex-col overflow-hidden rounded-xl border ${
                          pdf.pageSelection.has(pageIndex)
                            ? 'border-emerald-400/80 bg-emerald-500/10'
                            : 'border-slate-800/70 bg-slate-900/70'
                        } p-2 text-left text-xs text-slate-300`}
                      >
                        <div class="relative">
                          <div class="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              class="rounded-full bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                              on:click|stopPropagation={() => movePageStep(pdf, pos, -1)}
                              disabled={pos === 0}
                              title="Move left"
                            >◀</button>
                            <button
                              type="button"
                              class="rounded-full bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                              on:click|stopPropagation={() => movePageStep(pdf, pos, +1)}
                              disabled={pos === pdf.pageOrder.length - 1}
                              title="Move right"
                            >▶</button>
                          </div>

                          <button
                            type="button"
                            class="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-lg bg-slate-950/80"
                            on:click={(event) => togglePageSelection(pdf, pageIndex, event)}
                            title={`Toggle select Page ${pageIndex + 1}`}
                          >
                            {#if pdf.pageThumbs[pageIndex]}
                              <img src={pdf.pageThumbs[pageIndex]!} alt={`Page ${pageIndex + 1}`} class="h-full w-auto select-none object-contain" />
                            {:else}
                              <span class="text-slate-500">Page {pageIndex + 1}</span>
                            {/if}
                          </button>
                        </div>
                        <span class="mt-2 block text-slate-400">Page {pageIndex + 1}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              </section>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Images panel -->
      <div class="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-5">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-300">Images</h3>
          <label class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            Add images
            <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple on:change={handleImageInput} class="sr-only" />
          </label>
        </div>

        {#if imageAssets.length === 0}
          <p class="mt-3 text-xs text-slate-500">Add PNG, JPEG, WebP, or AVIF files to build a PDF. Press Delete to clear the list.</p>
        {:else}
          <div class="mt-4 space-y-4" tabindex="0" on:keydown={onImageListKeydown}>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {#each imageAssets as asset, i (asset.id)}
                <div
                  role="gridcell"
                  class="group relative overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/70"
                  draggable="true"
                  tabindex="0"
                  on:dragstart={(e) => onImageDragStart(i, e)}
                  on:dragover|preventDefault={onImageDragOver}
                  on:drop={() => onImageDrop(i)}
                >
                  <div class="absolute right-2 top-2 z-10 hidden gap-1 group-hover:flex">
                    <button
                      type="button"
                      class="rounded-full bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                      on:click|stopPropagation={() => moveImageStep(i, -1)}
                      disabled={i === 0}
                      title="Move left"
                    >◀</button>
                    <button
                      type="button"
                      class="rounded-full bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                      on:click|stopPropagation={() => moveImageStep(i, +1)}
                      disabled={i === imageAssets.length - 1}
                      title="Move right"
                    >▶</button>
                  </div>

                  <button type="button" on:click={() => removeImage(asset.id)} class="absolute right-2 bottom-2 z-10 rounded-full bg-slate-900/80 px-2 py-1 text-xs text-slate-300 transition hover:bg-red-500/30 hover:text-red-100">✕</button>

                  <img src={asset.objectUrl} alt={asset.name} class="h-32 w-full select-none object-cover" />
                  <div class="p-2 text-xs text-slate-400">
                    <p class="truncate text-slate-300">{asset.name}</p>
                    <p>{formatBytes(asset.size)} · {asset.width}×{asset.height}</p>
                  </div>
                </div>
              {/each}
            </div>
            <button type="button" on:click={clearImageList} class="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-red-400/60 hover:text-red-200">Clear images</button>
          </div>
        {/if}
      </div>
    </div>

    <!-- RIGHT -->
    <div class="flex flex-col gap-6">
      <div class="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-5">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-300">Split &amp; merge</h3>
        <div class="mt-3 grid gap-2 text-xs text-slate-400">
          <button type="button" on:click={mergePdfs} class="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40" disabled={pdfFiles.length < 2 || processing}>
            Merge all PDFs
          </button>
          <p>Reorder PDFs above with ▲▼ to control merge order. The first PDF supplies the base filename.</p>
        </div>
      </div>

      <div class="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-5">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-300">Image pages</h3>
        <div class="grid gap-3 text-xs text-slate-400">
          <label class="flex items-center gap-2 text-slate-300">
            Page size
            <select value={pageSizeOption} on:change={onPageSizeChange} class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-1 text-xs text-slate-100">
              {#each PAGE_SIZES as option}
                <option value={option.id}>{option.label}</option>
              {/each}
            </select>
          </label>
          {#if pageSizeOption === 'custom'}
            <div class="flex items-center gap-2 text-xs text-slate-400">
              <input type="number" min="10" max="500" bind:value={customPageWidthMm} on:change={persistSettings} class="w-20 rounded border border-slate-800/70 bg-slate-900/70 px-3 py-1 text-xs text-slate-100" placeholder="Width (mm)" />
              <span>×</span>
              <input type="number" min="10" max="500" bind:value={customPageHeightMm} on:change={persistSettings} class="w-20 rounded border border-slate-800/70 bg-slate-900/70 px-3 py-1 text-xs text-slate-100" placeholder="Height (mm)" />
              <span>mm</span>
            </div>
          {/if}

          <label class="flex items-center gap-2 text-slate-300">
            Fit
            <select value={fitOption} on:change={onFitChange} class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-1 text-xs text-slate-100">
              <option value="fit">Fit inside</option>
              <option value="fill">Fill page</option>
              <option value="stretch">Stretch</option>
            </select>
          </label>

          <label class="flex items-center gap-2 text-slate-300">
            Orientation
            <select value={orientationOption} on:change={onOrientationChange} class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-1 text-xs text-slate-100">
              <option value="auto">Auto</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>

          <button type="button" on:click={imagesToPdf} class="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40" disabled={imageAssets.length === 0 || processing}>
            Make PDF from images
          </button>
          <p class="text-[11px] text-slate-500">Images are embedded as pages locally in your browser. No uploads, no external requests.</p>
        </div>
      </div>

      {#if statusMessage || errorMessage}
        <div class="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-5">
          <div class="space-y-2 text-xs">
            {#if statusMessage}<p class="text-emerald-200" aria-live="polite">{statusMessage}</p>{/if}
            {#if errorMessage}<p class="text-red-200" aria-live="assertive">{errorMessage}</p>{/if}
            <button type="button" on:click={clearStatus} class="mt-1 rounded-full border border-slate-700 px-3 py-1 text-slate-300 transition hover:border-slate-500">Clear</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</ToolCard>
