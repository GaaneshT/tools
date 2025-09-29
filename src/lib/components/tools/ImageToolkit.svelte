<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import ToolCard from '$lib/components/ToolCard.svelte';
  import { downloadBlob } from '$lib/utils/download';
  import { deriveFileName } from '$lib/utils/file';
  import { formatBytes, formatImageDimensions } from '$lib/utils/format';
  import type Cropper from 'cropperjs';
  import 'cropperjs/dist/cropper.css';

  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
  const MAX_DIMENSION = 8192;
  const MAX_PREVIEW_HEIGHT = 420;
  const CUSTOM_PRESET_VALUE = 'custom';
  const SETTINGS_KEY = 'image-toolkit-settings-v1';

  type FormatOption = {
    label: string;
    value: string;
    extension: string;
    lossless: boolean;
  };
  type CropShape = 'square' | 'circle';

  type PresetOption = {
    value: string;
    label: string;
    width: number;
    height: number;
    maintainAspect?: boolean;
    shape?: CropShape;
  };

  const FORMAT_OPTIONS: FormatOption[] = [
    { label: 'PNG · lossless', value: 'image/png', extension: 'png', lossless: true },
    { label: 'JPEG · smaller files', value: 'image/jpeg', extension: 'jpg', lossless: false },
    { label: 'WEBP · modern', value: 'image/webp', extension: 'webp', lossless: false },
    { label: 'AVIF · experimental', value: 'image/avif', extension: 'avif', lossless: false }
  ];

  const PRESET_OPTIONS: PresetOption[] = [
    { value: 'passport_us',      label: 'Passport (US) · 600–1200×600–1200', width: 600, height: 600,  maintainAspect: true, shape: 'square' },
    { value: 'passport_sg',      label: 'Passport (SG) · 400×514',           width: 400, height: 514,  maintainAspect: true },
    { value: 'avatar_instagram', label: 'Instagram Profile · 320×320 (square, larger OK)', width: 320, height: 320, maintainAspect: true, shape: 'square' },
    { value: 'avatar_facebook',  label: 'Facebook Profile · ≥170×170 (square)',            width: 400, height: 400, maintainAspect: true, shape: 'square' },
    { value: 'avatar_linkedin',  label: 'LinkedIn Profile · ≥400×400 (square)',            width: 400, height: 400, maintainAspect: true, shape: 'square' },
    { value: 'avatar_twitter',   label: 'Twitter/X Profile · 400×400',       width: 400, height: 400, maintainAspect: true, shape: 'square' },
    { value: 'avatar_github',    label: 'GitHub Avatar · 500×500',            width: 500, height: 500, maintainAspect: true, shape: 'square' },
    { value: 'avatar_tiktok',    label: 'TikTok Profile · ≥200×200 (square)', width: 200, height: 200, maintainAspect: true, shape: 'square' }
  ];

  const digitsOnlyKeydown = (e: KeyboardEvent) => {
  const allowed = [
    'Backspace','Delete','Tab','Escape','Enter','ArrowLeft','ArrowRight','Home','End'
  ];
  if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
  if (/^[0-9]$/.test(e.key)) return;
  e.preventDefault(); // block e, +, -, ., etc.
};


  const PRESET_LOOKUP = new Map(PRESET_OPTIONS.map((preset) => [preset.value, preset] as const));

  type Smoothing = 'low' | 'medium' | 'high';
  type Mode = 'resize' | 'crop';

  let file: File | null = null;
  let objectUrl: string | null = null;
  let resultUrl: string | null = null;
  let resultSize = 0;
  let lastBlob: Blob | null = null;
  let lastDownloadName: string | null = null;

  let processing = false;
  let statusMessage = '';
  let errorMessage = '';
  let cropper: Cropper | null = null;
  let CropperCtor: typeof Cropper | null = null;
  let imageRef: HTMLImageElement | null = null;

  let originalWidth = 0;
  let originalHeight = 0;
  let aspectRatio = 1;
  let selectedFormatValue = FORMAT_OPTIONS[0].value;
  let selectedFormat: FormatOption = FORMAT_OPTIONS[0];

  let quality = 0.85;
  let maintainAspect = true;      
  let keepAspectInResize = true;   
  let lastChanged: 'width' | 'height' | null = null;

  let targetWidth: number | null = null;
  let targetHeight: number | null = null;
  let smoothing: Smoothing = 'high';
  let addPrivateSuffix = true; 
  let fileInput: HTMLInputElement | null = null;
  let mode: Mode = 'crop';
  let previousMode: Mode = mode;
  let cropShape: CropShape = 'square';
  let previewTargetWidth = 1;
  let previewTargetHeight = 1;
  let previewRatio = 1;
  let previewAspectCSS = '1 / 1';
  let previewBoxWidth = MAX_PREVIEW_HEIGHT;
  let previewBoxWidthPx = `${MAX_PREVIEW_HEIGHT}px`;
  let selectedPresetValue: string = CUSTOM_PRESET_VALUE;

  const MODE_OPTIONS: { value: Mode; label: string; helper: string }[] = [
    {
      value: 'resize',
      label: 'Resize only',
      helper: 'Resample the whole image to the target size.'
    },
    {
      value: 'crop',
      label: 'Crop + resize',
      helper: 'Crop first, then scale the selection to the target size.'
    }
  ];

  const getFileTypeLabel = (f: File | null) => {
    if (!f) return '—';
    const map: Record<string, string> = {
      'image/jpeg': 'JPG',
      'image/png': 'PNG',
      'image/webp': 'WEBP',
      'image/avif': 'AVIF'
    };
    if (map[f.type]) return map[f.type];
    const nameExt = f.name.split('.').pop()?.toUpperCase();
    return nameExt || 'IMAGE';
  };

  const cleanupObjectUrl = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const cleanupResultUrl = () => {
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = null;
      resultSize = 0;
      lastBlob = null;
      lastDownloadName = null;
    }
  };

  const destroyCropper = () => {
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
  };

  const initialiseCropper = () => {
    if (!CropperCtor || !imageRef) return;
    destroyCropper();
    cropper = new CropperCtor(imageRef, {
      viewMode: 1,
      dragMode: 'move',
      responsive: true,
      background: false,
      checkOrientation: true,
      autoCropArea: 1,
      aspectRatio: maintainAspect ? aspectRatio || 1 : NaN,
      movable: true,
      zoomable: true,
      minCropBoxWidth: 32,
      minCropBoxHeight: 32,
      guides: false
    });
  };

  const waitForImage = async (img: HTMLImageElement) => {
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) return;
    await new Promise<void>((resolve) => {
      const handleLoad = () => { cleanup(); resolve(); };
      const handleError = () => { cleanup(); resolve(); };
      const cleanup = () => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleError);
      };
      img.addEventListener('load', handleLoad, { once: true });
      img.addEventListener('error', handleError, { once: true });
    });
  };

  const initialiseCropperWhenReady = async () => {
    if (mode !== 'crop' || cropper || !CropperCtor || !objectUrl) return;
    await tick();
    const img = imageRef;
    if (!img) return;
    await waitForImage(img);
    if (mode !== 'crop' || cropper || img !== imageRef) return;
    initialiseCropper();
  };

  onMount(async () => {
    const module = await import('cropperjs');
    CropperCtor = module.default;


    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.selectedFormatValue) selectedFormatValue = s.selectedFormatValue;
        if (typeof s.quality === 'number') quality = s.quality;
        if (s.selectedPresetValue) selectedPresetValue = s.selectedPresetValue;
        if (s.mode === 'resize' || s.mode === 'crop') mode = s.mode;
        if (s.smoothing) smoothing = s.smoothing;
        if (typeof s.keepAspectInResize === 'boolean') keepAspectInResize = s.keepAspectInResize; 
      }
    } catch { /* ignore */ }

    // keyboard shortcuts
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'c' || e.key === 'C') mode = mode === 'crop' ? 'resize' : 'crop';
      if (e.key === 'r' || e.key === 'R') resetSizing();
      if ((e.key === 'f' || e.key === 'F') && mode === 'crop') useFullImage();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  onDestroy(() => {
    destroyCropper();
    cleanupObjectUrl();
    cleanupResultUrl();
  });

  $: {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ selectedFormatValue, quality, selectedPresetValue, mode, smoothing, keepAspectInResize })
      );
    } catch { /* ignore */ }
  }

  const resetState = () => {
    destroyCropper();
    cleanupObjectUrl();
    cleanupResultUrl();
    file = null;
    statusMessage = '';
    errorMessage = '';
    originalWidth = 0;
    originalHeight = 0;
    aspectRatio = 1;
    targetWidth = null;
    targetHeight = null;
    maintainAspect = true;
    keepAspectInResize = true;
    lastChanged = null;
    cropShape = 'square';
    selectedPresetValue = CUSTOM_PRESET_VALUE;
  };

  const measureImage = (url: string): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Unable to read image dimensions'));
      img.src = url;
    });

  const handleFileSelection = async (candidate: File | undefined | null) => {
    if (!candidate) return;

    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      resetState();
      errorMessage = `File is ${formatBytes(candidate.size)}. Please keep images under ${formatBytes(MAX_FILE_SIZE_BYTES)}.`;
      return;
    }

    resetState();
    file = candidate;
    addPrivateSuffix = true;
    selectedFormatValue = FORMAT_OPTIONS[0].value;
    quality = 0.85;
    smoothing = 'high';
    statusMessage = 'Image loaded. Adjust settings as needed.';
    selectedPresetValue = CUSTOM_PRESET_VALUE;

    objectUrl = URL.createObjectURL(candidate);

    try {
      const { width, height } = await measureImage(objectUrl);
      originalWidth = width;
      originalHeight = height;
      aspectRatio = width && height ? width / height : 1;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        targetWidth = Math.floor(width * scale);
        targetHeight = Math.floor(height * scale);
        statusMessage = `Image scaled down for safety · output capped at ${MAX_DIMENSION}px`;
      } else {
        targetWidth = width;
        targetHeight = height;
      }

      if (mode === 'resize' && keepAspectInResize) alignResizeDimensionsToAspect();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to read image dimensions';
      cleanupObjectUrl();
      return;
    }
  };

  const onFileInputChange = async (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    await handleFileSelection(target.files?.[0]);
    target.value = '';
  };

  const onDropZone = async (event: DragEvent) => {
    event.preventDefault();
    await handleFileSelection(event.dataTransfer?.files?.[0]);
  };
  const onDragOver = (event: DragEvent) => event.preventDefault();
  const onDropZoneKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  };

  // ---- aspect helpers ----
  const alignTargetDimensionsToAspect = (changed?: 'width' | 'height') => {
    if (mode !== 'crop' || !maintainAspect) return;
    const width = targetWidth ?? undefined;
    const height = targetHeight ?? undefined;
    if (width && height) {
      const nextRatio = width / height;
      if (Number.isFinite(nextRatio) && nextRatio > 0) aspectRatio = nextRatio;
    } else if (changed === 'width' && width && aspectRatio) {
      targetHeight = Math.max(1, Math.round(width / aspectRatio));
    } else if (changed === 'height' && height && aspectRatio) {
      targetWidth = Math.max(1, Math.round(height * aspectRatio));
    }
    if (cropper) cropper.setAspectRatio(aspectRatio || 1);
  };

  const alignResizeDimensionsToAspect = (changed?: 'width' | 'height') => {
    if (mode !== 'resize' || !keepAspectInResize) return;
    const srcW = originalWidth || 1;
    const srcH = originalHeight || 1;
    const srcRatio = srcW / srcH;

    const width = targetWidth ?? undefined;
    const height = targetHeight ?? undefined;

    if (width && !height) {
      targetHeight = Math.max(1, Math.round(width / srcRatio));
    } else if (!width && height) {
      targetWidth = Math.max(1, Math.round(height * srcRatio));
    } else if (width && height) {

      if (changed === 'height') {
        targetWidth = Math.max(1, Math.round((height) * srcRatio));
      } else {

        targetHeight = Math.max(1, Math.round((width) / srcRatio));
      }
    }
    // clamp to MAX_DIMENSION
    if (targetWidth && targetWidth > MAX_DIMENSION) {
      targetWidth = MAX_DIMENSION;
      targetHeight = Math.max(1, Math.round(MAX_DIMENSION / srcRatio));
    }
    if (targetHeight && targetHeight > MAX_DIMENSION) {
      targetHeight = MAX_DIMENSION;
      targetWidth = Math.max(1, Math.round(MAX_DIMENSION * srcRatio));
    }
  };

  const applyCropShape = (shape: CropShape) => {
    cropShape = shape;
    if (shape === 'circle') {
      maintainAspect = true;
      const widthCandidate = targetWidth ?? originalWidth ?? 1;
      const heightCandidate = targetHeight ?? originalHeight ?? 1;
      const size = Math.max(1, Math.round(Math.min(widthCandidate, heightCandidate)));
      targetWidth = size;
      targetHeight = size;
      aspectRatio = 1;
    }
    if (mode === 'crop') {
      if (maintainAspect) alignTargetDimensionsToAspect();
      if (cropper) {
        cropper.setAspectRatio(maintainAspect ? aspectRatio || 1 : NaN);
        cropper.reset();
      }
    }
  };


  const applyPresetDimensions = (preset: PresetOption) => {
    selectedPresetValue = preset.value;

    // clamp proportionally to MAX_DIMENSION
    let w = Math.max(1, Math.round(preset.width));
    let h = Math.max(1, Math.round(preset.height));
    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      const scale = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
      w = Math.max(1, Math.floor(w * scale));
      h = Math.max(1, Math.floor(h * scale));
    }
    targetWidth = w;
    targetHeight = h;

    const presetRatio = w / h;
    if (Number.isFinite(presetRatio) && presetRatio > 0) aspectRatio = presetRatio;

    if (preset.value.startsWith('passport_')) {
      selectedFormatValue = 'image/jpeg';
      mode = 'crop';
      maintainAspect = true;
      cropShape = 'square';
    } else {
      maintainAspect = preset.maintainAspect ?? true;
      if (!preset.shape && cropShape === 'circle') applyCropShape('square');
    }

    if (preset.shape) applyCropShape(preset.shape);


    if (mode === 'resize' && keepAspectInResize) {
      alignResizeDimensionsToAspect();
    }

    if (mode === 'crop') {
      if (maintainAspect) alignTargetDimensionsToAspect();
      if (cropper) {
        cropper.setAspectRatio(maintainAspect ? aspectRatio || 1 : NaN);
        cropper.reset();
      }
    }
  };

  const onPresetSelect = (event: Event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const value = select.value;
    if (value === CUSTOM_PRESET_VALUE) {
      selectedPresetValue = CUSTOM_PRESET_VALUE;
      return;
    }
    const preset = PRESET_LOOKUP.get(value);
    if (!preset) {
      selectedPresetValue = CUSTOM_PRESET_VALUE;
      return;
    }
    applyPresetDimensions(preset);
  };

  const handleTargetWidthInput = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const value = Math.round(input.valueAsNumber);
    const nextValue = Number.isFinite(value) && value > 0 ? Math.min(value, MAX_DIMENSION) : null;
    targetWidth = nextValue;
    selectedPresetValue = CUSTOM_PRESET_VALUE;
    lastChanged = 'width';
    if (mode === 'crop') alignTargetDimensionsToAspect('width');
    if (mode === 'resize' && keepAspectInResize) alignResizeDimensionsToAspect('width');
  };

  const handleTargetHeightInput = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const value = Math.round(input.valueAsNumber);
    const nextValue = Number.isFinite(value) && value > 0 ? Math.min(value, MAX_DIMENSION) : null;
    targetHeight = nextValue;
    selectedPresetValue = CUSTOM_PRESET_VALUE;
    lastChanged = 'height';
    if (mode === 'crop') alignTargetDimensionsToAspect('height');
    if (mode === 'resize' && keepAspectInResize) alignResizeDimensionsToAspect('height');
  };

  const resetSizing = () => {
    targetWidth = originalWidth;
    targetHeight = originalHeight;
    maintainAspect = true;
    keepAspectInResize = true;
    selectedPresetValue = CUSTOM_PRESET_VALUE;
    lastChanged = null;
    if (originalWidth && originalHeight) aspectRatio = originalWidth / originalHeight;
    if (cropper && aspectRatio) {
      cropper.setAspectRatio(aspectRatio);
      cropper.reset();
    }
    if (mode === 'crop') alignTargetDimensionsToAspect();
    if (mode === 'resize' && keepAspectInResize) alignResizeDimensionsToAspect();
  };

  const onMaintainAspectToggle = (event: Event) => {
    const nextValue = (event.currentTarget as HTMLInputElement).checked;
    maintainAspect = nextValue;
    if (mode !== 'crop' || !maintainAspect) return;
    const width = targetWidth ?? originalWidth;
    const height = targetHeight ?? originalHeight;
    if (width && height) aspectRatio = width / height;
    alignTargetDimensionsToAspect();
  };

  const onKeepResizeAspectToggle = (event: Event) => {
    keepAspectInResize = (event.currentTarget as HTMLInputElement).checked;
    if (mode === 'resize' && keepAspectInResize) {
      alignResizeDimensionsToAspect(lastChanged ?? 'width');
    }
  };

  const useFullImage = () => {
    if (mode !== 'crop') return;
    if (originalWidth === 0 || originalHeight === 0) return;
    if (cropper) {
      cropper.setAspectRatio(NaN);
      cropper.reset();
      cropper.setData({
        left: 0,
        top: 0,
        width: Math.min(originalWidth, MAX_DIMENSION),
        height: Math.min(originalHeight, MAX_DIMENSION)
      });
    }
    const exceeds = originalWidth > MAX_DIMENSION || originalHeight > MAX_DIMENSION;
    if (exceeds) {
      const scale = Math.min(MAX_DIMENSION / originalWidth, MAX_DIMENSION / originalHeight);
      targetWidth = Math.floor(originalWidth * scale);
      targetHeight = Math.floor(originalHeight * scale);
    } else {
      targetWidth = originalWidth;
      targetHeight = originalHeight;
    }
    const originalRatio = originalWidth / originalHeight;
    if (Number.isFinite(originalRatio) && originalRatio > 0) aspectRatio = originalRatio;
    if (maintainAspect) alignTargetDimensionsToAspect();
    selectedPresetValue = CUSTOM_PRESET_VALUE;
  };


  const loadOrientedImageElement = async (): Promise<HTMLImageElement> => {
    if (imageRef && imageRef.complete) return imageRef;
    let fallbackObjectUrl: string | null = null;
    const src = objectUrl ?? (fallbackObjectUrl = URL.createObjectURL(file!));
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.decoding = 'async';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image for resizing'));
      el.src = src;
    });
    if (fallbackObjectUrl) URL.revokeObjectURL(fallbackObjectUrl);
    return image;
  };

  const canvasFromOriginal = async ({ width, height }: { width: number; height: number }) => {
    if (!file) throw new Error('No image loaded');
    const source = await loadOrientedImageElement();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create drawing context');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = smoothing;
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
  };

  const canvasViaCropperFullFrame = async ({ width, height }: { width: number; height: number }) => {
    if (!CropperCtor || !imageRef) return canvasFromOriginal({ width, height });
    let tempCreated = false;

    if (!cropper) {

      cropper = new CropperCtor(imageRef, {
        viewMode: 1,
        background: false,
        guides: false,
        checkOrientation: true,
        autoCropArea: 1,
        dragMode: 'move',
        movable: false,
        zoomable: false,
        aspectRatio: NaN
      });
      tempCreated = true;
    }
    // Cover the full image
    cropper.setAspectRatio(NaN);
    cropper.reset();
    cropper.setData({ left: 0, top: 0, width: originalWidth, height: originalHeight });

    const canvas = cropper.getCroppedCanvas({
      width,
      height,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: smoothing
    });

    if (!canvas) throw new Error('Unable to prepare canvas in this browser.');

    if (tempCreated) {
      cropper.destroy();
      cropper = null;
    }
    return canvas;
  };

  const maskCanvasToCircle = (input: HTMLCanvasElement, fillBackground: boolean): HTMLCanvasElement => {
    const circleCanvas = document.createElement('canvas');
    circleCanvas.width = input.width;
    circleCanvas.height = input.height;
    const ctx = circleCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to apply circular mask');
    ctx.clearRect(0, 0, circleCanvas.width, circleCanvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(circleCanvas.width / 2, circleCanvas.height / 2, circleCanvas.width / 2, circleCanvas.height / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(input, 0, 0);
    ctx.restore();
    if (fillBackground) {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, circleCanvas.width, circleCanvas.height);
    }
    return circleCanvas;
  };

  const canvasToBlob = (canvas: HTMLCanvasElement, type: string, qualityOption?: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Browser could not encode the requested format.'));
            return;
          }
          resolve(blob);
        },
        type,
        qualityOption
      );
    });

const stretchCanvas = (src: HTMLCanvasElement, width: number, height: number) => {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Failed to create drawing context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = smoothing;
  ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, width, height);
  return out;
};



//if downloadNow=false we just preview
const generateResult = async (downloadNow: boolean) => {
  if (!file) {
    errorMessage = 'Select an image first.';
    return;
  }

  errorMessage = '';
  statusMessage = 'Processing…';
  processing = true;
  if (downloadNow) cleanupResultUrl();

  if (mode === 'resize' && keepAspectInResize) {
    alignResizeDimensionsToAspect(lastChanged ?? 'width');
  }

  const width = Math.max(1, targetWidth ?? originalWidth);
  const height = Math.max(1, targetHeight ?? originalHeight);

  try {
    let canvas: HTMLCanvasElement;

    if (mode === 'crop') {
      if (!cropper) throw new Error('Cropper is still initialising. Please try again in a moment.');
      if (maintainAspect && targetWidth && targetHeight) {
        const ratio = targetWidth / targetHeight;
        if (Number.isFinite(ratio) && ratio > 0) {
          aspectRatio = ratio;
          cropper.setAspectRatio(ratio);
        }
      }
      canvas = cropper.getCroppedCanvas({
        width,
        height,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: smoothing
      });
      if (!canvas) throw new Error('Unable to crop image in this browser.');
    } else {
      // RESIZE ONLY
      if (keepAspectInResize) {
        canvas = await canvasViaCropperFullFrame({ width, height });
      } else {

        const base = await canvasViaCropperFullFrame({
          width: Math.min(originalWidth, MAX_DIMENSION),
          height: Math.min(originalHeight, MAX_DIMENSION)
        });

        canvas = stretchCanvas(base, width, height);
      }
    }

    if (mode === 'crop' && cropShape === 'circle') {
      const fillBackground = selectedFormat.value === 'image/jpeg';
      canvas = maskCanvasToCircle(canvas, fillBackground);
    }

    const qualityOption = selectedFormat.lossless ? undefined : quality;
    const blob = await canvasToBlob(canvas, selectedFormat.value, qualityOption);

    lastBlob = blob;
    resultSize = blob.size;
    cleanupResultUrl();
    resultUrl = URL.createObjectURL(blob);
    statusMessage = `Ready · ${formatBytes(blob.size)} • ${formatImageDimensions(canvas.width, canvas.height)}`;

    lastDownloadName = deriveFileName({
      originalName: file.name,
      targetExtension: selectedFormat.extension,
      suffix: addPrivateSuffix ? 'private' : undefined
    });

    if (downloadNow) downloadBlob(blob, lastDownloadName);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected processing error';
    if (selectedFormat.value === 'image/avif' && message.includes('encode')) {
      errorMessage = 'This browser cannot export AVIF yet. Try Chrome 120+ or pick WEBP/JPEG.';
    } else {
      errorMessage = message;
    }
    statusMessage = '';
  } finally {
    processing = false;
  }
};


  const downloadExisting = () => {
    if (lastBlob && lastDownloadName) {
      downloadBlob(lastBlob, lastDownloadName);
    } else {
      generateResult(true);
    }
  };


  $: selectedFormat =
    FORMAT_OPTIONS.find((option) => option.value === selectedFormatValue) ?? FORMAT_OPTIONS[0];

  $: {
    if (mode !== previousMode) {
      if (mode !== 'crop') {
        destroyCropper();
      } else {
        if (targetWidth && targetHeight) {
          const ratio = targetWidth / targetHeight;
          if (Number.isFinite(ratio) && ratio > 0) aspectRatio = ratio;
        } else if (originalWidth && originalHeight) {
          aspectRatio = originalWidth / originalHeight;
        }
        alignTargetDimensionsToAspect();
      }
      previousMode = mode;
    }
  }

  $: {
    const widthCandidate = targetWidth ?? originalWidth;
    const heightCandidate = targetHeight ?? originalHeight;
    previewTargetWidth = Math.max(1, widthCandidate ?? 1);
    previewTargetHeight = Math.max(1, heightCandidate ?? 1);
    previewRatio = previewTargetWidth / previewTargetHeight;
    if (!Number.isFinite(previewRatio) || previewRatio <= 0) previewRatio = 1;
    previewAspectCSS = `${previewTargetWidth} / ${previewTargetHeight}`;
    previewBoxWidth = previewRatio * MAX_PREVIEW_HEIGHT;
    if (!Number.isFinite(previewBoxWidth) || previewBoxWidth <= 0) previewBoxWidth = MAX_PREVIEW_HEIGHT;
    previewBoxWidthPx = `${Math.round(previewBoxWidth * 100) / 100}px`;
  }

  $: { if (cropper) cropper.setAspectRatio(mode === 'crop' && maintainAspect ? aspectRatio || 1 : NaN); }
  $: if (mode === 'crop' && !cropper && imageRef && CropperCtor && objectUrl) { initialiseCropperWhenReady(); }
</script>

<ToolCard
  title="Image Toolkit"
  description="Convert between formats, resize, crop, compress, and scrub EXIF metadata locally."
  badge="MVP"
  id="image-toolkit"
>
  <div
    class="flex flex-col gap-4 rounded-2xl border border-dashed border-emerald-500/40 bg-slate-900/60 p-6"
    on:drop={onDropZone}
    on:dragover={onDragOver}
    role="presentation"
  >
    <div class="flex flex-col gap-2 text-sm text-slate-300">
      <input
        bind:this={fileInput}
        id="image-input"
        type="file"
        accept="image/*"
        on:change={onFileInputChange}
        class="sr-only"
      />
      <button
        type="button"
        on:click={() => fileInput?.click()}
        on:keydown={onDropZoneKeyDown}
        class="group grid cursor-pointer place-items-center gap-3 rounded-xl border-2 border-dashed border-emerald-500/40 bg-slate-950/40 px-6 py-10 text-center text-slate-300 transition hover:border-emerald-400/70 hover:bg-slate-900/70 focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:outline-none"
      >
        <div class="flex flex-col items-center gap-2">
          <span class="text-base font-semibold text-slate-100">
            Drop an image or click to browse
          </span>
          <span class="text-xs text-slate-400">PNG, JPEG, WEBP, AVIF · up to 50 MB</span>
          <span
            class="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-200 uppercase"
          >
            Select image
          </span>
        </div>
      </button>
      <p class="text-xs text-slate-500">Files stay in your browser and never leave your device.</p>
    </div>

    {#if file && objectUrl}
      <!-- file info strip -->
      <div class="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span class="rounded-full border border-slate-700 px-3 py-1 text-slate-200">
          {file.name}
        </span>
        <span>{formatBytes(file.size)}</span>
        <span>{getFileTypeLabel(file)}</span>
        <span>{formatImageDimensions(originalWidth, originalHeight)}</span>
      </div>

      <div class="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <!-- preview column -->
        <div class="flex flex-col gap-3">
          <div class="rounded-xl border border-slate-800/70 bg-slate-900/70 p-3">
            {#if mode === 'crop'}
              <div
                class="preview-frame preview-frame--crop"
                class:crop-shape-circle={cropShape === 'circle'}
                class:crop-shape-square={cropShape === 'square'}
                style={`max-height: ${MAX_PREVIEW_HEIGHT}px;`}
              >
                {#if CropperCtor}
                  <img
                    bind:this={imageRef}
                    src={objectUrl}
                    alt="Preview of uploaded file"
                    class="preview-image rounded-lg"
                  />
                {:else}
                  <div class="preview-placeholder">Loading cropper…</div>
                {/if}
              </div>
            {:else}
              <div
                class="preview-frame preview-frame--resize"
                style={`max-height: ${MAX_PREVIEW_HEIGHT}px; width: min(100%, ${previewBoxWidthPx});`}
              >
                <div
                  class="preview-frame__box"
                  style={`aspect-ratio: ${previewAspectCSS}; max-height: ${MAX_PREVIEW_HEIGHT}px;`}
                >
                  <img
                    bind:this={imageRef}
                    src={objectUrl}
                    alt="Preview of uploaded file"
                    class="preview-image preview-image--resize rounded-lg"
                  />
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- controls column -->
        <div class="flex flex-col gap-4">
          <div class="rounded-xl border border-slate-800/70 bg-slate-900/60 p-4">
            <h3 class="mb-3 text-sm font-semibold tracking-wide text-slate-300 uppercase">Mode</h3>
            <div class="flex flex-col gap-2 text-sm text-slate-300">
              {#each MODE_OPTIONS as option}
                <label class="flex flex-col gap-1 rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 hover:border-emerald-400/50">
                  <span class="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      bind:group={mode}
                      value={option.value}
                      class="size-4 border border-slate-700 text-emerald-400 focus:ring-emerald-500"
                    />
                    <span class="font-medium text-slate-100">{option.label}</span>
                  </span>
                  <span class="text-xs text-slate-400">
                    {option.value === 'resize'
                      ? (keepAspectInResize
                          ? 'Resample image; keeps original proportions.'
                          : 'Resample image; will stretch to match target width & height.')
                      : option.helper}
                  </span>
                </label>
              {/each}
            </div>
          </div>

          <div class="rounded-xl border border-slate-800/70 bg-slate-900/60 p-4">
            <h3 class="mb-3 text-sm font-semibold tracking-wide text-slate-300 uppercase">
              Output format
            </h3>
            <label class="flex flex-col gap-2 text-sm">
              <span class="text-xs tracking-wide text-slate-500 uppercase">Format</span>
              <select
                bind:value={selectedFormatValue}
                class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm"
              >
                {#each FORMAT_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            {#if !selectedFormat.lossless}
              <label class="mt-3 flex flex-col gap-2 text-sm">
                <span class="flex items-center justify-between text-xs tracking-wide text-slate-500 uppercase">
                  Quality
                  <span class="text-slate-400">{Math.round(quality * 100)}%</span>
                </span>
                <input
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.05"
                  bind:value={quality}
                  class="accent-emerald-400"
                />
              </label>
            {/if}
          </div>


          <div class="rounded-xl border border-slate-800/70 bg-slate-900/60 p-4">
            <h3 class="mb-3 text-sm font-semibold tracking-wide text-slate-300 uppercase">
              {mode === 'crop' ? 'Crop & size' : 'Target size'}
            </h3>

            <label class="mb-2 flex flex-col gap-1 text-xs tracking-wide text-slate-500 uppercase">
              Preset
              <select
                bind:value={selectedPresetValue}
                on:change={onPresetSelect}
                class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
              >
                <option value={CUSTOM_PRESET_VALUE}>Custom size</option>
                {#each PRESET_OPTIONS as preset}
                  <option value={preset.value}>{preset.label}</option>
                {/each}
              </select>
            </label>

            {#if selectedPresetValue.startsWith('passport_')}
              <p class="mb-2 text-[11px] leading-snug text-amber-200/90">
                Passport tips: plain light background, head centered &amp; forward, eyes open, no
                filters/hats, good lighting. Follow your country’s size rules.
              </p>
            {/if}

            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1 text-xs tracking-wide text-slate-500 uppercase">
                Width (px)
				<input
				type="number"
				inputmode="numeric"       
				pattern="[0-9]*"          
				step="1"
				min="16"
				value={targetWidth ?? ''}
				on:keydown={digitsOnlyKeydown}
				on:wheel|preventDefault   
				on:input={handleTargetWidthInput}
				class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
				/>
              </label>
              <label class="flex flex-col gap-1 text-xs tracking-wide text-slate-500 uppercase">
                Height (px)
				<input
				type="number"
				inputmode="numeric"       
				pattern="[0-9]*"          
				step="1"
				min="16"
				value={targetHeight ?? ''}
				on:keydown={digitsOnlyKeydown}
				on:wheel|preventDefault   
				on:input={handleTargetHeightInput}
				class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
				/>
              </label>
            </div>

            {#if mode === 'crop'}
              <label class="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  bind:checked={maintainAspect}
                  on:change={onMaintainAspectToggle}
                  class="size-4 rounded border border-slate-700 bg-slate-900/60 text-emerald-400 focus:ring-emerald-500"
                />
                Lock aspect ratio
              </label>

              <div class="mt-3 flex flex-col gap-2">
                <span class="text-xs tracking-wide text-slate-500 uppercase">Crop shape</span>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    on:click={() => applyCropShape('square')}
                    class={`shape-toggle ${cropShape === 'square' ? 'shape-toggle--active' : ''}`}
                  >
                    Square
                  </button>
                  <button
                    type="button"
                    on:click={() => applyCropShape('circle')}
                    class={`shape-toggle ${cropShape === 'circle' ? 'shape-toggle--active' : ''}`}
                  >
                    Circle
                  </button>
                </div>
              </div>
            {:else}
              <label class="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  bind:checked={keepAspectInResize}
                  on:change={onKeepResizeAspectToggle}
                  class="size-4 rounded border border-slate-700 bg-slate-900/60 text-emerald-400 focus:ring-emerald-500"
                />
                Keep aspect ratio (no stretching)
              </label>
            {/if}

            <label class="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                bind:checked={addPrivateSuffix}
                class="size-4 rounded border border-slate-700 bg-slate-900/60 text-emerald-400 focus:ring-emerald-500"
              />
              Add “.private” suffix to filename
            </label>
            <p class="mt-1 text-[11px] text-slate-500">
              EXIF is removed on export for privacy.
            </p>

            <label class="mt-2 flex flex-col gap-1 text-xs tracking-wide text-slate-500 uppercase">
              Resampling quality
              <span class="text-[11px] text-slate-500">
                Affects scaling smoothness, not compression size.
              </span>
              <select
                bind:value={smoothing}
                class="rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm"
              >
                <option value="low">Fast</option>
                <option value="medium">Balanced</option>
                <option value="high">Best</option>
              </select>
            </label>

            <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <button
                type="button"
                on:click={resetSizing}
                class="rounded-full border border-slate-700 px-3 py-1 font-medium text-slate-200 transition hover:border-emerald-400/60 hover:text-emerald-200"
              >
                Reset
              </button>
              {#if mode === 'crop'}
                <button
                  type="button"
                  on:click={useFullImage}
                  class="rounded-full border border-emerald-400/60 px-3 py-1 font-medium text-emerald-200 transition hover:bg-emerald-500/10"
                >
                  Use full image
                </button>
              {/if}
              <span>Original: {formatImageDimensions(originalWidth, originalHeight)}</span>
            </div>
          </div>

          <div class="rounded-xl border border-slate-800/70 bg-slate-900/60 p-4">
            <h3 class="mb-3 text-sm font-semibold tracking-wide text-slate-300 uppercase">
              Download
            </h3>
            <p class="mb-3 text-xs text-slate-400">
              We re-encode the image locally. Metadata is removed on export.
            </p>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                on:click={() => generateResult(false)}
                disabled={processing}
                class="flex items-center justify-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {#if processing}
                  <span
                    class="size-3 animate-spin rounded-full border-2 border-slate-300/80 border-r-transparent"
                    aria-hidden="true"
                  ></span>
                  Preview…
                {:else}
                  Preview
                {/if}
              </button>

              <button
                type="button"
                on:click={downloadExisting}
                disabled={processing}
                class="flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {#if processing}
                  <span
                    class="size-3 animate-spin rounded-full border-2 border-emerald-950 border-r-transparent"
                    aria-hidden="true"
                  ></span>
                  Downloading…
                {:else}
                  Download
                {/if}
              </button>
            </div>

            {#if statusMessage}
              <p class="mt-3 text-xs text-emerald-200/90" aria-live="polite">{statusMessage}</p>
            {/if}

            {#if resultUrl}
              <a
                href={resultUrl}
                target="_blank"
                rel="noreferrer noopener"
                class="mt-2 inline-flex items-center gap-2 text-xs text-emerald-300 hover:text-emerald-200"
              >
                Open preview ({formatBytes(resultSize)})
              </a>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    {#if errorMessage}
      <p class="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-100">
        {errorMessage}
      </p>
    {/if}
  </div>
</ToolCard>

<style>
  /* --- layout for the preview area --- */
  .preview-frame {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 100%;
    overflow: hidden; /* clip any protruding cropper handles/canvas */
  }
  .preview-frame--resize { justify-items: center; }
  .preview-frame__box {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 100%;
    max-height: inherit;
  }
  .preview-image {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    user-select: none;
  }
  .preview-image--resize { width: 100%; height: 100%; object-fit: fill; }
  .preview-placeholder {
    display: grid;
    place-items: center;
    min-height: 320px;
    width: 100%;
    color: rgba(148, 163, 184, 1);
  }

  /* --- cropper look & feel --- */
  :global(.cropper-container) { background-color: rgba(2, 6, 23, 0.9); }
  :global(.cropper-view-box) {
    border: 1px solid rgba(16, 185, 129, 0.8);
    border-radius: 0.75rem;
  }
  :global(.cropper-face) { background-color: rgba(16, 185, 129, 0.08); }
  :global(.cropper-line), :global(.cropper-point) {
    background-color: rgba(16, 185, 129, 0.9);
    border-radius: 0.25rem;
  }
  :global(.cropper-point.point-se),
  :global(.cropper-point.point-sw),
  :global(.cropper-point.point-nw),
  :global(.cropper-point.point-ne) {
    width: 12px;
    height: 12px;
  }
  :global(.cropper-line)::before {
    content: '';
    position: absolute;
    inset: -6px;
  }

  /* --- crop shapes --- */
  .preview-frame--crop.crop-shape-circle { border-radius: 9999px; }
  .preview-frame--crop.crop-shape-circle .preview-image { border-radius: 9999px; }
  .preview-frame--crop.crop-shape-circle :global(.cropper-crop-box),
  .preview-frame--crop.crop-shape-circle :global(.cropper-view-box),
  .preview-frame--crop.crop-shape-circle :global(.cropper-face) {
    border-radius: 9999px !important;
  }

  /* --- toggle buttons --- */
  .shape-toggle {
    border-radius: 9999px;
    border: 1px solid rgba(51, 65, 85, 0.8);
    padding: 0.35rem 0.85rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background-color: rgba(15, 23, 42, 0.6);
    color: rgba(203, 213, 225, 1);
    transition: border-color 150ms ease, color 150ms ease, background-color 150ms ease;
  }
  .shape-toggle:hover,
  .shape-toggle:focus-visible {
    border-color: rgba(16, 185, 129, 0.6);
    color: rgba(167, 243, 208, 1);
    outline: none;
  }
  .shape-toggle--active {
    border-color: rgba(16, 185, 129, 0.8);
    background-color: rgba(16, 185, 129, 0.12);
    color: rgba(167, 243, 208, 1);
  }

  /* --- mobile overflow fixes --- */
  :root, body { overflow-x: hidden; }

  /* make the <img> strictly fit the container in crop mode */
  .preview-frame--crop .preview-image {
    width: 100% !important;
    height: auto !important;
    max-width: 100% !important;
  }

  /* clamp Cropper’s internal boxes to the container width */
  .preview-frame--crop :global(.cropper-container),
  .preview-frame--crop :global(.cropper-wrap-box),
  .preview-frame--crop :global(.cropper-canvas),
  .preview-frame--crop :global(.cropper-drag-box),
  .preview-frame--crop :global(.cropper-crop-box),
  .preview-frame--crop :global(.cropper-modal) {
    width: 100% !important;
    max-width: 100% !important;
    left: 0 !important;
  }

  /* keep the cropper centered inside the frame */
  .preview-frame--crop :global(.cropper-container) { margin: 0 auto; }
</style>
