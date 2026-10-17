// Stand-in for Person B's targetOutbound(): the consented phones first, then synthetic
// residents. dial() rings only the consented ones; the rest come back simulated, which is
// exactly the "4 real, N would-have-called" panel in the demo.
//
// Synthetic numbers use 555-01XX, the range reserved for fiction. They can never ring
// anyone, and dial() would refuse them anyway.
import { config } from './config.js';

const SYNTHETIC_LANGS = ['en-US', 'es-ES', 'ko-KR', 'en-US', 'es-ES', 'fil-PH', 'hy-AM', 'en-US'];

export function targetOutbound(cluster, { synthetic = config.syntheticTargets } = {}) {
  const real = config.consentedEntries.map((e) => ({ to: e.number, lang: e.lang, reason: 'consented volunteer' }));
  const fake = Array.from({ length: synthetic }, (_, i) => ({
    to: `+1213555${String(100 + (i % 100)).padStart(4, '0')}`,
    lang: SYNTHETIC_LANGS[i % SYNTHETIC_LANGS.length],
    reason: 'synthetic resident near ' + cluster.street,
  }));
  return [...real, ...fake];
}
