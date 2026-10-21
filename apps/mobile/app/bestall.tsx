import { LegacyBoundary } from '../lib/legacy-boundary';
import LegacyOrder from '../legacy/bestall';

export default function Order() {
  return <LegacyBoundary fallback="/forfragan"><LegacyOrder /></LegacyBoundary>;
}
