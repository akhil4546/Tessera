import { Suspense } from 'react';
import { VerifyForm } from '../../components/auth-form';

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
