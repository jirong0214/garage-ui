import { Image, type ImageSource } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ServerProfile } from '@/features/server/configuration/server-model';
import { colors } from '@/shared/ui/theme';

import { authenticatedThumbnailSource } from './object-preview-api';
import { previewKind } from './preview-kind';

export function ObjectThumbnail({
  profile,
  bucket,
  objectKey,
  contentType,
  version,
}: {
  profile: ServerProfile;
  bucket: string;
  objectKey: string;
  contentType?: string;
  version?: string;
}) {
  const [source, setSource] = useState<ImageSource | null>(null);
  const supported = previewKind(contentType, objectKey) === 'image';

  useEffect(() => {
    let active = true;
    if (!supported) return;
    authenticatedThumbnailSource(profile, bucket, objectKey, version)
      .then((nextSource) => {
        if (active) setSource(nextSource);
      })
      .catch(() => {
        if (active) setSource(null);
      });
    return () => {
      active = false;
    };
  }, [bucket, objectKey, profile, supported, version]);

  if (!source) return <View style={styles.placeholder} />;
  return (
    <Image
      accessibilityLabel=""
      cachePolicy="memory-disk"
      contentFit="cover"
      recyclingKey={`${bucket}:${objectKey}`}
      source={source}
      style={styles.image}
      transition={150}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.fill },
  placeholder: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.fill },
});
