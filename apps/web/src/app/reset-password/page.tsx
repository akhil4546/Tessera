import { Suspense } from 'react';
import { ResetForm } from '../../components/auth-form';

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
