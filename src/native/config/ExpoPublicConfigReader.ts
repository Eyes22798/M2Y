import Constants from 'expo-constants';

import type { PublicConfigReader, PublicConfigResult } from '@/application/config/contracts';
import { parsePublicRuntimeConfig } from '@/application/config/parse-public-config';

/**
 * Reads only the public Expo config. Server secrets, signing material and database keys are never
 * part of `extra`, so nothing read here is sensitive; the value still has to be validated because a
 * mis-built binary can otherwise point the pairing client at an unintended host.
 */
export class ExpoPublicConfigReader implements PublicConfigReader {
  readPublicConfig(): PublicConfigResult {
    return parsePublicRuntimeConfig(Constants.expoConfig?.extra);
  }
}
