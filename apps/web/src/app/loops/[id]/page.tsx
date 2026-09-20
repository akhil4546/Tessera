'use client';

import { useParams } from 'next/navigation';
import { LoopPlayer } from '../../../components/loop-player';

export default function LoopByIdPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <LoopPlayer startId={params.id} />
    </div>
  );
}
