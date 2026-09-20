import { Suspense } from 'react';
import { CompleteOauthForm } from '../../../components/auth-form';

export default function CompleteSignupPage() {
  return (
    <Suspense>
      <CompleteOauthForm />
    </Suspense>
  );
}
