import { LegacyBoundary } from '../lib/legacy-boundary';
import LegacyBuilder from '../legacy/bygg';

/** Det äldre pris-/orderflödet behålls i den isolerade testmiljön. */
export default function Builder() {
  return <LegacyBoundary fallback="/plockmeny"><LegacyBuilder /></LegacyBoundary>;
}
