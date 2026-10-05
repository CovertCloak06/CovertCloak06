import { SERVICES } from '@watch-party/shared/client';
import { describe, expect, it } from 'vitest';
import { buildManifest, serviceMatchPatterns } from '../src/manifest.js';

describe('manifest', () => {
  it('matches exactly the registered services over https', () => {
    const patterns = serviceMatchPatterns();
    for (const s of SERVICES) for (const d of s.domains) {
      expect(patterns).toContain(`https://${d}/*`);
      expect(patterns).toContain(`https://*.${d}/*`);
    }
    expect(patterns.every((p) => p.startsWith('https://'))).toBe(true);
  });

  it('keeps permissions minimal and only adds localhost to dev builds', () => {
    const prod = buildManifest({ version: '1.2.3', dev: false });
    expect(prod.manifest_version).toBe(3);
    expect(prod.permissions).toEqual(['storage']);
    expect(JSON.stringify(prod)).not.toContain('localhost');
    const dev = buildManifest({ version: '1.2.3', dev: true });
    expect(dev.host_permissions).toContain('http://127.0.0.1/*');
  });

  it('runs the Netflix seek helper in the page world only on Netflix', () => {
    const scripts = buildManifest({ version: '1.0.0', dev: false }).content_scripts!;
    const main = scripts.find((c) => (c as { world?: string }).world === 'MAIN')!;
    expect(main.matches).toEqual(['https://www.netflix.com/*']);
    expect(main.js).toEqual(['netflix-main.js']);
  });
});
