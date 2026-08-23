import { ALL_PERMISSIONS, PERMISSION_LABELS, type UserPermission } from '../lib/api/staff';

/**
 * The permission boxes, wherever they appear.
 *
 * Every box is rendered every time, ticked or not, because the backend
 * **replaces** the set rather than merging it: a box left unticked is a
 * permission taken away, and a form that posted only the changes would quietly
 * strip the rest.
 */
export function PermissionChecks({
  granted = [],
  idPrefix,
}: {
  granted?: UserPermission[];
  idPrefix: string;
}) {
  return (
    <fieldset className="shoprex-checks" style={{ border: 'none', padding: 0, margin: '4px 0 16px' }}>
      {ALL_PERMISSIONS.map((permission) => (
        <label
          key={permission}
          className="shoprex-check"
          htmlFor={`${idPrefix}-${permission}`}
        >
          <input
            id={`${idPrefix}-${permission}`}
            type="checkbox"
            name="permissions"
            value={permission}
            defaultChecked={granted.includes(permission)}
          />
          {PERMISSION_LABELS[permission]}
        </label>
      ))}
    </fieldset>
  );
}
