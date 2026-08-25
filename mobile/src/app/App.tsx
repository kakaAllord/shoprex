import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { ApiClient, Profile, Sale, Session, ShoprexApiError } from '../core/api/apiClient';
import { SessionStore } from '../core/session/sessionStore';
import { DeviceLoginScreen } from '../features/auth/DeviceLoginScreen';
import { EnrollScreen } from '../features/enroll/EnrollScreen';
import { HealthScreen } from '../features/health/HealthScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { ProductsScreen } from '../features/products/ProductsScreen';
import { ReceiveScreen } from '../features/receive/ReceiveScreen';
import { ReceiptScreen } from '../features/sale/ReceiptScreen';
import { SaleScreen } from '../features/sale/SaleScreen';
import { StockScreen } from '../features/stock/StockScreen';
import { Loading, SecondaryButton } from './ui';
import { colors, spacing } from './theme';

/**
 * The Shoprex Android app.
 *
 * Navigation is a small piece of state rather than a router. Enrol, sign in,
 * and home are one path; from home the app fans out to the four places a shop
 * actually goes — selling, receiving a delivery, looking at the shelf, and the
 * catalogue — each of which returns home and nowhere else. Four native
 * navigation
 * dependencies would still buy nothing a `Route` union does not already give.
 * Android's hardware back button is wired to the same state, so "back" means
 * what it looks like it means.
 *
 * Two rules run through every screen below. **The backend decides**: what this
 * person may do comes from the profile it returns, never from a guess on the
 * phone. And **a 401 ends the session immediately** — that is how a revoked
 * handset stops selling, and it must not be something the app can shrug off.
 */

type Route =
  | { name: 'starting' }
  | { name: 'enroll' }
  | { name: 'signIn'; notice?: string | null }
  | { name: 'health'; from: 'enroll' | 'signIn' }
  | { name: 'home' }
  | { name: 'sale' }
  | { name: 'receipt'; sale: Sale }
  | { name: 'receive' }
  | { name: 'stock' }
  | { name: 'products' };

/**
 * Both are injected by tests and by tests only; the real app builds its own.
 * The index signature is what lets `registerRootComponent` accept a component
 * whose props are all optional.
 */
export interface AppProps {
  apiClient?: ApiClient;
  sessionStore?: SessionStore;
  [key: string]: unknown;
}

export default function App({
  apiClient: injectedClient,
  sessionStore: injectedStore,
}: AppProps = {}) {
  const [apiClient] = useState(() => injectedClient ?? new ApiClient());
  const [sessionStore] = useState(() => injectedStore ?? new SessionStore());

  const [route, setRoute] = useState<Route>({ name: 'starting' });
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  /** Drops the token but keeps the enrolment: the phone is still this worker's. */
  const endSession = useCallback(
    async (notice?: string | null) => {
      apiClient.setAccessToken(null);
      setProfile(null);
      await sessionStore.clearAccessToken();
      setRoute({ name: 'signIn', notice: notice ?? null });
    },
    [apiClient, sessionStore],
  );

  const adopt = useCallback((session: Session) => {
    apiClient.setAccessToken(session.accessToken);
    setProfile(session.user);
    setRoute({ name: 'home' });
  }, [apiClient]);

  // Startup: what does this installation already know?
  useEffect(() => {
    void (async () => {
      const stored = await sessionStore.load();

      setDeviceId(stored.deviceId);

      if (!stored.deviceId) {
        setRoute({ name: 'enroll' });

        return;
      }

      if (!stored.accessToken) {
        setRoute({ name: 'signIn' });

        return;
      }

      // A stored token still has to be checked. It may have expired, and the
      // device behind it may have been revoked since the app was last open.
      apiClient.setAccessToken(stored.accessToken);

      try {
        setProfile(await apiClient.fetchProfile());
        setRoute({ name: 'home' });
      } catch (caught) {
        apiClient.setAccessToken(null);
        await sessionStore.clearAccessToken();

        if (caught instanceof ShoprexApiError) {
          setRoute({ name: 'signIn', notice: caught.message });
        } else {
          setStartupError('Seva haipatikani · Cannot reach the Shoprex server');
          setRoute({ name: 'signIn' });
        }
      }
    })();
  }, [apiClient, sessionStore]);

  // Android's back button follows the same map the screens do, so nothing is
  // ever a dead end that only a force-quit escapes.
  useEffect(() => {
    const back = () => {
      if (route.name === 'health') {
        setRoute(route.from === 'enroll' ? { name: 'enroll' } : { name: 'signIn' });

        return true;
      }

      if (
        route.name === 'sale' ||
        route.name === 'receipt' ||
        route.name === 'receive' ||
        route.name === 'stock' ||
        route.name === 'products'
      ) {
        setRoute({ name: 'home' });

        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', back);

    return () => subscription.remove();
  }, [route]);

  if (route.name === 'starting') {
    return (
      <Shell>
        <Loading label="Inaanza… · Starting…" />
      </Shell>
    );
  }

  if (route.name === 'health') {
    return (
      <Shell>
        <HealthScreen apiClient={apiClient} />
        <View style={styles.healthFooter}>
          <SecondaryButton
            testID="health-back"
            label="Rudi · Back"
            onPress={() =>
              setRoute(route.from === 'enroll' ? { name: 'enroll' } : { name: 'signIn' })
            }
          />
        </View>
      </Shell>
    );
  }

  if (route.name === 'enroll') {
    return (
      <Shell>
        <EnrollScreen
          apiClient={apiClient}
          onCheckConnection={() => setRoute({ name: 'health', from: 'enroll' })}
          onEnrolled={(id) => {
            setDeviceId(id);
            void sessionStore.saveDeviceId(id);
            setRoute({ name: 'signIn' });
          }}
        />
      </Shell>
    );
  }

  if (route.name === 'signIn') {
    return (
      <Shell>
        <DeviceLoginScreen
          apiClient={apiClient}
          deviceId={deviceId ?? ''}
          notice={route.notice ?? startupError}
          onCheckConnection={() => setRoute({ name: 'health', from: 'signIn' })}
          onForgetDevice={() => {
            void sessionStore.clearAll();
            setDeviceId(null);
            setRoute({ name: 'enroll' });
          }}
          onSignedIn={(session) => {
            void sessionStore.saveAccessToken(session.accessToken);
            adopt(session);
          }}
        />
      </Shell>
    );
  }

  if (!profile) {
    // Cannot happen through the routes above; if it ever did, signing in again
    // is the honest answer rather than a screen built on nothing.
    return (
      <Shell>
        <Loading label="Inaanza… · Starting…" />
      </Shell>
    );
  }

  if (route.name === 'sale') {
    return (
      <Shell>
        <SaleScreen
          apiClient={apiClient}
          branchId={profile.branchIds[0] ?? ''}
          deviceId={deviceId}
          onBack={() => setRoute({ name: 'home' })}
          onDone={(sale) => setRoute({ name: 'receipt', sale })}
          onSessionOver={(message) => {
            void endSession(message);
          }}
        />
      </Shell>
    );
  }

  if (route.name === 'receive') {
    return (
      <Shell>
        <ReceiveScreen
          apiClient={apiClient}
          branchId={profile.branchIds[0] ?? ''}
          onBack={() => setRoute({ name: 'home' })}
          // Offered only to someone who could actually open it. The backend
          // refuses the read either way; this is about not pointing at a door
          // that will be shut in their face.
          onOpenStock={
            profile.permissions.includes('VIEW_STOCK') || profile.role === 'OWNER'
              ? () => setRoute({ name: 'stock' })
              : null
          }
          onSessionOver={(message) => {
            void endSession(message);
          }}
        />
      </Shell>
    );
  }

  if (route.name === 'stock') {
    return (
      <Shell>
        <StockScreen
          apiClient={apiClient}
          branchId={profile.branchIds[0] ?? ''}
          onBack={() => setRoute({ name: 'home' })}
          onSessionOver={(message) => {
            void endSession(message);
          }}
        />
      </Shell>
    );
  }

  if (route.name === 'receipt') {
    return (
      <Shell>
        <ReceiptScreen
          sale={route.sale}
          onNewSale={() => setRoute({ name: 'sale' })}
          onHome={() => setRoute({ name: 'home' })}
        />
      </Shell>
    );
  }

  if (route.name === 'products') {
    return (
      <Shell>
        <ProductsScreen
          apiClient={apiClient}
          // The same pair the backend's create route takes, so the button is
          // offered only to somebody it would actually work for. The backend
          // refuses either way — this is about not pointing at a shut door.
          canAdd={
            profile.role === 'OWNER' ||
            profile.permissions.includes('SELL') ||
            profile.permissions.includes('RECEIVE_STOCK')
          }
          onBack={() => setRoute({ name: 'home' })}
          onSessionOver={(message) => {
            void endSession(message);
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <HomeScreen
        profile={profile}
        onOpenSale={() => setRoute({ name: 'sale' })}
        onOpenReceive={() => setRoute({ name: 'receive' })}
        onOpenStock={() => setRoute({ name: 'stock' })}
        onOpenProducts={() => setRoute({ name: 'products' })}
        onSignOut={() => {
          void endSession();
        }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    // Android draws behind the status bar; keep content clear of it.
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
  healthFooter: { padding: spacing.lg, paddingTop: 0 },
});
