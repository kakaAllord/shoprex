'use client';

import { PencilIcon } from 'lucide-react';
import {
  resetStaffPasswordAction,
  setPermissionsAction,
  setStaffActiveAction,
} from '@/app/owner/actions';
import { ActionForm } from '@/components/action-form';
import { PermissionChecks } from '@/components/permission-checks';
import { SidePanel } from '@/components/side-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { StaffMember } from '@/lib/api/staff';

/**
 * One person's editor: permissions, password, and switching them off — the
 * three things Wafanyakazi's own row can change, reached by its edit icon
 * rather than by expanding the row itself.
 */
export function StaffEditPanel({ person }: { person: StaffMember }) {
  return (
    <SidePanel
      trigger={
        <Button variant="ghost" size="icon">
          <PencilIcon />
          <span className="sr-only">Badilisha {person.fullName} · Edit {person.fullName}</span>
        </Button>
      }
      title={person.fullName}
      description="Ruhusa, nenosiri, na kumsimamisha aliyeondoka. Kisanduku kisichotiwa alama ni ruhusa iliyoondolewa, na hubadilika papo hapo."
    >
      <ActionForm
        action={setPermissionsAction}
        label="Hifadhi ruhusa · Save"
        busyLabel="Inahifadhi..."
        variant="quiet"
      >
        <input type="hidden" name="userId" value={person.id} />
        <PermissionChecks granted={person.permissions} idPrefix={`perm-${person.id}`} />
      </ActionForm>

      <div className="flex flex-col gap-2 border-t pt-4">
        <Label htmlFor={`pw-${person.id}`}>Weka nenosiri jipya · Set a new password</Label>
        <p className="text-xs text-muted-foreground">
          {person.email
            ? 'Mpe yeye mwenyewe baada ya kuhifadhi.'
            : 'Mfanyakazi hana barua pepe, kwa hivyo hii ndiyo njia pekee ya kurudisha nenosiri lililosahaulika.'}
        </p>
        <ActionForm
          action={resetStaffPasswordAction}
          label="Weka · Set"
          busyLabel="..."
          variant="quiet"
          inline
        >
          <input type="hidden" name="userId" value={person.id} />
          <Input
            id={`pw-${person.id}`}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Herufi 8 au zaidi"
            className="w-full"
          />
        </ActionForm>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <Label>
          {person.isActive ? 'Ameondoka kazini? · Have they left?' : 'Amerudi? · Have they come back?'}
        </Label>
        <p className="text-xs text-muted-foreground">
          {person.isActive
            ? 'Kumsimamisha kunamzuia mara moja — hata kipindi alichonacho sasa kinakatika. Hakuna kinachofutwa: mauzo yake na historia yake hubaki.'
            : 'Kumrudisha kunamruhusu kuingia tena kama zamani, na historia yake ipo kama ilivyokuwa.'}
        </p>
        <ActionForm
          action={setStaffActiveAction}
          label={person.isActive ? 'Msimamishe · Switch off' : 'Mrudishe · Switch on'}
          busyLabel="..."
          variant={person.isActive ? 'danger' : 'quiet'}
          confirm={
            person.isActive
              ? `Msimamishe ${person.fullName}? Hataweza kuingia tena, na kipindi alichonacho sasa kitakatika mara moja. Switch them off? They cannot sign in, and any session they hold stops working immediately.`
              : undefined
          }
        >
          <input type="hidden" name="userId" value={person.id} />
          <input type="hidden" name="isActive" value={person.isActive ? 'false' : 'true'} />
        </ActionForm>
      </div>
    </SidePanel>
  );
}
