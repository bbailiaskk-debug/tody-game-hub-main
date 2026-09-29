/**
 * The sounds the chat makes.
 *
 * Kept apart from the view so the rules about *when* a sound is wanted can be
 * asserted on their own: the module owns the files and the playback, the caller
 * owns the decision.
 *
 * Both files live in `public/звук на чята`, the same place the rest of the
 * site's own audio lives. The folder name is percent encoded for the same reason
 * the sticker and music folders are: the names carry non-ascii characters.
 */

const INCOMING_FILE = "universfield-message-notification-124467.mp3";
/** Synthesised by `scripts/generate-chat-send-sound.mjs`. */
const SENT_FILE = "изпратено.wav";

const url = (file: string) => `/звук на чята/${encodeURIComponent(file)}`;

/**
 * Quiet on purpose. A message is worth a nudge, not a jump: these sit under a
 * conversation instead of over it. Sending is quieter still, because the user
 * already knows they pressed the button.
 */
const VOLUME = { incoming: 0.4, sent: 0.3 };

const players = new Map<string, HTMLAudioElement>();

const element = (file: string, volume: number) => {
  if (typeof Audio === "undefined") return null;
  const cached = players.get(file);
  if (cached) return cached;
  const audio = new Audio(url(file));
  audio.preload = "auto";
  audio.volume = volume;
  players.set(file, audio);
  return audio;
};

/**
 * Plays one of the sounds. Never throws and never queues: a second message while
 * the first is still sounding restarts it rather than piling up.
 */
const play = (file: string, volume: number) => {
  const node = element(file, volume);
  if (!node) return;
  try {
    node.currentTime = 0;
    const started = node.play() as Promise<void> | undefined;
    void started?.catch(() => undefined);
  } catch {
    // Autoplay is blocked until a gesture; the message is still in the thread.
  }
};

/** A message arrived in a conversation the user is not looking at. */
export const playMessageSound = () => play(INCOMING_FILE, VOLUME.incoming);

/** The user sent something, so the thread answers them. */
export const playSendSound = () => play(SENT_FILE, VOLUME.sent);

let primed = false;

/**
 * Browsers refuse to play anything before the user has interacted with the page,
 * so the first gesture is spent on a silent playback of each sound. Without it
 * the first real notification would be swallowed.
 */
export const unlockChatSound = () => {
  if (primed || typeof window === "undefined") return;
  const nodes = [element(INCOMING_FILE, VOLUME.incoming), element(SENT_FILE, VOLUME.sent)];
  if (nodes.some((node) => !node)) return;
  primed = true;

  for (const node of nodes) {
    if (!node) continue;
    const restore = node.volume;
    try {
      node.volume = 0;
      const started = node.play() as Promise<void> | undefined;
      const settle = () => {
        node.pause();
        node.currentTime = 0;
        node.volume = restore;
      };
      node.addEventListener("ended", settle, { once: true });
      void started?.catch(settle);
    } catch {
      node.volume = restore;
    }
  }
};

/**
 * A message the user is already reading does not need a sound: they are looking
 * at it, and the bubble appearing is the notification.
 */
export const shouldAnnounce = (input: {
  chatId: string;
  activeChatId: string | null;
  visible: boolean;
}) => input.chatId !== input.activeChatId || !input.visible;
