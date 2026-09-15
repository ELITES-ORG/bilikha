import { useState, type FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Button, Input } from '@/components/ui';
import { toFieldErrors } from '@/features/auth/field-errors';
import { toApiError } from '@/lib/api-client';
import { useChangePassword } from './api';

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EMPTY_FORM: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export function PasswordForm() {
  const changePassword = useChangePassword();
  const [form, setForm] = useState<PasswordFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function update(key: keyof PasswordFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setConfirmation(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setConfirmation(null);

    try {
      await changePassword.mutateAsync(form);
      setForm(EMPTY_FORM);
      setConfirmation('Password changed. You are still signed in.');
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
        return;
      }
      if (error instanceof AxiosError && error.response?.status === 401) {
        setFieldErrors({ currentPassword: toApiError(error).message });
        return;
      }
      setFormError(toApiError(error).message);
    }
  }

  const incomplete =
    !form.currentPassword || !form.newPassword || !form.confirmPassword;

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
      {formError && (
        <p
          className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
          role="alert"
        >
          {formError}
        </p>
      )}
      {confirmation && (
        <p
          className="rounded-md border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700"
          role="status"
        >
          {confirmation}
        </p>
      )}

      <Input
        label="Current password"
        type="password"
        required
        autoComplete="current-password"
        value={form.currentPassword}
        onChange={(event) => update('currentPassword', event.target.value)}
        error={fieldErrors.currentPassword}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 10 characters."
          value={form.newPassword}
          onChange={(event) => update('newPassword', event.target.value)}
          error={fieldErrors.newPassword}
        />
        <Input
          label="Confirm new password"
          type="password"
          required
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => update('confirmPassword', event.target.value)}
          error={fieldErrors.confirmPassword}
        />
      </div>
      <Button
        type="submit"
        loading={changePassword.isPending}
        disabled={incomplete || changePassword.isPending}
      >
        Change password
      </Button>
    </form>
  );
}
