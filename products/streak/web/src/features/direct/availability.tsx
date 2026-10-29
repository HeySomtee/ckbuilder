import { useQuery } from '@tanstack/react-query';
import { followMarket, marketHref } from '../../lib/market-route';
import { useNow } from '../../lib/use-now';
import { PaymentButtonState } from './payment-progress';
import {
  acceptsPayment,
  getMarketAvailability,
  getProvisioningAvailability,
  getDemandAvailability,
} from './availability-api';

export function useDemandAvailability(fixtureIds: readonly string[], enabled = true) {
  const ids = [...new Set(fixtureIds)]
    .filter((id) => /^api-football-[1-9]\d{0,14}$/.test(id))
    .sort();
  return useQuery({
    queryKey: ['direct-demand-availability', ...ids],
    queryFn: ({ signal }) => getDemandAvailability(ids, signal),
    enabled: enabled && ids.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

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
          {catalogue.isError ? (
            'Payment availability could not be refreshed. Try again before choosing a match.'
          ) : catalogue.isPending ? (
            <PaymentButtonState variant="wave" label="Checking available predictions..." />
          ) : available.length ? (
            'Pick a side, then continue to payment. Streak covers market setup when your first prediction opens a new market. Wallet review checks availability and every amount.'
          ) : (
            'Open a fixture below to check first-prediction sponsorship. Streak covers setup for eligible new markets; wallet review confirms availability.'
          )}
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
