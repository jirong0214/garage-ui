import * as SecureStore from 'expo-secure-store';

import { AuthStorage } from './auth-storage-core';

export const authStorage = new AuthStorage(SecureStore);
