import { LegacyBoundary } from '../lib/legacy-boundary';
import LegacyDirectOrder from '../legacy/direkt';

export default function DirectOrder() {
  return <LegacyBoundary fallback="/menyer"><LegacyDirectOrder /></LegacyBoundary>;
}
