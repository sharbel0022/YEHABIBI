import { LegacyBoundary } from '../lib/legacy-boundary';
import LegacyOrders from '../legacy/ordrar';

export default function Orders() {
  return <LegacyBoundary fallback="/kontakt"><LegacyOrders /></LegacyBoundary>;
}
