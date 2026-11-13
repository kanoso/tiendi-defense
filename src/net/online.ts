import { startCloudSync } from '../progress/cloudSync';
import { coopServerBase, serverFeatures } from './CoopLink';

// What the server offers, asked once when the game loads, whatever the first
// screen is: a page opened straight into a game must still keep its progress.

type Features = NonNullable<Awaited<ReturnType<typeof serverFeatures>>>;

let known: Promise<Features | null> | null = null;

/** The server's features, or null if none answers. A failed check is tried again next time. */
export function onlineFeatures(): Promise<Features | null> {
  if (known) return known;
  const asking = serverFeatures(coopServerBase()).then((features) => {
    if (!features) known = null;
    else if (features.accounts) startCloudSync(coopServerBase());
    return features;
  });
  known = asking;
  return asking;
}
