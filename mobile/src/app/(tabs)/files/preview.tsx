import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '@/features/auth/session/session-store';
import {
  fetchObjectMetadata,
  fetchTextPreview,
  mintObjectPreviewUrl,
} from '@/features/storage/object-preview/object-preview-api';
import { previewKind } from '@/features/storage/object-preview/preview-kind';
import { enqueueObjectDownload } from '@/features/transfers/download/Services/download-coordinator';
import { InlineError, PrimaryButton } from '@/shared/ui/components';
import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

export default function ObjectPreviewScreen() {
  const { bucket, key } = useLocalSearchParams<{ bucket: string; key: string }>();
  const profile = useSessionStore((state) => state.server);
  const queryClient = useQueryClient();
  const metadata = useQuery({
    queryKey: ['object-metadata', profile?.id, bucket, key],
    queryFn: () => fetchObjectMetadata(profile!, bucket, key),
    enabled: Boolean(profile && bucket && key),
  });
  const kind = previewKind(metadata.data?.content_type, key);
  const requestKey = `${profile?.id ?? ''}:${bucket}:${key}:${kind}`;
  const [previewState, setPreviewState] = useState<{
    requestKey: string;
    url: string | null;
    error: string | null;
  } | null>(null);
  const currentPreviewState = previewState?.requestKey === requestKey ? previewState : null;
  const download = useMutation({
    mutationFn: () =>
      enqueueObjectDownload(profile!, bucket, key, metadata.data?.size ?? null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transfers', profile?.id] });
      router.push('/(tabs)/transfers');
    },
  });

  useEffect(() => {
    let active = true;
    if (!profile || !metadata.isSuccess || kind === 'text' || kind === 'unsupported') return;
    mintObjectPreviewUrl(profile, bucket, key)
      .then((url) => {
        if (active) setPreviewState({ requestKey, url, error: null });
      })
      .catch((error) => {
        if (active) {
          setPreviewState({
            requestKey,
            url: null,
            error: error instanceof Error ? error.message : t('previewFailed'),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [bucket, key, kind, metadata.isSuccess, profile, requestKey]);

  return (
    <>
      <Stack.Screen options={{ title: key.split('/').at(-1) ?? key }} />
      <View style={styles.screen}>
        {metadata.isPending ? <ActivityIndicator style={styles.centered} /> : null}
        {metadata.isError ? <InlineError message={metadata.error.message} onRetry={() => void metadata.refetch()} /> : null}
        {currentPreviewState?.error ? <InlineError message={currentPreviewState.error} /> : null}
        {metadata.data ? (
          <>
            <View style={styles.preview}>
              <PreviewContent
                bucket={bucket}
                kind={kind}
                objectKey={key}
                previewUrl={currentPreviewState?.url ?? null}
              />
            </View>
            <Metadata object={metadata.data} bucket={bucket} />
            <PrimaryButton
              disabled={!profile}
              label={t('download')}
              loading={download.isPending}
              onPress={() => download.mutate()}
            />
            {download.isError ? (
              <InlineError
                message={
                  download.error instanceof Error
                    ? download.error.message
                    : t('transferActionFailed')
                }
              />
            ) : null}
          </>
        ) : null}
      </View>
    </>
  );
}

function PreviewContent({
  bucket,
  objectKey,
  kind,
  previewUrl,
}: {
  bucket: string;
  objectKey: string;
  kind: ReturnType<typeof previewKind>;
  previewUrl: string | null;
}) {
  const profile = useSessionStore((state) => state.server);
  if (kind === 'text' && profile) {
    return <TextPreview profileId={profile.id} bucket={bucket} objectKey={objectKey} />;
  }
  if (!previewUrl && kind !== 'unsupported') return <ActivityIndicator />;
  if (kind === 'image' && previewUrl) {
    return <Image accessibilityLabel={objectKey} cachePolicy="none" contentFit="contain" source={previewUrl} style={styles.media} />;
  }
  if (kind === 'video' && previewUrl) return <VideoPreview url={previewUrl} />;
  if (kind === 'audio' && previewUrl) return <AudioPreview url={previewUrl} />;
  if (kind === 'pdf' && previewUrl) {
    return <PrimaryButton label={t('openPdf')} onPress={() => void WebBrowser.openBrowserAsync(previewUrl)} />;
  }
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackIcon}>▤</Text>
      <Text style={styles.secondary}>{t('previewUnavailable')}</Text>
    </View>
  );
}

function VideoPreview({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView contentFit="contain" fullscreenOptions={{ enable: true }} nativeControls player={player} style={styles.media} />;
}

function AudioPreview({ url }: { url: string }) {
  const player = useAudioPlayer(url, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  return (
    <View style={styles.audio}>
      <Text style={styles.fallbackIcon}>♫</Text>
      <Text style={styles.secondary}>{formatDuration(status.currentTime)} / {formatDuration(status.duration)}</Text>
      <Pressable accessibilityRole="button" onPress={() => (status.playing ? player.pause() : player.play())} style={styles.play}>
        <Text style={styles.playText}>{status.playing ? t('pause') : t('play')}</Text>
      </Pressable>
    </View>
  );
}

function TextPreview({ profileId, bucket, objectKey }: { profileId: string; bucket: string; objectKey: string }) {
  const profile = useSessionStore((state) => state.server);
  const query = useQuery({
    queryKey: ['text-preview', profileId, bucket, objectKey],
    queryFn: () => fetchTextPreview(profile!, bucket, objectKey),
    enabled: Boolean(profile),
    staleTime: 0,
    gcTime: 0,
  });
  if (query.isPending) return <ActivityIndicator />;
  if (query.isError) return <InlineError message={query.error.message} onRetry={() => void query.refetch()} />;
  return (
    <ScrollView contentContainerStyle={styles.textContent}>
      {query.data?.truncated ? <Text style={styles.truncated}>{t('previewTruncated')}</Text> : null}
      <Text selectable style={styles.code}>{query.data?.text}</Text>
    </ScrollView>
  );
}

function Metadata({ object, bucket }: { object: { key?: string; content_type?: string; size?: number; etag?: string; last_modified?: string }; bucket: string }) {
  return (
    <View style={styles.metadata}>
      <Text style={styles.metadataTitle}>{t('details')}</Text>
      <Text selectable style={styles.metadataValue}>{object.key}</Text>
      <Text style={styles.secondary}>{object.content_type ?? t('unknownType')} · {formatBytes(object.size ?? 0)}</Text>
      <Text style={styles.secondary}>{bucket}{object.last_modified ? ` · ${new Date(object.last_modified).toLocaleString()}` : ''}</Text>
      {object.etag ? <Text numberOfLines={1} selectable style={styles.secondary}>ETag {object.etag}</Text> : null}
    </View>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 14, backgroundColor: colors.background },
  centered: { flex: 1 },
  preview: {
    flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface,
  },
  media: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', gap: 12, padding: 24 },
  fallbackIcon: { color: colors.secondaryLabel, fontSize: 52 },
  secondary: { color: colors.secondaryLabel, fontSize: 14, lineHeight: 20 },
  audio: { alignItems: 'center', gap: 14 },
  play: { minWidth: 110, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accent },
  playText: { color: 'white', fontSize: 17, fontWeight: '600' },
  textContent: { padding: 16 },
  truncated: { color: colors.secondaryLabel, fontSize: 13, marginBottom: 10 },
  code: { color: colors.label, fontFamily: 'Menlo', fontSize: 13, lineHeight: 19 },
  metadata: { padding: 14, gap: 5, borderRadius: 14, backgroundColor: colors.surface },
  metadataTitle: { color: colors.label, fontSize: 17, fontWeight: '600' },
  metadataValue: { color: colors.label, fontSize: 14 },
});
