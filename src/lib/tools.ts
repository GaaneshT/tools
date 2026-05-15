// Shared catalog. Powers the home grid, the ⌘K palette, and any tool's
// "related tools" surface. Single source of truth — never duplicate.

export type ToolStatus = 'ready' | 'beta' | 'planned';

export type Tool = {
  id: string;
  name: string;
  path: string;          // route, e.g. '/hash'
  blurb: string;
  category: 'crypto' | 'web' | 'dev' | 'finance' | 'files';
  status: ToolStatus;
  icon: string;          // Icon name; see Icon.svelte
  accent?: 'cyan' | 'violet' | 'green' | 'amber' | 'rose' | 'teal';
};

export const tools: Tool[] = [
  // ── Crypto & encoding ─────────────────────────────────────────────────
  {
    id: 'hash',
    name: 'Hashes',
    path: '/hash',
    blurb: 'MD5, SHA-1, SHA-256, SHA-512, SHA-3-256 for text or files. Includes size + Shannon entropy.',
    category: 'crypto',
    status: 'ready',
    icon: 'hash',
    accent: 'cyan'
  },
  {
    id: 'encode',
    name: 'Encode / Decode',
    path: '/encode',
    blurb: 'Base64 (std + URL-safe), URL, HTML, Hex, Binary, JSON-escape. Live, bidirectional.',
    category: 'crypto',
    status: 'ready',
    icon: 'braces',
    accent: 'teal'
  },
  {
    id: 'jwt',
    name: 'JWT Inspector',
    path: '/jwt',
    blurb: 'Decode JWTs locally. Header, payload, and signature with annotated claims.',
    category: 'crypto',
    status: 'ready',
    icon: 'key',
    accent: 'violet'
  },

  // ── Web / network ─────────────────────────────────────────────────────
  {
    id: 'headers',
    name: 'HTTP Header Audit',
    path: '/headers',
    blurb: 'Paste response headers. Get a graded report on HSTS, CSP, frame options, referrer-policy, COOP/COEP and more.',
    category: 'web',
    status: 'ready',
    icon: 'shield',
    accent: 'amber'
  },
  {
    id: 'regex',
    name: 'Regex Tester',
    path: '/regex',
    blurb: 'Live regex matching with highlighting, capture groups, and a small library of common patterns.',
    category: 'web',
    status: 'ready',
    icon: 'regex',
    accent: 'rose'
  },

  // ── Finance ───────────────────────────────────────────────────────────
  {
    id: 'finance',
    name: 'Finance Calculator',
    path: '/finance',
    blurb: 'Compound interest, loan amortization, and savings-goal time-to-target. All math in your browser.',
    category: 'finance',
    status: 'ready',
    icon: 'chart',
    accent: 'green'
  },

  // ── Files (kept from the original site) ───────────────────────────────
  {
    id: 'image',
    name: 'Image Toolkit',
    path: '/files/image',
    blurb: 'Crop, resize, convert, compress, and clean up image metadata. JPG, PNG, WebP, AVIF.',
    category: 'files',
    status: 'ready',
    icon: 'image',
    accent: 'violet'
  },
  {
    id: 'pdf',
    name: 'PDF Toolkit',
    path: '/files/pdf',
    blurb: 'Split and merge PDFs, image-to-PDF, scrub metadata.',
    category: 'files',
    status: 'beta',
    icon: 'file',
    accent: 'rose'
  }
];

export const categories = [
  { id: 'crypto',  label: 'Crypto & encoding', command: '~/crypto',  accent: 'cyan'   as const },
  { id: 'web',     label: 'Web & network',      command: '~/web',     accent: 'amber'  as const },
  { id: 'dev',     label: 'Dev helpers',        command: '~/dev',     accent: 'rose'   as const },
  { id: 'finance', label: 'Finance',            command: '~/finance', accent: 'green'  as const },
  { id: 'files',   label: 'Files',              command: '~/files',   accent: 'violet' as const }
];

export const toolByPath = (path: string): Tool | undefined =>
  tools.find((t) => t.path === path);
