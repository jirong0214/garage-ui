import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { UploadCandidate } from '../Models/upload-candidate';

export async function pickUploadDocuments(): Promise<UploadCandidate[]> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
    type: '*/*',
  });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => ({
    id: candidateId('document', index),
    sourceUri: asset.uri,
    fileName: asset.name,
    contentType: asset.mimeType || 'application/octet-stream',
    size: safeSize(asset.size),
  }));
}

export async function pickUploadMedia(): Promise<UploadCandidate[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: true,
    mediaTypes: ['images', 'videos'],
    orderedSelection: true,
    quality: 1,
    selectionLimit: 0,
    shouldDownloadFromNetwork: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => ({
    id: candidateId('media', index),
    sourceUri: asset.uri,
    fileName: asset.fileName || fallbackMediaName(asset.type, index),
    contentType: asset.mimeType || fallbackMediaType(asset.type),
    size: safeSize(asset.fileSize),
  }));
}

export async function captureUploadPhoto(): Promise<UploadCandidate[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Camera access is required.');

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    cameraType: ImagePicker.CameraType.back,
    mediaTypes: ['images'],
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => ({
    id: candidateId('camera', index),
    sourceUri: asset.uri,
    fileName: asset.fileName || `IMG_${Date.now()}.jpg`,
    contentType: asset.mimeType || 'image/jpeg',
    size: safeSize(asset.fileSize),
  }));
}

function candidateId(source: string, index: number): string {
  return `${source}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function fallbackMediaName(
  type: ImagePicker.ImagePickerAsset['type'],
  index: number,
): string {
  const extension = type === 'video' ? 'mov' : 'jpg';
  return `Garage_Upload_${Date.now()}_${index + 1}.${extension}`;
}

function fallbackMediaType(type: ImagePicker.ImagePickerAsset['type']): string {
  return type === 'video' ? 'video/quicktime' : 'image/jpeg';
}

function safeSize(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
