// Pictures an agent writes with a local path that has spaces (from Pro: a picture such as "![Org chart draft](/Users/x/The Northwind
// Studio/Office/org-chart.png)" showed as raw text: markdown ends a link's address at its first space). Before the markdown is read, such an
// image's path is put in <...>, the form markdown takes spaces in; a Windows path's backslashes become slashes (markdown reads some of them as
// escapes). Only images whose address looks like a picture's path on disk, outside code. Pure: tests/imagepath.test.ts.

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|tiff?)$/i;
const WINDOWS = /^[A-Za-z]:[\\/]/;
/** A local picture's path, as an agent writes it: absolute (/, ~/, C:\ or C:/), or relative (./, ../, a name), with no scheme. */
const localPicture = (p: string): boolean => IMAGE.test(p) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(p) && !/^(data|blob|mailto):/i.test(p);

/** The markdown with every local picture's path in a form markdown reads whole: spaces kept, %20 as is, a Windows path with slashes. */
export function imagePaths(text: string): string {
  // code (fenced blocks and inline spans) is left exactly as written
  return text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g).map((part, i) => (i % 2 ? part : part.replace(/!\[([^\]\n]*)\]\(([^()\n]*)\)/g, (whole, alt: string, target: string) => {
    const t = target.trim(), wrapped = /^<.*>$/.test(t), p = wrapped ? t.slice(1, -1) : t; if (!p || !localPicture(p)) return whole;
    const win = WINDOWS.test(p); if (!win && (wrapped || !/\s/.test(p))) return whole; // nothing markdown would cut
    // a drive (C:) reads as an address's scheme, which the sanitizer drops: /C:/..., which imageFile reads back
    return `![${alt}](<${win ? `/${p.replace(/\\/g, '/')}` : p}>)`;
  }))).join('');
}

/** An image's address as markdown left it (percent-encoded), back to a path on disk: absolute as it is, relative against the agent's folder. */
export function imageFile(src: string, base: string): string {
  let p = src; try { p = decodeURI(src).replace(/%23/gi, '#').replace(/%3F/gi, '?'); } catch { /* a lone % stays as written */ } // never %2F: Grok's session folders have it in their real names
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // a Windows drive, as imagePaths wrote it
  if (p.startsWith('/') || WINDOWS.test(p)) return p.replace(/\\/g, '/');
  const joined = `${base.replace(/[\\/]$/, '')}/${p.replace(/^\.\//, '')}`;
  return WINDOWS.test(base) ? joined.replace(/\\/g, '/') : joined;
}

/** A path on disk as a file:// address: spaces and the characters a URL would cut at (#, ?) encoded; a Windows drive gets its third slash. */
export const fileUrl = (abs: string): string => `file://${abs.startsWith('/') ? '' : '/'}${encodeURI(abs.replace(/\\/g, '/')).replace(/[?#]/g, encodeURIComponent)}`;
