'use client';

import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { createManagerAction, createWorkerAction } from '@/app/owner/actions';
import { ActionForm } from '@/components/action-form';
import { Field } from '@/components/field';
import { NativeSelect } from '@/components/native-select';
import { PermissionChecks } from '@/components/permission-checks';
import { SidePanel } from '@/components/side-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BranchView } from '@/lib/api/organization';

/**
 * One button, one panel, two forms — a worker and a manager are created
 * differently (see `StaffPage`'s own note on why), so the panel toggles
 * which fields it shows rather than picking one shape for both.
 */
export function AddStaffPanel({ branches }: { branches: BranchView[] }) {
  const [role, setRole] = useState<'WORKER' | 'MANAGER'>('WORKER');

  return (
    <SidePanel
      trigger={
        <Button size="sm">
          <PlusIcon />
          Ongeza mtu · Add person
        </Button>
      }
      title="Ongeza mtu · Add a person"
      description="Mfanyakazi huingia kwenye simu ya tawi lake; meneja huingia hapa kwa barua pepe."
      onOpenChange={(open) => {
        if (!open) setRole('WORKER');
      }}
    >
      <div className="flex gap-1 rounded-lg border p-1">
        <Button
          type="button"
          size="sm"
          variant={role === 'WORKER' ? 'secondary' : 'ghost'}
          className="flex-1"
          onClick={() => setRole('WORKER')}
        >
          Mfanyakazi · Worker
        </Button>
        <Button
          type="button"
          size="sm"
          variant={role === 'MANAGER' ? 'secondary' : 'ghost'}
          className="flex-1"
          onClick={() => setRole('MANAGER')}
        >
          Meneja · Manager
        </Button>
      </div>

      {role === 'WORKER' ? (
        <ActionForm
          action={createWorkerAction}
          label="Ongeza mfanyakazi · Add worker"
          busyLabel="Inaongeza..."
        >
          <Field htmlFor="worker-name" label="Jina kamili · Full name">
            <Input id="worker-name" name="fullName" required placeholder="Juma Hassan" />
          </Field>

          <Field htmlFor="worker-password" label="Nenosiri · Password">
            <Input
              id="worker-password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Angalau herufi 8"
            />
          </Field>

          <Field htmlFor="worker-branch" label="Tawi · Branch">
            <NativeSelect id="worker-branch" name="branchId" required>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <div className="flex flex-col gap-2">
            <Label>Ruhusa · What they may do</Label>
            <PermissionChecks idPrefix="new-worker" />
          </div>
        </ActionForm>
      ) : (
        <ActionForm
          action={createManagerAction}
          label="Ongeza meneja · Add manager"
          busyLabel="Inaongeza..."
        >
          <Field htmlFor="manager-name" label="Jina kamili · Full name">
            <Input id="manager-name" name="fullName" required placeholder="Asha Mwakalinga" />
          </Field>

          <Field htmlFor="manager-email" label="Barua pepe · Email">
            <Input
              id="manager-email"
              name="email"
              type="email"
              required
              placeholder="meneja@duka.co.tz"
            />
          </Field>

          <Field htmlFor="manager-password" label="Nenosiri · Password">
            <Input id="manager-password" name="password" type="password" required minLength={8} />
          </Field>

          <div className="flex flex-col gap-2">
            <Label>Matawi · Branches they may reach</Label>
            <fieldset className="flex flex-col gap-2 border-0 p-0">
              {branches.map((branch) => (
                <label
                  key={branch.id}
                  htmlFor={`manager-branch-${branch.id}`}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    id={`manager-branch-${branch.id}`}
                    type="checkbox"
                    name="branchIds"
                    value={branch.id}
                    className="size-4 rounded border-input accent-primary"
                  />
                  {branch.name}
                </label>
              ))}
            </fieldset>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Ruhusa · What they may do</Label>
            <PermissionChecks idPrefix="new-manager" />
          </div>
        </ActionForm>
      )}
    </SidePanel>
  );
}
