import { ALL_PERMISSIONS, PERMISSION_LABELS, type UserPermission } from '@/lib/api/staff';

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
    <fieldset className="flex flex-wrap gap-x-4 gap-y-2 border-0 p-0">
      {ALL_PERMISSIONS.map((permission) => (
        <label
          key={permission}
          htmlFor={`${idPrefix}-${permission}`}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <input
            id={`${idPrefix}-${permission}`}
            type="checkbox"
            name="permissions"
            value={permission}
            defaultChecked={granted.includes(permission)}
            className="size-4 rounded border-input accent-primary"
          />
          {PERMISSION_LABELS[permission]}
        </label>
      ))}
    </fieldset>
  );
}
