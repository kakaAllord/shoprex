import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  COMMON_UNIT_NAMES,
  UnitNameField,
  isNewUnitName,
  matchUnitNames,
  mergeUnitNames,
} from './UnitNameField';

/**
 * A unit is chosen, not spelled.
 *
 * The seller is at a counter with a customer waiting. Typing "Kipande" is slow,
 * and worse, it is lossy: a shop that writes one unit three different ways ends
 * up with three units that mean the same thing and no way to add them up.
 */
const shopNames = ['Chupa', 'Kreti'];

describe('building the list of units to choose from', () => {
  it("puts the shop's own units first, in the order given", () => {
    const merged = mergeUnitNames(shopNames);

    expect(merged.slice(0, 2)).toEqual(['Chupa', 'Kreti']);
  });

  it('still offers common names to a shop on its first day', () => {
    expect(mergeUnitNames([])).toEqual([...COMMON_UNIT_NAMES]);
  });

  it('does not list a name twice when the shop already uses a common one', () => {
    const merged = mergeUnitNames(['Kipande']);

    expect(merged.filter((name) => name === 'Kipande')).toHaveLength(1);
  });

  it('treats a differently-cased duplicate as the same unit', () => {
    // "kipande" and "Kipande" are one unit, and offering both would create the
    // very split this picker exists to prevent.
    const merged = mergeUnitNames(['kipande']);

    expect(merged.filter((name) => name.toLowerCase() === 'kipande')).toHaveLength(1);
  });

  it('ignores blank names', () => {
    expect(mergeUnitNames(['  ', ''])).toEqual([...COMMON_UNIT_NAMES]);
  });
});

describe('searching the list', () => {
  const names = mergeUnitNames(shopNames);

  it('returns everything before anything is typed', () => {
    expect(matchUnitNames(names, '')).toEqual(names);
  });

  it('matches anywhere in the name, ignoring case', () => {
    expect(matchUnitNames(names, 'ip')).toContain('Kipande');
  });

  it('returns nothing for a name the shop has never used', () => {
    expect(matchUnitNames(names, 'Ndoo')).toEqual([]);
  });
});

describe('knowing when a unit is genuinely new', () => {
  const names = mergeUnitNames(shopNames);

  it('is new when nothing matches exactly', () => {
    expect(isNewUnitName(names, 'Ndoo')).toBe(true);
  });

  it('is not new when it already exists, whatever the casing', () => {
    expect(isNewUnitName(names, 'kipande')).toBe(false);
  });

  it('is not new when the box is empty', () => {
    expect(isNewUnitName(names, '   ')).toBe(false);
  });

  it('is still new when a partial match exists but no exact one', () => {
    // "Kip" narrows the list to Kipande without being Kipande, so the seller
    // may still mean a new unit called "Kip".
    expect(isNewUnitName(names, 'Kip')).toBe(true);
  });
});

describe('the field itself', () => {
  const renderField = (value = '') => {
    const onChange = jest.fn();

    render(
      <UnitNameField
        label="Kipimo · Unit"
        names={mergeUnitNames(shopNames)}
        value={value}
        onChange={onChange}
      />,
    );

    return onChange;
  };

  it('offers the units to choose from once the seller touches the box', () => {
    renderField();

    fireEvent(screen.getByTestId('unit-search'), 'focus');

    expect(screen.getByTestId('unit-option-Chupa')).toBeTruthy();
    expect(screen.getByTestId('unit-option-Kipande')).toBeTruthy();
  });

  it('chooses a unit with one tap, no typing at all', () => {
    const onChange = renderField();

    fireEvent(screen.getByTestId('unit-search'), 'focus');
    fireEvent.press(screen.getByTestId('unit-option-Kreti'));

    expect(onChange).toHaveBeenCalledWith('Kreti');
  });

  it('narrows the list as the seller types', () => {
    renderField();

    fireEvent.changeText(screen.getByTestId('unit-search'), 'chu');

    expect(screen.getByTestId('unit-option-Chupa')).toBeTruthy();
    expect(screen.queryByTestId('unit-option-Kreti')).toBeNull();
  });

  it('shows no add button while the typed name already exists', () => {
    // Nothing to add — it is right there in the list to be tapped.
    renderField();

    fireEvent.changeText(screen.getByTestId('unit-search'), 'Chupa');

    expect(screen.queryByTestId('unit-add')).toBeNull();
  });

  it('offers the green + only for a name that is not in the list', () => {
    renderField();

    fireEvent.changeText(screen.getByTestId('unit-search'), 'Ndoo');

    expect(screen.getByTestId('unit-add')).toBeTruthy();
    expect(screen.getByText(/tap \+ to add it/)).toBeTruthy();
  });

  it('adds the new unit as typed when + is tapped', () => {
    const onChange = renderField();

    fireEvent.changeText(screen.getByTestId('unit-search'), '  Ndoo  ');
    fireEvent.press(screen.getByTestId('unit-add'));

    expect(onChange).toHaveBeenCalledWith('Ndoo');
  });

  it('shows what is currently chosen', () => {
    renderField('Kreti');

    expect(screen.getByTestId('unit-chosen')).toHaveTextContent(/Kreti$/);
  });

  it('shows nothing chosen before the seller picks', () => {
    renderField();

    expect(screen.queryByTestId('unit-chosen')).toBeNull();
  });
});
