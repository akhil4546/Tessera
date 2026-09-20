'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { REPORT_REASONS, type ReportReason } from '@tessera/types';
import { Button, TextArea, Tile } from '@tessera/ui';
import { TesseraApiError } from '@tessera/api-client';
import { api } from '../lib/api';

export function ReportDialog({
  kind,
  id,
  handle,
  onDone,
}: {
  kind: 'post' | 'comment' | 'moment' | 'loop' | 'conversation' | 'account';
  id?: string;
  handle?: string;
  onDone?: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    try {
      if (kind === 'account' && handle) await api.reportAccount(handle, reason, details);
      else if (kind === 'post' && id) await api.reportPost(id, reason, details);
      else if (kind === 'comment' && id) await api.reportComment(id, reason, details);
      else if (kind === 'moment' && id) await api.reportMoment(id, reason, details);
      else if (kind === 'loop' && id) await api.reportLoop(id, reason, details);
      else if (kind === 'conversation' && id) await api.reportConversation(id, reason, details);
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(err instanceof TesseraApiError ? err.message : t('error.body'));
    }
  }

  return (
    <div>
      <Button variant="ghost" type="button" onClick={() => setOpen((value) => !value)}>
        {t('inbox.report')}
      </Button>
      {open ? (
        <Tile className="mt-2">
          {done ? (
            <p className="text-sm text-moss">{t('inbox.reported')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex min-h-11 flex-col gap-1 text-sm">
                <span className="font-medium">{t('settings.reportReason')}</span>
                <select
                  className="min-h-11 rounded-tile border border-border bg-surface-elevated px-3"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                >
                  {REPORT_REASONS.map((item) => (
                    <option key={item} value={item}>
                      {t(`safety.${item === 'self_harm' ? 'selfHarm' : item}`)}
                    </option>
                  ))}
                </select>
              </label>
              <TextArea
                name="details"
                label={t('settings.reportDetails')}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={2000}
              />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="button" onClick={() => void submit()}>
                {t('settings.reportSubmit')}
              </Button>
            </div>
          )}
        </Tile>
      ) : null}
    </div>
  );
}
