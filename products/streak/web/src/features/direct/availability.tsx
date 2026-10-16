import { useQuery } from '@tanstack/react-query';
import { followMarket, marketHref } from '../../lib/market-route';
import { useNow } from '../../lib/use-now';
import {
  acceptsPayment,
  getMarketAvailability,
  getProvisioningAvailability,
} from './availability-api';

export function useProvisioningAvailability(enabled = true) {
  return useQuery({
    queryKey: ['direct-provisioning'],
    queryFn: ({ signal }) => getProvisioningAvailability(signal),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

// Discovery does not load the wallet SDK or the transaction descriptor parser.
export function useDirectCatalogue(enabled = true) {
  return useQuery({
    queryKey: ['direct-availability'],
    queryFn: ({ signal }) => getMarketAvailability(signal),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

export function AvailableMarkets({ onNavigate }: { onNavigate?: () => void }) {
  const catalogue = useDirectCatalogue();
  const now = useNow(true);
  const available = catalogue.data?.filter((row) => acceptsPayment(row, now)) ?? [];
  return (
    <section className="notice available-markets" aria-label="Available testnet markets">
      <div>
        <strong>Play on testnet</strong>
        <p>
          {catalogue.isError
            ? 'Payment availability could not be refreshed. Try again before choosing a match.'
            : catalogue.isPending
              ? 'Checking funded markets...'
              : available.length
                ? 'These matches have funded contracts. Pick a side, then continue to payment. Wallet review checks remaining space and time.'
                : 'No funded markets are accepting predictions right now. You can still save picks for later.'}
        </p>
      </div>
      {catalogue.isError ? (
        <button onClick={() => void catalogue.refetch()}>Retry availability</button>
      ) : (
        <div className="available-market-links">
          {available.slice(0, 8).map((row) => (
            <a
              key={row.id}
              className="quiet"
              href={marketHref(`m-${row.fixtureId}`)}
              onClick={(event) => {
                followMarket(event, `m-${row.fixtureId}`);
                if (event.defaultPrevented) onNavigate?.();
              }}
            >
              {row.label}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
