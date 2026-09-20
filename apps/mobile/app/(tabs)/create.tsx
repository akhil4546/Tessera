import { useState } from 'react';
import { Pressable, Text, TextInput, View, useColorScheme } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../../src/api';
import { colors, layout } from '../../src/theme';
import { t } from '../../src/t';

export default function CreateScreen() {
  const c = colors(useColorScheme());
  const [caption, setCaption] = useState('');
  const [kind, setKind] = useState<'post' | 'moment' | 'loop'>('post');
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function publish() {
    setPending(true);
    setStatus(null);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === 'loop' ? ['videos'] : ['images'],
        quality: 0.9,
        videoMaxDuration: 90,
      });
      if (picked.canceled || !picked.assets[0]) {
        setPending(false);
        return;
      }
      const asset = picked.assets[0];
      const response = await fetch(asset.uri);
      const buffer = await response.arrayBuffer();
      const isVideo = kind === 'loop';
      const mime = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
      const intent = await api.createMediaIntent({
        kind: isVideo ? 'video' : 'image',
        mimeType: mime,
        byteSize: buffer.byteLength,
        purpose: kind === 'moment' ? 'moment' : kind === 'loop' ? 'loop' : 'post',
      });
      await api.uploadMediaBytes(intent.id, buffer, mime);
      const completed = await api.completeMedia(intent.id);
      if (kind === 'loop') {
        const loop = await api.createLoop({
          clips: [
            {
              mediaId: intent.id,
              trimStartMs: 0,
              trimEndMs: completed.durationMs ?? 2000,
              speed: 1,
            },
          ],
          caption,
          authenticity: 'unfiltered',
          visibility: 'public',
          allowAudioReuse: true,
          altText: caption || 'Loop from Tessera mobile',
        });
        setStatus(`Published Loop ${loop.id}`);
      } else if (kind === 'moment') {
        const moment = await api.createMoment({
          segments: [
            {
              mediaId: intent.id,
              altText: caption || 'Moment from Tessera mobile',
              stickers: caption
                ? [{ kind: 'text', x: 0.5, y: 0.82, payload: { text: caption, color: '#F4EDE3', align: 'center' } }]
                : [],
            },
          ],
          visibility: 'public',
        });
        setStatus(`Published Moment ${moment.id}`);
      } else {
        const post = await api.createPost({
          media: [{ id: intent.id, altText: caption || 'Photo from Tessera mobile', filterId: 'none' }],
          caption,
          authenticity: 'unfiltered',
          visibility: 'public',
        });
        setStatus(`Published ${post.id}`);
      }
      setCaption('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not publish');
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, padding: 24, gap: 16 }}>
      <Text style={{ color: c.slate, fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {t('common.phase')} · {t('nav.create')}
      </Text>
      <Text style={{ color: c.textPrimary, fontSize: 22, fontWeight: '600' }}>{t('create.choose')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setKind('post')}
          style={{
            minHeight: layout.touch,
            paddingHorizontal: 16,
            borderRadius: 12,
            justifyContent: 'center',
            backgroundColor: kind === 'post' ? c.accent : c.surfaceMuted,
          }}
        >
          <Text style={{ color: kind === 'post' ? c.textInverse : c.textPrimary }}>{t('create.post')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setKind('moment')}
          style={{
            minHeight: layout.touch,
            paddingHorizontal: 16,
            borderRadius: 12,
            justifyContent: 'center',
            backgroundColor: kind === 'moment' ? c.accent : c.surfaceMuted,
          }}
        >
          <Text style={{ color: kind === 'moment' ? c.textInverse : c.textPrimary }}>{t('create.moment')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setKind('loop')}
          style={{
            minHeight: layout.touch,
            paddingHorizontal: 16,
            borderRadius: 12,
            justifyContent: 'center',
            backgroundColor: kind === 'loop' ? c.accent : c.surfaceMuted,
          }}
        >
          <Text style={{ color: kind === 'loop' ? c.textInverse : c.textPrimary }}>{t('create.loop')}</Text>
        </Pressable>
      </View>
      <Text style={{ color: c.textSecondary }}>
        {kind === 'moment' ? t('create.momentHint') : kind === 'loop' ? t('create.loopHint') : t('create.pick')}
      </Text>
      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder={t('create.caption')}
        placeholderTextColor={c.textSecondary}
        style={{
          minHeight: 88,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: layout.radius,
          padding: 12,
          color: c.textPrimary,
        }}
        multiline
      />
      <Pressable
        onPress={() => void publish()}
        disabled={pending}
        style={{
          minHeight: layout.touch,
          borderRadius: 12,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: c.textInverse }}>{pending ? t('create.processing') : t('common.publish')}</Text>
      </Pressable>
      {status ? <Text style={{ color: c.textSecondary }}>{status}</Text> : null}
    </View>
  );
}
