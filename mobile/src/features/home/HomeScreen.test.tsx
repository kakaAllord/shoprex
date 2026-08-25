import { fireEvent, render, screen } from '@testing-library/react-native';
import { HomeScreen } from './HomeScreen';
import { Profile } from '../../core/api/apiClient';

/**
 * The home screen is built from what the backend said this person may do.
 *
 * Hiding a button is not authorization — the backend refuses a sale from
 * someone without `SELL`, a delivery from someone without `RECEIVE_STOCK`, and
 * a stock read from someone without `VIEW_STOCK`, whatever the phone shows.
 * What this screen owes is honesty: somebody who has not been granted
 * something should be *told*, not shown a dimmed button to wonder about.
 */
const worker: Profile = {
  id: 'worker-1',
  fullName: 'Juma Hassan',
  role: 'WORKER',
  businessId: 'shop-1',
  businessName: 'Duka la Mfano',
  permissions: ['SELL'],
  deviceId: 'device-1',
  branchIds: ['branch-1'],
};

const handlers = () => ({
  onOpenSale: jest.fn(),
  onOpenReceive: jest.fn(),
  onOpenStock: jest.fn(),
  onOpenProducts: jest.fn(),
  onSignOut: jest.fn(),
});

const show = (profile: Profile, on = handlers()) => {
  render(<HomeScreen profile={profile} {...on} />);

  return on;
};

describe('HomeScreen', () => {
  it('makes selling the obvious thing to do for a worker who may sell', () => {
    const on = show(worker);

    fireEvent.press(screen.getByTestId('home-open-sale'));

    expect(on.onOpenSale).toHaveBeenCalled();
    expect(screen.getByText('Mauzo')).toBeTruthy();
  });

  it('greets the worker by name and names their shop', () => {
    show(worker);

    expect(screen.getByText('Karibu, Juma Hassan')).toBeTruthy();
    expect(screen.getAllByText('Duka la Mfano').length).toBeGreaterThan(0);
  });

  it('explains the missing selling permission instead of showing a dead button', () => {
    show({ ...worker, permissions: ['VIEW_STOCK'] });

    expect(screen.queryByTestId('home-open-sale')).toBeNull();
    expect(screen.getByTestId('home-no-sell')).toBeTruthy();
    expect(screen.getByText(/Ask the shop owner to grant/)).toBeTruthy();
  });

  it('lets an owner do everything without being granted a permission they hand out', () => {
    // The owner is the authority that grants these; requiring them to grant
    // themselves one would be a loop with no purpose — the backend takes the
    // same view in PermissionsGuard.
    show({ ...worker, role: 'OWNER', permissions: [] });

    expect(screen.getByTestId('home-open-sale')).toBeTruthy();
    expect(screen.getByTestId('home-open-receive')).toBeTruthy();
    expect(screen.getByTestId('home-open-stock')).toBeTruthy();
  });

  it('offers a way out', () => {
    const on = show(worker);

    fireEvent.press(screen.getByTestId('home-sign-out'));

    expect(on.onSignOut).toHaveBeenCalled();
  });
});

describe('receiving stock and the stock view', () => {
  it('offers Pokea mzigo to someone who may receive stock', () => {
    const on = show({ ...worker, permissions: ['SELL', 'RECEIVE_STOCK'] });

    fireEvent.press(screen.getByTestId('home-open-receive'));

    expect(on.onOpenReceive).toHaveBeenCalled();
    expect(screen.getByText('Pokea mzigo')).toBeTruthy();
  });

  it('offers Stoo to someone who may view stock', () => {
    const on = show({ ...worker, permissions: ['SELL', 'VIEW_STOCK'] });

    fireEvent.press(screen.getByTestId('home-open-stock'));

    expect(on.onOpenStock).toHaveBeenCalled();
    expect(screen.getByText('Stoo')).toBeTruthy();
  });

  it('hides receiving from a seller who was never granted it', () => {
    // Not dimmed — absent. The backend refuses the delivery either way, so
    // this is about not offering a door that will be shut in their face.
    show({ ...worker, permissions: ['SELL'] });

    expect(screen.queryByTestId('home-open-receive')).toBeNull();
    expect(screen.queryByText('Pokea mzigo')).toBeNull();
  });

  it('hides the stock view from someone who may only sell', () => {
    show({ ...worker, permissions: ['SELL'] });

    expect(screen.queryByTestId('home-open-stock')).toBeNull();
  });

  it('lets a stock keeper who cannot sell still receive and look', () => {
    // A back-room phone: no selling, but the shelves are this person's job.
    show({ ...worker, permissions: ['RECEIVE_STOCK', 'VIEW_STOCK'] });

    expect(screen.queryByTestId('home-open-sale')).toBeNull();
    expect(screen.getByTestId('home-no-sell')).toBeTruthy();
    expect(screen.getByTestId('home-open-receive')).toBeTruthy();
    expect(screen.getByTestId('home-open-stock')).toBeTruthy();
  });

  it('tells someone granted nothing at all, once, rather than three times', () => {
    show({ ...worker, permissions: [] });

    expect(screen.getByTestId('home-no-permissions')).toBeTruthy();
    expect(screen.queryByTestId('home-no-sell')).toBeNull();
    expect(screen.queryByTestId('home-open-sale')).toBeNull();
    expect(screen.queryByTestId('home-open-receive')).toBeNull();
    expect(screen.queryByTestId('home-open-stock')).toBeNull();
  });

  /**
   * Bidhaa is the one tile that is never absent: reading the catalogue asks
   * for no permission beyond being staff, so somebody granted nothing at all
   * can still look up what a thing costs.
   */
  it('offers the catalogue to everyone, including somebody granted nothing', () => {
    const on = show({ ...worker, permissions: [] });

    fireEvent.press(screen.getByTestId('home-open-products'));

    expect(on.onOpenProducts).toHaveBeenCalled();
  });

  it('offers the catalogue alongside the other tiles when everything is granted', () => {
    const on = show({ ...worker, permissions: ['SELL', 'RECEIVE_STOCK', 'VIEW_STOCK'] });

    fireEvent.press(screen.getByTestId('home-open-products'));

    expect(on.onOpenProducts).toHaveBeenCalled();
    expect(screen.getByText('Bidhaa')).toBeTruthy();
  });

  it('says the catalogue can be added to only when this person could add', () => {
    show({ ...worker, permissions: ['SELL'] });
    expect(screen.getByText(/ongeza bidhaa mpya/i)).toBeTruthy();

    screen.unmount();

    // VIEW_STOCK alone reads the shelf but creates nothing.
    show({ ...worker, permissions: ['VIEW_STOCK'] });
    expect(screen.queryByText(/ongeza bidhaa mpya/i)).toBeNull();
    expect(screen.getByText(/Angalia bei za bidhaa/i)).toBeTruthy();
  });

  it('keeps selling the largest thing on the screen when all three are granted', () => {
    // AGENT.md's design rule. Receiving and Stoo are a pair of small tiles
    // under Mauzo, never beside it at the same weight.
    show({ ...worker, permissions: ['SELL', 'RECEIVE_STOCK', 'VIEW_STOCK'] });

    const saleSize = screen.getByText('Mauzo').props.style.fontSize;
    const receiveSize = screen.getByText('Pokea mzigo').props.style.fontSize;

    expect(saleSize).toBeGreaterThan(receiveSize);
  });
});
