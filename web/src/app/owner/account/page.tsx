import { KeyRoundIcon } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { ConsoleShell } from '@/components/console-shell';
import { Panel } from '@/components/states';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { requireConsole } from '@/lib/api/guard';
import { changePasswordAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Your own account.
 *
 * One thing on it, and it is the thing that could not be done at all before
 * Phase 9: **change your own password.** Until then a password known to the
 * wrong person could only be changed by a developer with database access,
 * which a pilot shop does not have.
 *
 * Open to owners and managers alike — both sign into this console, and both
 * have a password somebody might learn. Workers do the same from the phone.
 */
export default async function AccountPage() {
  const { profile } = await requireConsole('owner');

  return (
    <ConsoleShell
      profile={profile}
      current="/owner/account"
      title="Akaunti yangu"
      lede={profile.email ?? profile.fullName}
    >
      <Panel
        title="Badilisha nenosiri · Change your password"
        description="Unahitaji nenosiri lako la sasa. Hiyo ndiyo inayozuia mtu aliyepata kompyuta yako wazi kukufungia nje ya duka lako mwenyewe."
        className="max-w-xl"
      >
        <ActionForm
          action={changePasswordAction}
          label="Badilisha nenosiri · Change password"
          busyLabel="Inabadilisha..."
        >
          <Field htmlFor="currentPassword" label="Nenosiri la sasa · Current password">
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          <Field
            htmlFor="newPassword"
            label="Nenosiri jipya · New password"
            hint="Herufi 8 au zaidi · at least 8 characters"
          >
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>

          <Field htmlFor="confirmPassword" label="Andika tena · Type it again">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
        </ActionForm>

        {/*
          Said plainly rather than left to be discovered. V1 issues no refresh
          tokens and keeps no session registry, so there is nothing to revoke
          against — pretending otherwise would be the more dangerous silence.
        */}
        <Alert variant="info" className="mt-4">
          <KeyRoundIcon />
          <AlertDescription>
            Kubadilisha nenosiri <strong>hakukatishi</strong> vipindi vingine vilivyo wazi. Kama
            unataka kumzuia mtu mwingine, msimamishe kwenye <strong>Wafanyakazi</strong> — hapo
            ndipo kunapokata mara moja. Changing your password does not end other open sessions; to
            stop somebody else, switch them off under Wafanyakazi.
          </AlertDescription>
        </Alert>
      </Panel>
    </ConsoleShell>
  );
}
