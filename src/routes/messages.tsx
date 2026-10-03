import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronRight,
  BellOff,
  Braces,
  Check,
  CheckCheck,
  Cloud,
  CloudOff,
  CornerUpLeft,
  Download,
  EyeOff,
  FileText,
  Forward,
  Gamepad2,
  Hash,
  HeadphoneOff,
  Headphones,
  ImageIcon,
  Info,
  Loader2,
  LogIn,
  Menu,
  LogOut,
  MonitorDown,
  MessageSquarePlus,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  MoreVertical,
  Palette,
  Paperclip,
  Pencil,
  Phone,
  PhoneOff,
  Pin,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Repeat,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Smile,
  SmilePlus,
  Smartphone,
  Sticker,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
  Link2Icon,
  ExternalLink,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { copy, useSiteSettings } from "../components/site/theme";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  downloadText,
  exportAllAsJson,
  exportChatAsJson,
  exportChatAsText,
  exportFileName,
} from "../lib/chat-export";
import {
  playMessageSound,
  playSendSound,
  shouldAnnounce,
  unlockChatSound,
} from "../lib/chat-sound";
import type { MediaDeviceInfoLike } from "../lib/call-media";
import { compressImageFile } from "../lib/image-utils";
import {
  readPersistedAuthSession,
  storageSet,
  writePersistedUserProfile,
} from "../lib/local-persistence";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  filesTravelInBucket,
  callDuration,
  callCandidates,
  canManageMessage,
  createMessageId,
  initialsForName,
  isOnlineAt,
  liveVoicePresences,
  MAX_NAME_LENGTH,
  ownsGuild,
  guildView,
  reactionSummary,
  unreadIn,
  visibleMessages,
  type CallCandidate,
  type CallParticipant as CallMember,
  type CallState,
  type ScreenSurface,
  type CallSummary,
  type ChatContact,
  type ChatMessage,
  type DirectoryEntry,
  type FriendRequest,
  type FriendsSnapshot,
  type GuildView,
  type GuildVoiceChannel,
  type IncomingAttachment,
  type MessageAttachment,
  type MessageChat,
  type MessagesProfile,
  type PresenceStatus,
  type VoicePresence,
  type VoiceRoster,
} from "../lib/messages-protocol";
import {
  DEFAULT_SCREEN_QUALITY,
  SCREEN_QUALITIES,
  screenQualityLabel,
  type ScreenQuality,
} from "../lib/call-media";
import {
  CHAT_THEMES,
  CHAT_THEME_INK,
  chatThemeById,
  chatThemeGradient,
  chatThemeVariables,
  DEFAULT_CHAT_THEME_ID,
  readChatThemeId,
  writeChatThemeId,
} from "../lib/chat-themes";
import {
  attachmentUrl,
  messagesStore,
  type UploadProgressRow,
  type VoiceRoom,
} from "../lib/messages-store";
import { timelineFor, timelineLast, type TimelineCall } from "../lib/messages-timeline";
import { isStickerText, linkHost, messageLinks, splitMessageLinks } from "../lib/messages-richtext";
import { ANDROID_DOWNLOAD, PROGRAM_DOWNLOAD } from "../lib/program-download";
import { seoHead } from "../lib/seo";
import {
  giphyStickerText,
  giphyStickerUrlFromText,
  stickerById,
  stickerFromText,
  stickerIdFromText,
} from "../lib/stickers";
import {
  giphyConfigured,
  searchGiphy,
  type GiphyCollection,
  type GiphySticker,
} from "../lib/giphy";

export const Route = createFileRoute("/messages")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !readPersistedAuthSession()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => {
    const seo = seoHead({
      path: "/messages",
      title: "Съобщения",
      description: "Чатове и съобщения на Todor Khristov Gaming.",
      noindex: true,
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: MessagesPage,
});

type Lang = "bg" | "en" | "zh";

type MessagesCopy = {
  title: string;
  chatsTab: string;
  contactsTab: string;
  search: string;
  searchEmpty: string;
  searchEmptyContacts: string;
  newChat: string;
  newContact: string;
  activeNow: string;
  lastSeenOffline: string;
  placeholder: string;
  send: string;
  noChats: string;
  noChatsHint: string;
  signOut: string;
  today: string;
  yesterday: string;
  pinned: string;
  muted: string;
  back: string;
  typing: string;
  you: string;
  changePhoto: string;
  removePhoto: string;
  editName: string;
  editNameTitle: string;
  editNameHint: string;
  editNamePlaceholder: string;
  nameRequired: string;
  nameTooLong: string;
  nameSaved: string;
  openMenu: string;
  menuTitle: string;
  noContacts: string;
  contactName: string;
  contactNamePlaceholder: string;
  contactEmail: string;
  contactEmailPlaceholder: string;
  contactEmailHint: string;
  contactAbout: string;
  contactAboutPlaceholder: string;
  contactAccent: string;
  contactAvatar: string;
  save: string;
  cancel: string;
  delete: string;
  deleteContact: string;
  deleteContactHint: string;
  confirmDelete: string;
  writeMessage: string;
  emoji: string;
  attachImage: string;
  attachFile: string;
  /** Shown over the thread while files are held over it, waiting to be let go. */
  dropFilesHere: string;
  /** Under that, what letting go will do. */
  dropFilesHint: string;
  imageTooBig: (max: string) => string;
  fileTooBig: (max: string) => string;
  /**
   * A file that reached the conversation but has no bytes behind it.
   *
   * It happens when the two ends disagree about how large a file may be — an old
   * build sending to a new one, or a cap moved between the two. The file is kept as
   * a name so the message still says what it meant to carry, and this is what says
   * that it cannot be opened, because a tile that does nothing is worse than one
   * that explains itself.
   */
  attachmentMissing: string;
  fileUnreadable: string;
  /** A file was picked, but the connection gave out before it finished going up. */
  uploadFailed: string;
  /** This deployment has nowhere to put a file, which retrying will not fix. */
  uploadUnavailable: string;
  /** Says how far along the file is, and what it is called. */
  uploadLabel: (sent: string, total: string) => string;
  storageFull: string;
  emojiCategories: Record<string, string>;
  unlockTitle: string;
  unlockBody: string;
  /** The link under the unlock button, to the site's own sign-in. */
  siteSignIn: string;
  siteSignInHint: string;
  unlockEmail: string;
  unlockPassword: string;
  unlockSubmit: string;
  unlockInvalid: string;
  syncing: string;
  live: string;
  offline: string;
  notLinked: string;
  removeChat: string;
  retry: string;
  syncFailedTitle: string;
  syncFailedBody: string;
  continueOffline: string;
  localModeTitle: string;
  localModeBody: string;
  localModeBadge: string;
  tryCloudAgain: string;
  queuedLocally: string;
  friendsTab: string;
  findPeople: string;
  findPeoplePlaceholder: string;
  findPeopleHint: string;
  noPeopleFound: string;
  addFriend: string;
  requestSent: string;
  alreadyFriend: string;
  requestPending: string;
  incomingRequests: string;
  outgoingRequests: string;
  myFriends: string;
  noFriends: string;
  noRequests: string;
  accept: string;
  decline: string;
  removeFriend: string;
  friendRequestFrom: string;
  friendsOffline: string;
  switchAccount: string;
  stickers: string;
  gifs: string;
  giphySearchLabel: string;
  stickerSearchPlaceholder: string;
  stickerTapToSend: string;
  stickerLabel: string;
  stickerMissing: string;
  stickerLoading: string;
  stickerEmpty: string;
  stickerNoKey: string;
  messageMenu: string;
  /** The first row of the menu, which opens the emoji rather than doing anything. */
  messageReact: string;
  /** What the emoji buttons are, for a reader who cannot see them. */
  messageReactPick: string;
  messageEdit: string;
  messageEditSave: string;
  messageEditCancel: string;
  messageEditHint: string;
  messageDelete: string;
  messageDeleteConfirm: string;
  messageShare: string;
  messageShared: string;
  messageShareFailed: string;
  /**
   * The rows that are drawn but do nothing yet.
   *
   * Reply, forward, a thread of its own, unpinning, apps, marking unread and copying
   * a link to one message are all things the menu offers and the product does not do
   * yet. They are named here rather than hidden, because a menu that reads as though
   * replying to a message were impossible is a worse answer than one that shows the
   * row and shows it greyed.
   */
  messageReply: string;
  messageForward: string;
  messageThread: string;
  messageUnpin: string;
  messageApps: string;
  messageUnread: string;
  messageCopyLink: string;
  /** Says the rows are not built yet, for a reader who tries one anyway. */
  messageNotYet: string;
  messageEdited: string;
  messageDeleted: string;
  messageDeletedBy: string;
  messageActionFailed: string;
  callAudio: string;
  callVideo: string;
  callIncoming: string;
  callIncomingVideo: string;
  callAccept: string;
  callDecline: string;
  callConnecting: string;
  callRinging: string;
  callActive: string;
  callEnded: string;
  callEndedDecline: string;
  callEndedBusy: string;
  callEndedFailed: string;
  callMute: string;
  callUnmute: string;
  /** Muting the speakers, which is not the same switch as the microphone. */
  callDeafen: string;
  callUndeafen: string;
  callLeave: string;
  /** The icon rail's own name, and the way back to the site. */
  navMessages: string;
  /** The channel column's two groups, and the stand-in for a call that is not up. */
  channelText: string;
  channelVoice: string;
  channelVoiceIdle: string;
  /** The chat fills the window, so it carries its own way back to the site. */
  backToSite: string;
  railInCall: string;
  railFriends: string;
  railOnline: string;
  railPeople: string;
  railEmpty: string;
  callCameraOff: string;
  callCameraOn: string;
  callShareScreen: string;
  callStopShare: string;
  callSettings: string;
  callMore: string;
  callEnd: string;
  callHangup: string;
  callInvite: string;
  callInviteHint: string;
  callInviteTitle: string;
  /** Said after somebody has been brought into a server, and when it did not work. */
  callInviteSent: string;
  callInviteFailed: string;
  callActivity: string;
  callActivityHint: string;
  callMicDevice: string;
  // ---------------------------------------------------------- servers
  /** The rail of servers, and the button that adds one. */
  servers: string;
  newServer: string;
  serverNamePlaceholder: string;
  createServer: string;
  serverCreated: string;
  serverRename: string;
  serverDelete: string;
  serverDeleteConfirm: string;
  serverDeleteConfirmTitle: string;
  serverDeleteConfirmBody: (name: string) => string;
  serverDeleteFailed: string;
  serverDeleted: string;
  serverRenamed: string;
  serverRenameFailed: string;
  serverSettings: string;
  /** The two channel groups, which the screenshot puts one under the other. */
  textChannels: string;
  voiceChannels: string;
  /** Said on the stage while nobody in the channel is sharing anything. */
  voiceIdleStage: string;
  addChannel: string;
  channelNamePlaceholder: string;
  inviteToChannel: string;
  /** The panel pinned above the account bar, saying what this device is on. */
  voiceConnected: string;
  voiceDisconnected: string;
  voiceDeviceLabel: string;
  leaveVoice: string;
  /** Shown on somebody the server owner has silenced. */
  serverMuted: string;
  serverMutedBy: string;
  copyChannelInvite: string;
  channelEmpty: string;
  noServers: string;
  noServersHint: string;
  callCameraDevice: string;
  /** The two labelled switches under a connected voice panel, as the design has them. */
  voicePanelVideo: string;
  voicePanelScreen: string;
  callUnsupported: string;
  callUnknown: string;
  callMicOn: string;
  callMicMuted: string;
  /** Their audio has arrived, which is not the same as their switch being on. */
  callVoiceConnected: string;
  callVoiceWaiting: string;
  /** Reads out with the clock beside it, for a screen reader. */
  callElapsed: string;
  /** The ringing clock, which is a different number from the call's own. */
  callRingingFor: string;
  callPeople: string;
  callScreenLabel: string;
  /** The red mark on a screen that is arriving right now. */
  callScreenLive: string;
  /** The two choices the browser's own screen picker does not offer. */
  callStreamQuality: string;
  callStreamLessVideo: string;
  /** The square in the corner that says who is standing in the channel. */
  callInChannel: string;
  callScreenLabelWindow: string;
  callScreenLabelTab: string;
  callShareFailed: string;
  callInviteMore: string;
  callInviteCount: string;
  callInviteEmpty: string;
  callInviteEmptyHint: string;
  callInviteWaiting: string;
  callInviteWaitingHint: string;
  /** Shown instead of an address, for somebody this account cannot reach. */
  callInviteNoAddress: string;
  /** Said when a call cannot be placed at all, and why. */
  callNoCloud: string;
  /** The way back to the room, while a conversation is in the middle of the screen. */
  showRoom: string;
  callNoAddress: string;
  callRingingHint: string;
  callLogOutgoing: string;
  callLogIncoming: string;
  callLogCompleted: string;
  callLogMissed: string;
  callLogCancelled: string;
  callLogBusy: string;
  callLogFailed: string;
  callLogRinging: string;
  /** What the thread says about a call that is on somebody right now. */
  callLogRingingTo: string;
  /** And when that call has been moved to the next name on the list. */
  callLogRingingMoved: string;
  callLogIncomingFrom: string;
  callLogConnecting: string;
  callLogActive: string;
  callLogAnswer: string;
  callLogDecline: string;
  callLogCancel: string;
  callLogHangup: string;
  callLogInIncomingTitle: string;
  callLogDuration: string;
  callInputVolume: string;
  callInputVolumeHint: string;
  callTestStart: string;
  callTestStop: string;
  callTestPlay: string;
  chatSettings: string;
  chatThemes: string;
  chatThemesHint: string;
  downloadApp: string;
  downloadAppHint: string;
  downloadAppWindows: string;
  downloadAppAndroid: string;
  downloadAppOther: string;
  downloadAppInApp: string;
  chatThemeDefault: string;
  chatThemeReset: string;
  exportText: string;
  exportTextHint: string;
  exportJson: string;
  exportJsonHint: string;
  exportAll: string;
  exportAllHint: string;
  exportAllFile: string;
  exportDone: string;
  statusOnline: string;
  statusAway: string;
  statusBusy: string;
  statusInvisible: string;
  statusSaveFailed: string;
  // ------------------------------------------------------- home column
  /** The search pinned to the very top, which finds a conversation or starts one. */
  findOrStart: string;
  /** The four shortcuts under the search, as the design has them. */
  navChats: string;
  navContacts: string;
  navFriends: string;
  navGames: string;
  /** The heading over the conversation list, which changes with the list under it. */
  directMessages: string;
  /** The heading over the contact list and the friend list. */
  contactsHeading: string;
  friendsHeading: string;
  // ------------------------------------------------------ friends view
  friendsTitle: string;
  /** The three tabs over the friends, which are three different questions. */
  friendsTabOnline: string;
  friendsTabAll: string;
  friendsTabPending: string;
  addFriendTitle: string;
  friendsSearch: string;
  friendsSectionOnline: string;
  friendsSectionOffline: string;
  friendsSectionIncoming: string;
  friendsSectionOutgoing: string;
  friendsEmptyOnline: string;
  friendsEmptyAll: string;
  friendsEmptyPending: string;
  /** The button on a friend row, which opens the conversation with them. */
  messageThem: string;
  /** Shown next to a friend's name when the account is not a person. */
  friendBotBadge: string;
  friendPendingBadge: string;
  // ------------------------------------------------------- active now
  activeNowTitle: string;
  activeNowQuietTitle: string;
  activeNowQuietBody: string;
  // -------------------------------------------------------- user widget
  userWidgetMic: string;
  micMute: string;
  micUnmute: string;
  userWidgetCamera: string;
  userWidgetHeadset: string;
  userWidgetSettings: string;
  userWidgetMenu: string;
  /**
   * The small arrow beside the invitation, which leaves the room's view for the
   * chat while staying in the channel.
   */
  goToChat: string;
  /** The two arrows on a share, and what they are choosing between. */
  sharePrevious: string;
  shareNext: string;
  shareWhoseScreen: string;
  /** Said after a new server, and about who walked into it with you. */
  serverCreateFailed: string;
  serverFriendsJoined: (count: number) => string;
  serverFriendsPartial: (added: number, wanted: number) => string;
};

const messagesCopy: Record<Lang, MessagesCopy> = {
  bg: {
    title: "СЪОБЩЕНИЯ",
    chatsTab: "Чатове",
    contactsTab: "Контакти",
    search: "Търси чат или съобщение",
    searchEmpty: "Няма намерени разговори",
    searchEmptyContacts: "Няма намерени контакти",
    newChat: "Нов чат",
    newContact: "Нов контакт",
    activeNow: "активен сега",
    lastSeenOffline: "извън линия",
    placeholder: "Напиши съобщение",
    send: "Изпрати",
    noChats: "Избери разговор",
    noChatsHint: "Отвори чат отляво или започни нов разговор.",
    signOut: "Изход от облака",
    today: "Днес",
    yesterday: "Вчера",
    pinned: "Закрепен",
    muted: "Изключени звуци",
    back: "Обратно към чатовете",
    typing: "пише…",
    you: "Ти",
    changePhoto: "Смени снимката",
    removePhoto: "Премахни снимката",
    editName: "Редактирай името",
    editNameTitle: "Твоето име",
    editNameHint: "Това е името, което останалите виждат в чата.",
    editNamePlaceholder: "Име",
    nameRequired: "Въведи име",
    nameTooLong: "Името е твърде дълго — най-много 80 знака",
    nameSaved: "Името е запазено",
    openMenu: "Отвори менюто",
    menuTitle: "Меню",
    noContacts: "Още няма контакти. Добави първия си приятел.",
    contactName: "Име",
    contactNamePlaceholder: "Например: Нелка",
    contactEmail: "Имейл на акаунта",
    contactEmailPlaceholder: "nelka@example.com",
    contactEmailHint: "С имейл контактът се синхронизира между всичките ти устройства.",
    contactAbout: "Статус",
    contactAboutPlaceholder: "С какво се занимаваш?",
    contactAccent: "Цвят",
    contactAvatar: "Профилна снимка",
    save: "Запази",
    cancel: "Отказ",
    delete: "Изтрий",
    deleteContact: "Изтрий контакт",
    deleteContactHint: "Контактът ще бъде изтрит заедно с неговите чатове.",
    confirmDelete: "Сигурен ли си?",
    writeMessage: "Напиши съобщение",
    emoji: "Емотикони",
    attachImage: "Добави снимка",
    attachFile: "Добави файл",
    dropFilesHere: "Пусни файловете тук",
    dropFilesHint: "Ще се добавят към съобщението.",
    imageTooBig: (max) => `Снимката е твърде голяма (макс. ${max}).`,
    fileTooBig: (max) => `Файлът е твърде голям (макс. ${max}).`,
    attachmentMissing: "Файлът не можа да се запази.",
    fileUnreadable: "Файлът не можа да бъде прочетен.",
    uploadFailed: "Файлът не можа да бъде изпратен. Опитайте отново.",
    uploadUnavailable: "Изпращането на файлове не е настроено на този сървър.",
    uploadLabel: (sent, total) => `Изпращане на файл: ${sent} от ${total}`,
    storageFull: "Съобщението не се запази в облака.",
    emojiCategories: {
      smileys: "Усмивки",
      gestures: "Ръце",
      hearts: "Сърца",
      objects: "Неща",
      nature: "Природа",
      symbols: "Символи",
    },
    unlockTitle: "Отключи синхронизацията",
    unlockBody:
      "Обикновено влизането в сайта е достатъчно. Потвърди паролата си само ако сесията за съобщения е изтекла или браузърът е блокирал бисквитките.",
    unlockEmail: "Имейл",
    unlockPassword: "Парола",
    unlockSubmit: "Отключи",
    unlockInvalid: "Невалиден имейл или парола.",
    siteSignIn: "Вход в акаунта",
    siteSignInHint: "Влез през сайта, ако вече имаш акаунт.",
    syncing: "Синхронизиране…",
    live: "Свързан",
    offline: "Няма връзка",
    notLinked: "само на това устройство",
    removeChat: "Изтрий чата",
    retry: "Опитай пак",
    syncFailedTitle: "Съобщенията не можаха да се заредят",
    syncFailedBody: "Облакът не отговори. Провери връзката и опитай пак.",
    continueOffline: "Продължи без връзка",
    localModeTitle: "Работиш без връзка",
    localModeBody:
      "Съобщенията се пазят само на това устройство. Когато връзката се върне, ще се качат в облака автоматично.",
    localModeBadge: "без връзка",
    tryCloudAgain: "Опитай облака пак",
    queuedLocally: "чакат качване",
    friendsTab: "Приятели",
    findPeople: "Намери хора",
    findPeoplePlaceholder: "Търси по име или имейл…",
    findPeopleHint: "Въведи поне 2 символа, за да търсиш в сайта.",
    noPeopleFound: "Никой не отговаря на търсенето.",
    addFriend: "Добави приятел",
    requestSent: "Поканата е изпратена",
    alreadyFriend: "Вече сте приятели",
    requestPending: "Поканата е изпратена",
    incomingRequests: "Получени покани",
    outgoingRequests: "Изпратени покани",
    myFriends: "Моите приятели",
    noFriends: "Още нямаш приятели. Намери някой горе.",
    noRequests: "Няма чакащи покани.",
    accept: "Приеми",
    decline: "Откажи",
    removeFriend: "Премахни приятел",
    friendRequestFrom: "Иска да те добави като приятел",
    friendsOffline: "Приятелите изискват връзка с облака.",
    switchAccount: "Смени акаунта",
    stickers: "Стикери",
    gifs: "GIF",
    giphySearchLabel: "Търси в Giphy",
    stickerSearchPlaceholder: "Търси в Giphy…",
    stickerTapToSend: "Докосни, за да изпратиш",
    stickerLabel: "Стикер",
    stickerMissing: "Стикерът липсва",
    stickerLoading: "Зареждане…",
    stickerEmpty: "Няма резултати за тази дума",
    stickerNoKey: "Добави Giphy API ключ, за да търсиш стикери",
    messageMenu: "Опции за съобщението",
    messageReact: "Добави реакция",
    messageReactPick: "Избери емоджи",
    messageEdit: "Редактирай",
    messageEditSave: "Запази",
    messageEditCancel: "Отказ",
    messageEditHint: "Enter за запис, Escape за отказ",
    messageDelete: "Изтрий",
    messageDeleteConfirm: "Изтриване на съобщението",
    messageShare: "Сподели текста",
    messageShared: "Текстът е копиран",
    messageShareFailed: "Копирането не е възможно",
    messageReply: "Отговор",
    messageForward: "Препращане",
    messageThread: "Създай тема",
    messageUnpin: "Откачи съобщението",
    messageApps: "Приложения",
    messageUnread: "Маркирай като непрочетено",
    messageCopyLink: "Копирай връзка към съобщението",
    messageNotYet: "Още не е готово",
    messageEdited: "редактирано",
    messageDeleted: "Съобщението е изтрито",
    messageDeletedBy: "Изтрито съобщение",
    messageActionFailed: "Промяната не се запази",
    callAudio: "Гласов разговор",
    callVideo: "Видео разговор",
    callIncoming: "Вика те",
    callIncomingVideo: "Вика те с видео",
    callAccept: "Отговори",
    callDecline: "Откажи",
    callConnecting: "Свързване…",
    callRinging: "Звъни…",
    callActive: "Разговорът е активен",
    callEnded: "Разговорът приключи",
    callEndedDecline: "Поканата е отхвърлена",
    callEndedBusy: "Другияят е зает с разговор",
    callEndedFailed: "Връзката прекъсна",
    callMute: "Заглуши микрофона",
    callUnmute: "Включи микрофона",
    callDeafen: "Заглуши слушалките",
    callUndeafen: "Включи слушалките",
    callLeave: "Напусни обаждането",
    navMessages: "Съобщения",
    channelText: "Текстови канали",
    channelVoice: "Гласов канал",
    channelVoiceIdle: "Свърже се",
    railInCall: "В обаждането",
    railFriends: "Приятели",
    railOnline: "На лини",
    railPeople: "Хора",
    railEmpty: "Още никой няма тук.",
    backToSite: "Обратно към сайта",
    callCameraOff: "Изключи камерата",
    callCameraOn: "Включи камерата",
    callShareScreen: "Сподели екран",
    callStopShare: "Спри споделянето",
    callSettings: "Настройки на устройствата",
    callMore: "Още",
    callEnd: "Затвори",
    callHangup: "Прекъсни разговора",
    callInvite: "Покани в гласов канал",
    callInviteHint: "Избери приятел, за да го поканиш в разговора",
    callInviteTitle: "Покана в разговора",
    callInviteSent: "Добавен е в сървъра. Нека влезе в канала.",
    callInviteFailed: "Не можа да го добавя в сървъра.",
    callActivity: "Избери активност",
    callActivityHint: "Играй заедно, докато разговаряте",
    callMicDevice: "Микрофон",
    servers: "Сървъри",
    newServer: "Нов сървър",
    serverNamePlaceholder: "Име на сървъра",
    createServer: "Създай сървър",
    serverCreated: "Сървърът е създаден",
    serverCreateFailed: "Сървърът не можа да се създаде.",
    serverFriendsJoined: (count) => `${count} приятеля влязоха с теб.`,
    serverFriendsPartial: (added, wanted) =>
      `${added} от ${wanted} приятеля влязоха. Останалите можеш да поканиш от канала.`,
    serverRename: "Преименувай",
    serverDelete: "Изтрий сървъра",
    serverDeleteConfirm: "Да се изтрие ли сървърът заедно с каналите му?",
    serverDeleteConfirmTitle: "Изтриване на сървъра",
    serverDeleteConfirmBody: (name) =>
      `„${name}" и каналите му изчезват за всеки в него. Това не може да се отмени.`,
    serverDeleteFailed: "Сървърът не можа да се изтрие.",
    serverDeleted: "Сървърът е изтрит.",
    serverRenamed: "Сървърът е преименуван.",
    serverRenameFailed: "Името не можа да се смени.",
    serverSettings: "Настройки на сървъра",
    textChannels: "Текстови канали",
    voiceChannels: "Гласови канали",
    addChannel: "Добави канал",
    channelNamePlaceholder: "Име на канала",
    inviteToChannel: "Покана за гласов канал",
    voiceIdleStage: "Никой не споделя в момента. Плочките долу са хората в канала.",
    voiceConnected: "Свързано гласово устройство",
    voiceDisconnected: "Гласов канал",
    voiceDeviceLabel: "Лоби",
    leaveVoice: "Изход от канала",
    serverMuted: "Изключен от собственика на сървъра",
    serverMutedBy: "Изключен от",
    copyChannelInvite: "Копирай покана",
    channelEmpty: "Избери канал",
    noServers: "Няма сървъри",
    noServersHint: "Създай сървър, за да имаш канали и гласов панел.",
    callCameraDevice: "Камера",
    voicePanelVideo: "Видео",
    voicePanelScreen: "Екран",
    callUnsupported: "Браузърът не поддържа разговори",
    callUnknown: "Непознат",
    callMicOn: "Микрофонът е включен",
    callMicMuted: "Микрофонът е заглушен",
    callVoiceConnected: "Свързано гласово устройство",
    callVoiceWaiting: "Гласа още не е свързан",
    callElapsed: "Продължителност:",
    callRingingFor: "Звъни от:",
    callPeople: "В разговора: {count}",
    callScreenLabel: "Споделен екран",
    callScreenLive: "НА ЖИВО",
    callStreamQuality: "Качество на видеото",
    callStreamLessVideo: "По-малко видео = по-гладка връзка",
    callInChannel: "В канала",
    callScreenLabelWindow: "Споделен прозорец",
    callScreenLabelTab: "Споделено разширение",
    callShareFailed: "Споделянето не започна. Разреши достъпа до екрана и опитай пак.",
    callInviteMore: "Добави още някого",
    callInviteCount: "{count} човека могат да се добавят",
    callInviteEmpty: "Още нямаш кого да поканиш",
    callInviteEmptyHint:
      "Показват се приятелите и контактите ти. Добави някой от раздел „Контакти“, за да се появи тук.",
    callInviteWaiting: "покани",
    callInviteWaitingHint: "Изчакват да влязат. Ако някой не отговори, разговорът тече и без него.",
    callInviteNoAddress: "няма адрес за този човек",
    callNoCloud: "Обаждането иска връзка с облака. Включи интернет и влез в профила си.",
    callNoAddress: "Този разговор няма адрес, затова не може да се позвъни.",
    callRingingHint: "Чака се да се включи някой. Можеш да поканиш и други хора.",
    callLogOutgoing: "Изходящо обаждане",
    callLogIncoming: "Входящо обаждане",
    callLogCompleted: "Разговорът приключи",
    callLogMissed: "Пропуснато обаждане",
    callLogCancelled: "Обаждането е отменено",
    callLogBusy: "Зает",
    callLogFailed: "Обаждането не се осъществи",
    callLogRinging: "Звъни",
    /** What the thread says about a call that is on somebody right now. */
    callLogRingingTo: "Звъни се на {name}...",
    /** And what it says when that call has been moved to the next name. */
    callLogRingingMoved: "{was} не отговори. Звъни се на {name}...",
    callLogIncomingFrom: "Идва обаждане от {name}",
    callLogConnecting: "Свързване",
    callLogActive: "Разговорът е активен",
    callLogAnswer: "Отговори",
    callLogDecline: "Откажи",
    callLogCancel: "Откажи обаждането",
    callLogHangup: "Затвори",
    callLogInIncomingTitle: "Входящо обаждане",
    callLogDuration: "Продължителност",
    callInputVolume: "Сила на входа",
    callInputVolumeHint: "Усилването се прилага само в този разговор, не в Windows.",
    callTestStart: "Тествай микрофона",
    callTestStop: "Спри записа",
    callTestPlay: "Пусни записа",
    chatSettings: "Настройки на разговора",
    chatThemes: "Теми",
    chatThemesHint: "Оцветява чата",
    downloadApp: "Изтегли програмата",
    downloadAppHint: "За Windows, с иконица и микрофон",
    downloadAppWindows: "Изтегли за Windows",
    downloadAppAndroid: "Изтегли за Android",
    downloadAppOther: "Изтегли",
    downloadAppInApp: "Вече си в програмата",
    micMute: "Изключи микрофона",
    micUnmute: "Включи микрофона",
    chatThemeDefault: "По подразбиране",
    chatThemeReset: "Върни към стандартната тема",
    exportText: "Запиши като текст",
    exportTextHint: "{count} съобщения в .txt",
    exportJson: "Запиши като JSON",
    exportJsonHint: "Пълните данни в .json",
    exportAll: "Запиши всички разговори",
    exportAllHint: "{count} разговора в един файл",
    exportAllFile: "разговори",
    exportDone: "Файлът е записан на устройството",
    statusOnline: "На линия",
    statusAway: "Не се използва",
    statusBusy: "Не ме безпокой",
    statusInvisible: "Невидим",
    statusSaveFailed: "Статусът не можа да се запази.",
    findOrStart: "Намери или запиши разговор",
    navChats: "Чатове",
    navContacts: "Контакти",
    navFriends: "Приятели",
    navGames: "Игри",
    directMessages: "Директни съобщения",
    contactsHeading: "Контакти",
    friendsHeading: "Приятели",
    friendsTitle: "Приятели",
    friendsTabOnline: "На линия",
    friendsTabAll: "Всички",
    friendsTabPending: "Чакащи",
    addFriendTitle: "Добавяне на приятел",
    friendsSearch: "Търсене",
    friendsSectionOnline: "Онлайн",
    friendsSectionOffline: "Не в списъка",
    friendsSectionIncoming: "Входящи",
    friendsSectionOutgoing: "Чакащи отговор",
    friendsEmptyOnline: "Няма никой на линия в момента.",
    friendsEmptyAll: "Още нямаш приятели тук.",
    friendsEmptyPending: "Няма чакащи покани.",
    messageThem: "Напиши съобщение",
    friendBotBadge: "БОТ",
    friendPendingBadge: "ЧАКАЩИ",
    activeNowTitle: "Активни сега",
    activeNowQuietTitle: "Засега е тихо…",
    activeNowQuietBody:
      "Когато приятел започне да присъства — канали направо в игра или разговори — ще можем да ги покажем тук.",
    userWidgetMic: "Микрофон",
    userWidgetCamera: "Камера",
    userWidgetHeadset: "Слушалки",
    userWidgetSettings: "Настройки",
    userWidgetMenu: "Настройки на профила",
    goToChat: "Пиши в чата",
    showRoom: "Покажи стаята",
    sharePrevious: "Предишният екран",
    shareNext: "Следващият екран",
    shareWhoseScreen: "Чий екран се показва",
  },
  en: {
    title: "MESSAGES",
    chatsTab: "Chats",
    contactsTab: "Contacts",
    search: "Search chat or message",
    searchEmpty: "No conversations found",
    searchEmptyContacts: "No contacts found",
    newChat: "New chat",
    newContact: "New contact",
    activeNow: "active now",
    lastSeenOffline: "offline",
    placeholder: "Type a message",
    send: "Send",
    noChats: "Pick a conversation",
    noChatsHint: "Open a chat on the left or start a new conversation.",
    signOut: "Sign out",
    today: "Today",
    yesterday: "Yesterday",
    pinned: "Pinned",
    muted: "Muted",
    back: "Back to chats",
    typing: "typing…",
    you: "You",
    changePhoto: "Change picture",
    removePhoto: "Remove picture",
    editName: "Edit name",
    editNameTitle: "Your name",
    editNameHint: "This is the name the others see in the chat.",
    editNamePlaceholder: "Name",
    nameRequired: "Enter a name",
    nameTooLong: "That name is too long — 80 characters at most",
    nameSaved: "Name saved",
    openMenu: "Open menu",
    menuTitle: "Menu",
    noContacts: "No contacts yet. Add your first friend.",
    contactName: "Name",
    contactNamePlaceholder: "For example: Nelka",
    contactEmail: "Account email",
    contactEmailPlaceholder: "nelka@example.com",
    contactEmailHint: "With an email the contact syncs across all of your devices.",
    contactAbout: "Status",
    contactAboutPlaceholder: "What are you up to?",
    contactAccent: "Colour",
    contactAvatar: "Profile picture",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    deleteContact: "Delete contact",
    deleteContactHint: "The contact and its chats will be removed.",
    confirmDelete: "Are you sure?",
    writeMessage: "Write a message",
    emoji: "Emoji",
    attachImage: "Add image",
    attachFile: "Add file",
    dropFilesHere: "Drop the files here",
    dropFilesHint: "They will be added to the message.",
    imageTooBig: (max) => `Image is too large (max ${max}).`,
    fileTooBig: (max) => `File is too large (max ${max}).`,
    attachmentMissing: "The file could not be kept.",
    fileUnreadable: "The file could not be read.",
    uploadFailed: "The file could not be sent. Try again.",
    uploadUnavailable: "File sending is not set up on this server.",
    uploadLabel: (sent, total) => `Uploading file: ${sent} of ${total}`,
    storageFull: "The message was not saved to the cloud.",
    emojiCategories: {
      smileys: "Smileys",
      gestures: "Gestures",
      hearts: "Hearts",
      objects: "Objects",
      nature: "Nature",
      symbols: "Symbols",
    },
    unlockTitle: "Unlock sync",
    unlockBody:
      "Signing in to the site is normally enough. Confirm your password only if the messages session expired or your browser blocked cookies.",
    unlockEmail: "Email",
    unlockPassword: "Password",
    unlockSubmit: "Unlock",
    unlockInvalid: "Invalid email or password.",
    siteSignIn: "Sign in",
    siteSignInHint: "Sign in through the site if you already have an account.",
    syncing: "Syncing…",
    live: "Live",
    offline: "Offline",
    notLinked: "this device only",
    removeChat: "Delete chat",
    retry: "Try again",
    syncFailedTitle: "Messages could not load",
    syncFailedBody: "The cloud did not respond. Check your connection and try again.",
    continueOffline: "Continue without connection",
    localModeTitle: "You are working offline",
    localModeBody:
      "Messages are kept on this device only. They will be uploaded automatically once the connection is back.",
    localModeBadge: "offline",
    tryCloudAgain: "Try the cloud again",
    queuedLocally: "waiting to upload",
    friendsTab: "Friends",
    findPeople: "Find people",
    findPeoplePlaceholder: "Search by name or email…",
    findPeopleHint: "Type at least 2 characters to search the site.",
    noPeopleFound: "Nobody matches that search.",
    addFriend: "Add friend",
    requestSent: "Request sent",
    alreadyFriend: "Already friends",
    requestPending: "Request sent",
    incomingRequests: "Incoming requests",
    outgoingRequests: "Sent requests",
    myFriends: "My friends",
    noFriends: "No friends yet. Find someone above.",
    noRequests: "No pending requests.",
    accept: "Accept",
    decline: "Decline",
    removeFriend: "Remove friend",
    friendRequestFrom: "wants to add you as a friend",
    friendsOffline: "Friends need a cloud connection.",
    switchAccount: "Switch account",
    stickers: "Stickers",
    gifs: "GIF",
    giphySearchLabel: "Search Giphy",
    stickerSearchPlaceholder: "Search Giphy…",
    stickerTapToSend: "Tap to send",
    stickerLabel: "Sticker",
    stickerMissing: "Sticker unavailable",
    stickerLoading: "Loading…",
    stickerEmpty: "No results for that search",
    stickerNoKey: "Add a Giphy API key to search stickers",
    messageMenu: "Message options",
    messageReact: "Add reaction",
    messageReactPick: "Pick an emoji",
    messageEdit: "Edit",
    messageEditSave: "Save",
    messageEditCancel: "Cancel",
    messageEditHint: "Enter to save, Escape to cancel",
    messageDelete: "Delete",
    messageDeleteConfirm: "Delete the message",
    messageShare: "Share the text",
    messageShared: "The text was copied",
    messageShareFailed: "Copying is not available",
    messageReply: "Reply",
    messageForward: "Forward",
    messageThread: "Create a thread",
    messageUnpin: "Unpin message",
    messageApps: "Apps",
    messageUnread: "Mark as unread",
    messageCopyLink: "Copy link to message",
    messageNotYet: "Not built yet",
    messageEdited: "edited",
    messageDeleted: "This message was deleted",
    messageDeletedBy: "Deleted message",
    messageActionFailed: "The change was not saved",
    callAudio: "Voice call",
    callVideo: "Video call",
    callIncoming: "is calling you",
    callIncomingVideo: "is calling you with video",
    callAccept: "Answer",
    callDecline: "Decline",
    callConnecting: "Connecting…",
    callRinging: "Ringing…",
    callActive: "Call in progress",
    callEnded: "The call has ended",
    callEndedDecline: "The invite was declined",
    callEndedBusy: "The other side is on another call",
    callEndedFailed: "The connection dropped",
    callMute: "Mute the microphone",
    callUnmute: "Unmute the microphone",
    callDeafen: "Mute the speakers",
    callUndeafen: "Unmute the speakers",
    callLeave: "Leave the call",
    navMessages: "Messages",
    channelText: "Text channels",
    channelVoice: "Voice channel",
    channelVoiceIdle: "Not connected",
    railInCall: "In the call",
    railFriends: "Friends",
    railOnline: "Online",
    railPeople: "People",
    backToSite: "Back to the site",
    railEmpty: "Nobody here yet.",
    callCameraOff: "Turn the camera off",
    callCameraOn: "Turn the camera on",
    callShareScreen: "Share the screen",
    callStopShare: "Stop sharing",
    callSettings: "Device settings",
    callMore: "More",
    callEnd: "Close",
    callHangup: "End the call",
    callInvite: "Invite to the voice channel",
    callInviteHint: "Pick a friend to pull into the call",
    callInviteTitle: "Call invite",
    callInviteSent: "Added to the server. They can join the channel now.",
    callInviteFailed: "Could not add them to the server.",
    callActivity: "Choose an activity",
    callActivityHint: "Play together while you talk",
    callMicDevice: "Microphone",
    servers: "Servers",
    newServer: "New server",
    serverNamePlaceholder: "Server name",
    createServer: "Create server",
    serverCreated: "Server created",
    serverCreateFailed: "The server could not be created.",
    serverFriendsJoined: (count) => `${count} friends joined with you.`,
    serverFriendsPartial: (added, wanted) =>
      `${added} of ${wanted} friends joined. You can invite the rest from a channel.`,
    serverRename: "Rename",
    serverDelete: "Delete server",
    serverDeleteConfirm: "Delete this server and its channels?",
    serverDeleteConfirmTitle: "Delete the server",
    serverDeleteConfirmBody: (name) =>
      `"${name}" and its channels are gone for everyone in it. This cannot be undone.`,
    serverDeleteFailed: "The server could not be deleted.",
    serverDeleted: "The server was deleted.",
    serverRenamed: "The server was renamed.",
    serverRenameFailed: "The name could not be changed.",
    serverSettings: "Server settings",
    textChannels: "Text channels",
    voiceChannels: "Voice channels",
    addChannel: "Add channel",
    channelNamePlaceholder: "Channel name",
    inviteToChannel: "Invite to voice channel",
    voiceIdleStage: "Nobody is sharing right now. The tiles below are the people in the channel.",
    voiceConnected: "Voice device connected",
    voiceDisconnected: "Voice channel",
    voiceDeviceLabel: "Lobby",
    leaveVoice: "Leave channel",
    serverMuted: "Muted by the server owner",
    serverMutedBy: "Muted by",
    copyChannelInvite: "Copy invite",
    channelEmpty: "Choose a channel",
    noServers: "No servers",
    noServersHint: "Create a server to get channels and the voice panel.",
    callCameraDevice: "Camera",
    voicePanelVideo: "Video",
    voicePanelScreen: "Screen",
    callUnsupported: "This browser cannot do calls",
    callUnknown: "Unknown",
    callMicOn: "Microphone is on",
    callMicMuted: "Microphone is muted",
    callVoiceConnected: "Voice device connected",
    callVoiceWaiting: "Voice not connected yet",
    callElapsed: "Duration:",
    callRingingFor: "Ringing for:",
    callPeople: "In call: {count}",
    callScreenLabel: "Shared screen",
    callScreenLabelWindow: "Shared window",
    callScreenLive: "LIVE",
    callStreamQuality: "Stream quality",
    callStreamLessVideo: "Less video = smoother connection",
    callInChannel: "In the channel",
    callScreenLabelTab: "Shared tab",
    callShareFailed: "The share did not start. Allow screen access and try again.",
    callInviteMore: "Add somebody",
    callInviteCount: "{count} people can be added",
    callInviteEmpty: "Nobody to invite yet",
    callInviteEmptyHint:
      "Your friends and your contacts are both listed. Add someone from Contacts and they will appear here.",
    callInviteWaiting: "invited",
    callInviteWaitingHint:
      "Waiting for them to join. If somebody does not answer, the call goes on without them.",
    callInviteNoAddress: "no address for this person",
    callNoCloud: "A call needs the cloud connection. Get online and sign in to call.",
    callNoAddress: "This conversation has no address, so it cannot be called.",
    callRingingHint: "Waiting for someone to join. You can invite more people.",
    callLogOutgoing: "Outgoing call",
    callLogIncoming: "Incoming call",
    callLogCompleted: "Call ended",
    callLogMissed: "Missed call",
    callLogCancelled: "Call cancelled",
    callLogBusy: "Busy",
    callLogFailed: "Call did not connect",
    callLogRinging: "Ringing",
    callLogRingingTo: "Ringing {name}...",
    callLogRingingMoved: "{was} did not answer. Ringing {name}...",
    callLogIncomingFrom: "Incoming call from {name}",
    callLogConnecting: "Connecting",
    callLogActive: "Call in progress",
    callLogAnswer: "Answer",
    callLogDecline: "Decline",
    callLogCancel: "Cancel call",
    callLogHangup: "End",
    callLogInIncomingTitle: "Incoming call",
    callLogDuration: "Duration",
    callInputVolume: "Input level",
    callInputVolumeHint: "The gain applies to this call only, not to Windows.",
    callTestStart: "Test the microphone",
    callTestStop: "Stop the recording",
    callTestPlay: "Play the recording",
    chatSettings: "Conversation settings",
    chatThemes: "Themes",
    chatThemesHint: "Colour the chat",
    downloadApp: "Download the app",
    downloadAppHint: "For Windows, with an icon and a microphone",
    downloadAppWindows: "Download for Windows",
    downloadAppAndroid: "Download for Android",
    downloadAppOther: "Download",
    downloadAppInApp: "You are already in the app",
    micMute: "Mute the microphone",
    micUnmute: "Unmute the microphone",
    chatThemeDefault: "Default",
    chatThemeReset: "Back to the default theme",
    exportText: "Save as text",
    exportTextHint: "{count} messages in .txt",
    exportJson: "Save as JSON",
    exportJsonHint: "The full record in .json",
    exportAll: "Save every conversation",
    exportAllHint: "{count} conversations in one file",
    exportAllFile: "conversations",
    exportDone: "The file is saved on this device",
    statusOnline: "Online",
    statusAway: "Away",
    statusBusy: "Do not disturb",
    statusInvisible: "Invisible",
    statusSaveFailed: "The status could not be saved.",
    findOrStart: "Find or start a conversation",
    navChats: "Chats",
    navContacts: "Contacts",
    navFriends: "Friends",
    navGames: "Games",
    directMessages: "Direct Messages",
    contactsHeading: "Contacts",
    friendsHeading: "Friends",
    friendsTitle: "Friends",
    friendsTabOnline: "Online",
    friendsTabAll: "All",
    friendsTabPending: "Pending",
    addFriendTitle: "Add Friend",
    friendsSearch: "Search",
    friendsSectionOnline: "Online",
    friendsSectionOffline: "Offline",
    friendsSectionIncoming: "Incoming",
    friendsSectionOutgoing: "Awaiting response",
    friendsEmptyOnline: "Nobody is online right now.",
    friendsEmptyAll: "You have no friends here yet.",
    friendsEmptyPending: "No pending requests.",
    messageThem: "Send a message",
    friendBotBadge: "BOT",
    friendPendingBadge: "PENDING",
    activeNowTitle: "Active Now",
    activeNowQuietTitle: "It's quiet in here...",
    activeNowQuietBody:
      "When a friend starts hanging out — in a channel or in a call — we'll show them here.",
    userWidgetMic: "Microphone",
    userWidgetCamera: "Camera",
    userWidgetHeadset: "Headphones",
    userWidgetSettings: "Settings",
    userWidgetMenu: "Profile settings",
    goToChat: "Go write in the chat",
    showRoom: "Show the room",
    sharePrevious: "The previous screen",
    shareNext: "The next screen",
    shareWhoseScreen: "Whose screen this is",
  },
  zh: {
    title: "消息",
    chatsTab: "聊天",
    contactsTab: "联系人",
    search: "搜索聊天或消息",
    searchEmpty: "未找到聊天",
    searchEmptyContacts: "未找到联系人",
    newChat: "新聊天",
    newContact: "新联系人",
    activeNow: "在线",
    lastSeenOffline: "离线",
    placeholder: "输入消息",
    send: "发送",
    noChats: "选择聊天",
    noChatsHint: "从左侧打开聊天或开始新对话。",
    signOut: "退出云同步",
    today: "今天",
    yesterday: "昨天",
    pinned: "已置顶",
    muted: "已静音",
    back: "返回聊天",
    typing: "正在输入…",
    you: "你",
    changePhoto: "更换头像",
    removePhoto: "移除头像",
    editName: "编辑昵称",
    editNameTitle: "你的昵称",
    editNameHint: "这是其他人在聊天里看到的名字。",
    editNamePlaceholder: "昵称",
    nameRequired: "请输入昵称",
    nameTooLong: "昵称太长了 — 最多 80 个字符",
    nameSaved: "昵称已保存",
    openMenu: "打开菜单",
    menuTitle: "菜单",
    noContacts: "还没有联系人。添加第一个好友吧。",
    contactName: "名称",
    contactNamePlaceholder: "例如：内尔卡",
    contactEmail: "账号邮箱",
    contactEmailPlaceholder: "nelka@example.com",
    contactEmailHint: "有邮箱的联系人会在所有设备间同步。",
    contactAbout: "状态",
    contactAboutPlaceholder: "最近在做什么？",
    contactAccent: "颜色",
    contactAvatar: "头像",
    save: "保存",
    cancel: "取消",
    delete: "删除",
    deleteContact: "删除联系人",
    deleteContactHint: "联系人及其聊天将被删除。",
    confirmDelete: "确定吗？",
    writeMessage: "写消息",
    emoji: "表情符号",
    attachImage: "添加图片",
    attachFile: "添加文件",
    dropFilesHere: "把文件拖到这里",
    dropFilesHint: "它们会被加到消息里。",
    imageTooBig: (max) => `图片太大（最大 ${max}）。`,
    fileTooBig: (max) => `文件太大（最大 ${max}）。`,
    attachmentMissing: "文件未能保存。",
    fileUnreadable: "无法读取文件。",
    uploadFailed: "文件发送失败，请重试。",
    uploadUnavailable: "此服务器尚未配置文件发送。",
    uploadLabel: (sent, total) => `正在发送文件：${sent} / ${total}`,
    storageFull: "消息未能保存到云端。",
    emojiCategories: {
      smileys: "表情",
      gestures: "手势",
      hearts: "爱心",
      objects: "物品",
      nature: "自然",
      symbols: "符号",
    },
    unlockTitle: "解锁同步",
    unlockBody: "通常登录本站即可。仅当消息会话过期或浏览器拦截了 Cookie 时才需要确认密码。",
    unlockEmail: "邮箱",
    unlockPassword: "密码",
    unlockSubmit: "解锁",
    unlockInvalid: "邮箱或密码无效。",
    siteSignIn: "登录账号",
    siteSignInHint: "已有账号请通过网站登录。",
    syncing: "同步中…",
    live: "已连接",
    offline: "无连接",
    notLinked: "仅此设备",
    removeChat: "删除聊天",
    retry: "重试",
    syncFailedTitle: "无法加载消息",
    syncFailedBody: "云端没有响应。请检查网络连接后重试。",
    continueOffline: "离线继续",
    localModeTitle: "当前处于离线模式",
    localModeBody: "消息只保存在此设备上。连接恢复后会自动上传到云端。",
    localModeBadge: "离线",
    tryCloudAgain: "重试连接云端",
    queuedLocally: "等待上传",
    friendsTab: "好友",
    findPeople: "找人",
    findPeoplePlaceholder: "按姓名或邮箱搜索…",
    findPeopleHint: "输入至少 2 个字符即可搜索。",
    noPeopleFound: "没有找到匹配的用户。",
    addFriend: "添加好友",
    requestSent: "请求已发送",
    alreadyFriend: "已经是好友",
    requestPending: "请求已发送",
    incomingRequests: "收到的好友请求",
    outgoingRequests: "已发送的请求",
    myFriends: "我的好友",
    noFriends: "还没有好友。在上方找人吧。",
    noRequests: "没有待处理的请求。",
    accept: "接受",
    decline: "拒绝",
    removeFriend: "删除好友",
    friendRequestFrom: "想加你为好友",
    friendsOffline: "好友功能需要连接云端。",
    switchAccount: "切换账号",
    stickers: "贴纸",
    gifs: "GIF",
    giphySearchLabel: "搜索 Giphy",
    stickerSearchPlaceholder: "搜索 Giphy…",
    stickerTapToSend: "点击即可发送",
    stickerLabel: "贴纸",
    stickerMissing: "贴纸不可用",
    stickerLoading: "加载中…",
    stickerEmpty: "没有找到结果",
    stickerNoKey: "添加 Giphy API 密钥以搜索贴纸",
    messageMenu: "消息选项",
    messageReact: "添加表情",
    messageReactPick: "选择表情",
    messageEdit: "编辑",
    messageEditSave: "保存",
    messageEditCancel: "取消",
    messageEditHint: "回车保存，Esc 取消",
    messageDelete: "删除",
    messageDeleteConfirm: "删除这条消息",
    messageShare: "分享文字",
    messageShared: "文字已复制",
    messageShareFailed: "无法复制",
    messageReply: "回复",
    messageForward: "转发",
    messageThread: "创建话题",
    messageUnpin: "取消置顶消息",
    messageApps: "应用",
    messageUnread: "标记为未读",
    messageCopyLink: "复制消息链接",
    messageNotYet: "尚未完成",
    messageEdited: "已编辑",
    messageDeleted: "这条消息已删除",
    messageDeletedBy: "已删除的消息",
    messageActionFailed: "更改未保存",
    callAudio: "语音通话",
    callVideo: "视频通话",
    callIncoming: "正在呼叫你",
    callIncomingVideo: "正在视频呼叫你",
    callAccept: "接听",
    callDecline: "拒绝",
    callConnecting: "连接中…",
    callRinging: "响铃中…",
    callActive: "通话进行中",
    callEnded: "通话已结束",
    callEndedDecline: "邀请已被拒绝",
    callEndedBusy: "对方正在通话中",
    callEndedFailed: "连接已断开",
    callMute: "静音麦克风",
    callUnmute: "取消静音",
    callDeafen: "静音扬声器",
    callUndeafen: "取消静音扬声器",
    callLeave: "离开通话",
    navMessages: "消息",
    channelText: "文字频道",
    channelVoice: "语音频道",
    channelVoiceIdle: "未连接",
    railInCall: "通话中",
    railFriends: "好友",
    railOnline: "在线",
    railPeople: "成员",
    railEmpty: "这里还没有人。",
    backToSite: "返回网站",
    callCameraOff: "关闭摄像头",
    callCameraOn: "打开摄像头",
    callShareScreen: "共享屏幕",
    callStopShare: "停止共享",
    callSettings: "设备设置",
    callMore: "更多",
    callEnd: "关闭",
    callHangup: "结束通话",
    callInvite: "邀请进入语音频道",
    callInviteHint: "选择一位好友加入通话",
    callInviteTitle: "通话邀请",
    callInviteSent: "????",
    callInviteFailed: "????",
    callActivity: "选择活动",
    callActivityHint: "一边聊天一边玩",
    callMicDevice: "麦克风",
    servers: "服务器",
    newServer: "新建服务器",
    serverNamePlaceholder: "服务器名称",
    createServer: "创建服务器",
    serverCreated: "服务器已创建",
    serverCreateFailed: "服务器创建失败。",
    serverFriendsJoined: (count) => `${count} 位好友和你一起加入了。`,
    serverFriendsPartial: (added, wanted) =>
      `${added} 位好友（共 ${wanted} 位）加入了。其余的可以从频道邀请。`,
    serverRename: "重命名",
    serverDelete: "删除服务器",
    serverDeleteConfirm: "删除此服务器及其频道？",
    serverDeleteConfirmTitle: "删除服务器",
    serverDeleteConfirmBody: (name) => `“${name}”及其频道将对其中所有人消失。此操作无法撤销。`,
    serverDeleteFailed: "服务器删除失败。",
    serverDeleted: "服务器已删除。",
    serverRenamed: "服务器已重命名。",
    serverRenameFailed: "名称修改失败。",
    serverSettings: "服务器设置",
    textChannels: "文字频道",
    voiceChannels: "语音频道",
    addChannel: "添加频道",
    channelNamePlaceholder: "频道名称",
    voiceIdleStage: "????",
    inviteToChannel: "邀请加入语音频道",
    voiceConnected: "已连接语音设备",
    voiceDisconnected: "语音频道",
    voiceDeviceLabel: "大厅",
    leaveVoice: "离开频道",
    serverMuted: "已被服务器所有者静音",
    serverMutedBy: "静音者",
    copyChannelInvite: "复制邀请",
    channelEmpty: "选择一个频道",
    noServers: "没有服务器",
    noServersHint: "创建服务器以获得频道和语音面板。",
    callCameraDevice: "摄像头",
    voicePanelVideo: "????",
    voicePanelScreen: "????",
    callUnsupported: "此浏览器不支持通话",
    callUnknown: "未知",
    callMicOn: "麦克风已开启",
    callMicMuted: "麦克风已静音",
    callVoiceConnected: "语音设备已连接",
    callVoiceWaiting: "语音尚未连接",
    callElapsed: "时长：",
    callRingingFor: "响铃时长：",
    callPeople: "通话中：{count}",
    callScreenLabel: "共享屏幕",
    callScreenLabelWindow: "共享窗口",
    callScreenLive: "直播中",
    callStreamQuality: "视频质量",
    callStreamLessVideo: "更少视频 = 更流畅的连接",
    callInChannel: "频道内的人",
    callScreenLabelTab: "共享标签页",
    callShareFailed: "共享未能开始。请允许屏幕访问后重试。",
    callInviteMore: "再添加成员",
    callInviteCount: "可添加 {count} 人",
    callInviteEmpty: "暂无可邀请的人",
    callInviteEmptyHint: "这里会列出你的好友和联系人。在“联系人”中添加后即可在此显示。",
    callInviteWaiting: "已邀请",
    callInviteWaitingHint: "正在等待他们加入。如果有人没接听，通话会继续。",
    callInviteNoAddress: "没有此人的地址",
    callNoCloud: "通话需要云端连接。请联网并登录后再拨打。",
    callNoAddress: "此对话没有地址，无法拨打电话。",
    callRingingHint: "正在等待有人加入，还可以邀请其他人。",
    callLogOutgoing: "呼出电话",
    callLogIncoming: "来电",
    callLogCompleted: "通话已结束",
    callLogMissed: "未接来电",
    callLogCancelled: "已取消呼叫",
    callLogBusy: "忙线",
    callLogFailed: "未能接通",
    callLogRinging: "正在呼叫",
    callLogRingingTo: "正在呼叫 {name}…",
    callLogRingingMoved: "{was} 未接听。正在呼叫 {name}…",
    callLogIncomingFrom: "来自 {name} 的来电",
    callLogConnecting: "连接中",
    callLogActive: "通话中",
    callLogAnswer: "接听",
    callLogDecline: "拒绝",
    callLogCancel: "取消呼叫",
    callLogHangup: "挂断",
    callLogInIncomingTitle: "来电",
    callLogDuration: "时长",
    callInputVolume: "输入音量",
    callInputVolumeHint: "增益只作用于本次通话，不会改动 Windows 设置。",
    callTestStart: "测试麦克风",
    callTestStop: "停止录音",
    callTestPlay: "播放录音",
    chatSettings: "会话设置",
    chatThemes: "主题",
    chatThemesHint: "为聊天配色",
    downloadApp: "下载程序",
    downloadAppHint: "适用于 Windows，带图标和麦克风",
    downloadAppWindows: "下载 Windows 版",
    downloadAppAndroid: "下载 Android 版",
    downloadAppOther: "下载",
    downloadAppInApp: "你已在程序中",
    micMute: "关闭麦克风",
    micUnmute: "开启麦克风",
    chatThemeDefault: "默认",
    chatThemeReset: "恢复默认主题",
    exportText: "保存为文本",
    exportTextHint: "{count} 条消息，.txt",
    exportJson: "保存为 JSON",
    exportJsonHint: "完整记录，.json",
    exportAll: "保存所有会话",
    exportAllHint: "{count} 个会话，一个文件",
    exportAllFile: "会话",
    exportDone: "文件已保存到本机",
    statusOnline: "在线",
    statusAway: "离开",
    statusBusy: "勿扰",
    statusInvisible: "隐身",
    statusSaveFailed: "状态保存失败。",
    findOrStart: "查找或开始对话",
    navChats: "聊天",
    navContacts: "联系人",
    navFriends: "好友",
    navGames: "游戏",
    directMessages: "私信",
    contactsHeading: "联系人",
    friendsHeading: "好友",
    friendsTitle: "好友",
    friendsTabOnline: "在线",
    friendsTabAll: "全部",
    friendsTabPending: "待处理",
    addFriendTitle: "添加好友",
    friendsSearch: "搜索",
    friendsSectionOnline: "在线",
    friendsSectionOffline: "离线",
    friendsSectionIncoming: "收到的请求",
    friendsSectionOutgoing: "等待回应",
    friendsEmptyOnline: "现在没有人在线。",
    friendsEmptyAll: "这里还没有好友。",
    friendsEmptyPending: "没有待处理的请求。",
    messageThem: "发送消息",
    friendBotBadge: "机器人",
    friendPendingBadge: "待处理",
    activeNowTitle: "当前活跃",
    activeNowQuietTitle: "这里很安静……",
    activeNowQuietBody: "当好友开始活跃——在频道里或在通话中——我们会把他们显示在这里。",
    userWidgetMic: "麦克风",
    userWidgetCamera: "摄像头",
    userWidgetHeadset: "耳机",
    userWidgetSettings: "设置",
    userWidgetMenu: "个人资料设置",
    goToChat: "去聊天里写",
    showRoom: "显示房间",
    sharePrevious: "上一个屏幕",
    shareNext: "下一个屏幕",
    shareWhoseScreen: "这是谁的屏幕",
  },
};

const CONTACT_ACCENTS = [
  "#1DB954",
  "#22d3ee",
  "#f97316",
  "#a78bfa",
  "#60a5fa",
  "#f472b6",
  "#facc15",
  "#34d399",
] as const;

const EMOJI_GROUPS: Array<{ id: string; emoji: string[] }> = [
  {
    id: "smileys",
    emoji: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "🙃",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "😘",
      "😗",
      "😚",
      "😙",
      "😋",
      "😛",
      "😜",
      "🤪",
      "😝",
      "🤗",
      "🤭",
      "🤫",
      "🤔",
      "🤨",
      "😐",
      "😑",
      "😶",
      "😏",
      "😒",
      "🙄",
      "😬",
      "🥺",
      "😌",
      "😔",
      "😴",
    ],
  },
  {
    id: "gestures",
    emoji: [
      "👋",
      "🤚",
      "🖐️",
      "✋",
      "🖖",
      "👌",
      "🤌",
      "🤏",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "🤙",
      "👈",
      "👉",
      "👆",
      "👇",
      "☝️",
      "👍",
      "👎",
      "✊",
      "👊",
      "🤛",
      "🤜",
      "👏",
      "🙌",
      "👐",
      "🤲",
      "🤝",
      "🙏",
    ],
  },
  {
    id: "hearts",
    emoji: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "💯",
      "💫",
    ],
  },
  {
    id: "objects",
    emoji: [
      "🎮",
      "🎲",
      "🎯",
      "🏆",
      "🥇",
      "⚽",
      "🏀",
      "🎧",
      "🎸",
      "🥁",
      "🎬",
      "📷",
      "💻",
      "📱",
      "⌨️",
      "🖥️",
      "🖨️",
      "🎨",
      "🧩",
      "🧸",
      "📌",
      "📎",
      "🔗",
      "🗑️",
      "⏰",
      "🔔",
      "🔒",
      "🔑",
      "📦",
      "💡",
    ],
  },
  {
    id: "nature",
    emoji: [
      "🌞",
      "🌝",
      "⭐",
      "🌟",
      "✨",
      "⚡",
      "🔥",
      "💧",
      "🌈",
      "☔",
      "🌵",
      "🌲",
      "🍀",
      "🌸",
      "🌻",
      "🍕",
      "🍔",
      "🍟",
      "🍣",
      "🍰",
      "🎂",
      "🍩",
      "☕",
      "🍺",
      "🍷",
      "🎁",
      "🎈",
      "🏵️",
    ],
  },
  {
    id: "symbols",
    emoji: [
      "✅",
      "❌",
      "❗",
      "❓",
      "🔕",
      "⏳",
      "🆗",
      "🆕",
      "🔝",
      "🆙",
      "🈵",
      "🈶",
      "🔂",
      "♻️",
      "➕",
      "➖",
      "💬",
      "🕐",
      "📍",
      "🆔",
    ],
  },
];

const dayKey = (value: number) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/**
 * One person, as both the friends view and the right hand column draw them.
 *
 * The same shape in both places on purpose. They answer one question — who do I
 * know and are they here — and two shapes for it is how a person ends up as an
 * avatar with no name in one column and a name with no avatar in the other.
 */
type FriendRow = {
  /** Lowercased, because that is the only form an address is compared in. */
  email: string;
  name: string;
  avatar: string | null;
  accent: string;
  online: boolean;
  /** Their own line, under the name. Empty is normal, not a gap to fill. */
  about: string;
  status: PresenceStatus;
};

const formatClock = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  // Two decimals rather than one, because past a gigabyte the tenth is the
  // difference between "4.0 GB" for every file on a disc and the size the file
  // actually has.
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * The one line the chat list shows under a name. A sticker travels as a token,
 * so the raw text would leak `[sticker::]` into the preview; it reads as the
 * sticker name instead, and a Giphy sticker as the label, because its token
 * carries a url nobody wants to read in a list.
 */
function messagePreview(text: string, t: MessagesCopy) {
  if (giphyStickerUrlFromText(text)) return t.stickerLabel;
  const id = stickerIdFromText(text);
  if (!id) return text;
  return `${t.stickerLabel}: ${stickerById(id)?.name ?? id}`;
}

function formatListStamp(value: number, lang: Lang) {
  if (!value) return "";
  const now = new Date();
  const date = new Date(value);
  if (dayKey(now.getTime()) === dayKey(value)) return formatClock(value);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(yesterday.getTime()) === dayKey(value)) {
    return lang === "bg" ? "вчера" : lang === "zh" ? "昨天" : "yesterday";
  }
  return date.toLocaleDateString(lang === "bg" ? "bg-BG" : lang === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatLastSeen(lastSeenAt: number, t: MessagesCopy, lang: Lang) {
  if (!lastSeenAt) return t.lastSeenOffline;
  const minutesAgo = Math.floor((Date.now() - lastSeenAt) / 60_000);
  if (minutesAgo < 1) return t.activeNow;

  const phrase = (value: number, unitBg: string, unitShort: string) =>
    lang === "bg" ? `беше на линия преди ${value} ${unitBg}` : `${value}${unitShort} ago`;

  if (minutesAgo < 60) {
    return phrase(minutesAgo, "мин", "m");
  }
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) {
    return phrase(hoursAgo, "ч", "h");
  }
  return formatListStamp(lastSeenAt, lang);
}

function formatDayLabel(value: number, t: MessagesCopy) {
  const now = new Date();
  if (dayKey(now.getTime()) === dayKey(value)) return t.today;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(yesterday.getTime()) === dayKey(value)) return t.yesterday;
  return new Date(value).toLocaleDateString([], { day: "2-digit", month: "long" });
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result.startsWith("data:")) resolve(result);
      else reject(new Error("unreadable"));
    };
    reader.onerror = () => reject(new Error("unreadable"));
    reader.readAsDataURL(file);
  });

/**
 * Turns a picked file into something the composer can hold on to.
 *
 * A picture is compressed and kept inline: the compressed copy is a few hundred
 * kilobytes, and the bubble wants to be able to draw it before any round trip has
 * finished.
 *
 * Anything else follows the regime this build is in. While `MAX_FILE_BYTES` is
 * the inline ceiling there is nowhere to upload to, so the file is read into the
 * page and travels inside the message. Once the cap is above what can be inlined
 * — which is the build with a bucket behind it — the file is kept as a file
 * instead and cut into parts on send, so the bytes are never a string in this
 * process.
 */
async function fileToAttachment(file: File): Promise<IncomingAttachment> {
  const isImage = file.type.startsWith("image/");
  if (isImage) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("image-too-big");
    const dataUrl = await compressImageFile(file, {
      maxWidth: 1280,
      maxHeight: 1280,
      maxBytes: 320_000,
      quality: 0.72,
    });
    return {
      id: createMessageId(),
      kind: "image",
      name: file.name || "image.jpg",
      mimeType: "image/jpeg",
      size: Math.round((dataUrl.length * 3) / 4),
      dataUrl,
    };
  }

  if (file.size > MAX_FILE_BYTES) throw new Error("file-too-big");
  const described = {
    id: createMessageId(),
    kind: "file" as const,
    name: file.name || "file",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };

  if (!filesTravelInBucket) return { ...described, dataUrl: await readFileAsDataUrl(file) };
  return { ...described, file };
}

async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) {
    throw new Error("image-too-big");
  }
  return compressImageFile(file, { maxWidth: 320, maxHeight: 320, maxBytes: 60_000, quality: 0.7 });
}

/**
 * The site's own sign-in page, spelled out rather than left as a path.
 *
 * The chat's lock screen is two fields and nothing else, so somebody who already
 * has an account is sent here to use it. The address is the whole site rather than
 * this route's `/login`: the lock screen is what somebody lands on when the chat
 * has no session, and the person who has come to make an account wants the page
 * where accounts are made.
 */
const SITE_SIGN_IN = "https://tody-game-hub.bbailiaskk.workers.dev/login";

/** Whether this page is open in a browser, where the installer is worth offering. */
const useIsInProgram = () => {
  const [inProgram, setInProgram] = useState(false);
  useEffect(() => {
    // The program reports itself through the preload bridge. Anything else on the
    // web is a browser, including one with the page open in a tab.
    setInProgram(Boolean((window as { tody?: unknown }).tody));
  }, []);
  return inProgram;
};

export function MessagesPage() {
  const { lang } = useSiteSettings();
  const t = messagesCopy[lang];
  const inProgram = useIsInProgram();

  const store = useSyncExternalStore(
    messagesStore.subscribe,
    messagesStore.getState,
    messagesStore.getState,
  );

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [themeId, setThemeId] = useState<string>(DEFAULT_CHAT_THEME_ID);
  const [themesOpen, setThemesOpen] = useState(false);

  useEffect(() => {
    setThemeId(readChatThemeId());
  }, []);

  /**
   * Paints a shell, and is the only place that does.
   *
   * Written as custom properties on the element rather than as a class, so a theme
   * is five colours and does not need a rule per theme in the stylesheet — which
   * matters when the list is meant to grow. `false` takes them back off, so a
   * shell that unmounts is left as the stylesheet describes it rather than as the
   * last person's leftovers.
   */
  const paintShell = useCallback((element: HTMLElement | null, id: string) => {
    if (!element) return;
    const theme = id ? chatThemeById(id) : null;
    for (const [property, value] of chatThemeVariables(theme)) {
      if (value) element.style.setProperty(property, value);
      else element.style.removeProperty(property);
    }
  }, []);

  /**
   * The theme, held where both ways of changing it can reach it.
   *
   * The shell is not in the document on the first pass — there is nothing to paint
   * until a snapshot arrives — so an effect that ran once on mount would find no
   * element and never be asked again. The ref keeps the current theme readable
   * from the callback that fires when the shell does attach, and the effect below
   * covers the other direction: a theme changing under a shell that is already
   * there.
   */
  const themeRef = useRef(themeId);
  themeRef.current = themeId;
  /** The shell itself, so the effect can repaint it when the theme changes. */
  const shellNodeRef = useRef<HTMLElement | null>(null);
  const shellRef = useCallback(
    (node: HTMLElement | null) => {
      shellNodeRef.current = node;
      if (node) paintShell(node, themeRef.current);
    },
    [paintShell],
  );

  useEffect(() => {
    paintShell(shellNodeRef.current, themeId);
    // Left as the stylesheet describes it when the page goes away, so a shell that
    // is mounted again later is not the previous person's colours until it paints.
    return () => paintShell(shellNodeRef.current, "");
  }, [paintShell, themeId]);

  /**
   * The friends view's own search, kept apart from the column's.
   *
   * Two fields with two different jobs on one screen: this one narrows the
   * people in the middle, the other one finds a conversation in the column on
   * the left. Sharing one would mean typing a name empties the conversations,
   * which is the wrong answer to both questions at once.
   */
  const [friendQuery, setFriendQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showList, setShowList] = useState(true);
  const [sidebarView, setSidebarView] = useState<"chats" | "contacts" | "friends">("chats");
  const [pending, setPending] = useState<IncomingAttachment[]>([]);
  const [stickerTrayOpen, setStickerTrayOpen] = useState(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  /**
   * The phone's menu.
   *
   * Its own state rather than a piece of the route, because it is the only panel
   * in the app that is not about the conversation: it holds the servers and the
   * shortcuts, and it has to be reachable from the list and from a thread
   * without either of them knowing that the other exists.
   */
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** The composer, so an open message menu can keep out of the text field. */
  const composerRef = useRef<HTMLFormElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void messagesStore.start();
    return () => messagesStore.stop();
  }, []);

  /**
   * Handing over the installer.
   *
   * A new tab rather than this one. Drive answers with its own page and then the
   * file, and a hundred megabytes arriving in the tab somebody was reading in is a
   * chat they have to come back to; `noopener` keeps the opened page from reaching
   * back into this window. An `<a download>` would be tidier and is not an option:
   * the attribute is ignored cross-origin, so it would only look like it works.
   *
   * Inside the program there is nothing to download, so the button says so and
   * stops there rather than opening a copy of the app that is already running.
   */
  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? "" : current)), 4200);
  }, []);

  const downloadProgram = useCallback(() => {
    if (inProgram) {
      flash(t.downloadAppInApp);
      return;
    }
    window.open(PROGRAM_DOWNLOAD, "_blank", "noopener");
  }, [flash, inProgram, t.downloadAppInApp]);

  /**
   * The same program for a phone.
   *
   * Its own button beside the Windows one rather than one button offering both: the
   * two are different files, and a person on a phone who is handed a hundred
   * megabyte Windows installer has been handed nothing they can use.
   *
   * The `inProgram` check does not apply here. Someone reading the chat inside the
   * Windows program is not on a phone, but somebody forwarded this panel to somebody
   * who is, and the row is the only place that says the app exists for Android too.
   */
  const downloadAndroid = useCallback(() => {
    window.open(ANDROID_DOWNLOAD, "_blank", "noopener");
  }, []);

  const data = store.data;
  const contacts = useMemo(() => data?.contacts ?? [], [data]);
  const chats = useMemo(() => data?.chats ?? [], [data]);
  /** Files on their way up, keyed by the message that is waiting on them. */
  const uploads = store.uploads;

  const contactsById = useMemo(() => {
    const map = new Map<string, ChatContact>();
    contacts.forEach((contact) => map.set(contact.id, contact));
    return map;
  }, [contacts]);

  const contactsByEmail = useMemo(() => {
    const map = new Map<string, ChatContact>();
    contacts.forEach((contact) => {
      if (contact.peerEmail) map.set(contact.peerEmail, contact);
    });
    return map;
  }, [contacts]);

  const needle = query.trim().toLocaleLowerCase();

  // A call is one at a time, so the state is lifted out of the snapshot.
  const call = store.call;
  // A ringing call does not take the screen: it is answered from the thread or
  // from the bar, so the conversation the user was reading stays where it is.
  const callUp = call.status !== "idle" && call.status !== "incoming";
  const [localStream, setLocalStream] = useState<unknown>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, unknown>>({});
  /** Deafening the speakers, which is a separate switch from the microphone. */
  const [deafened, setDeafened] = useState(false);

  // Deafen means hear nothing, and there is nothing to hear once the call is
  // over, so the switch does not survive the call it was set for.
  useEffect(() => {
    if (!callUp) setDeafened(false);
  }, [callUp]);

  /** The call clock for the corner panel, and for the call screen's own header. */
  const callElapsed = useCallClock(call.answeredAt, callUp);
  useEffect(() => {
    for (const node of document.querySelectorAll<HTMLMediaElement>("audio[data-call-remote]")) {
      node.muted = deafened;
    }
  }, [deafened, remoteStreams]);

  /** The servers this account is in, and the one the column is showing. */
  const guilds = useMemo(
    () => store.guilds.guilds.map((guild) => guildView(guild, store.guilds)),
    [store.guilds],
  );

  /**
   * Which server is open, and `null` for none of them.
   *
   * Home first rather than a server, because the column beside the rail is the
   * conversations and the friends, and landing on a server instead means the
   * first thing on screen is a list of channels for a place this person may
   * never have opened. The rail's home roundel and a second press on the open
   * server are both ways back, so nothing is a dead end.
   */
  const [activeGuildId, setActiveGuildId] = useState<string | null>(null);

  const activeGuild = guilds.find((guild) => guild.id === activeGuildId) ?? null;

  // A server that has gone from under the pointer must not keep the column.
  useEffect(() => {
    if (!activeGuildId || guilds.some((guild) => guild.id === activeGuildId)) return;
    setActiveGuildId(null);
  }, [activeGuildId, guilds]);

  // Every channel with somebody standing in it, which is what marks a server's
  // roundel green. One flat list so the rail does not have to walk the rosters.
  const liveChannelIds = useMemo(
    () =>
      Object.entries(store.voiceRosters)
        .filter(([, roster]) => liveVoicePresences(roster).length > 0)
        .map(([channelId]) => channelId),
    [store.voiceRosters],
  );

  /** Who is in the room this account is standing in, in mesh order. */
  const voicePresences = useMemo(
    () => liveVoicePresences(store.voiceRosters[store.voiceChannelId ?? ""]),
    [store.voiceRosters, store.voiceChannelId],
  );

  /** Which device picker is open under the bottom bar, if any. */
  const [voicePanel, setVoicePanel] = useState<"mic" | "camera" | "quality" | null>(null);

  /** What the next share asks the browser for. */
  const [screenQuality, setScreenQuality] = useState<ScreenQuality>(DEFAULT_SCREEN_QUALITY);

  /** This account's own row in the room, which is what its own panels read. */
  const selfVoice = useMemo(
    () =>
      store.voiceRosters[store.voiceChannelId ?? ""]?.presences.find(
        (entry) => entry.email === store.email,
      ) ?? null,
    [store.voiceRosters, store.voiceChannelId, store.email],
  );

  /** Whether the list of who is standing in the channel is open, down the column. */
  const [showChannelPeople, setShowChannelPeople] = useState(false);

  /**
   * The same list, opened from the room's own header.
   *
   * A second flag rather than a shared one because they are two surfaces, not one
   * list in two places: a shared flag opens both at once when either is pressed,
   * so a panel appears down the column that nobody asked for while the popover they
   * did ask for is somewhere else.
   */
  const [showRoomPeople, setShowRoomPeople] = useState(false);

  /**
   * The chat, while the microphone is still open in the channel.
   *
   * Not the same as leaving: the connection stays and the voice panel stays, so
   * the room is one arrow away from coming back. It is here because a channel you
   * are alone in is not worth staring at, and a person who joined to type two lines
   * would otherwise have to leave, type, and join again.
   *
   * Reset whenever the room itself changes — a new channel is a new room and the
   * choice was made about the last one.
   */
  const [leaveRoomView, setLeaveRoomView] = useState(false);

  /**
   * A server is being made and its friends are walking in.
   *
   * Its own flag because the wait is long — fifty invitations, each mirrored into
   * several accounts — and a person who presses the button again in the meantime
   * would make a second server and then watch both sets of invitations arrive.
   */
  const [creatingGuild, setCreatingGuild] = useState(false);

  /** A server waiting to be deleted, named so the question can name it back. */
  const [confirmDeleteGuild, setConfirmDeleteGuild] = useState<GuildView | null>(null);

  /**
   * Renaming, which asks with the browser's own prompt.
   *
   * A prompt rather than a dialog because there is nothing to decide: one field,
   * one answer, and the browser's is already open, already focused, and already
   * dismissed by Escape. Deleting gets a dialog below, because there everything is
   * worth a decision.
   */
  const renameTheServer = (guild: GuildView) => {
    const name = window.prompt(t.serverNamePlaceholder, guild.name);
    if (!name?.trim() || name.trim() === guild.name) return;
    void messagesStore.renameGuild(guild.id, name).then((result) => {
      flash(result.ok ? t.serverRenamed : t.serverRenameFailed);
    });
  };

  /**
   * The room the middle of the screen is showing, if any.
   *
   * A call and a channel are the same room to a person, so they are the same room
   * on screen — which is why this is one value and not two branches that happen
   * to look alike. A call that has not connected yet is not a room: there is
   * nobody in it to put a tile on, so it keeps the takeover screen.
   */
  const room: VoiceRoom | null = useMemo(() => {
    if (call.status === "active") {
      const startedAt = call.answeredAt || call.startedAt;
      return {
        kind: "call",
        id: call.callId,
        label: call.peerName || call.peerEmail,
        presences: call.participants
          .filter((person) => person.status !== "left")
          .map((person) => ({
            email: person.email,
            name: person.name,
            avatar: person.avatar,
            mic: person.mic,
            camera: person.camera,
            screen: person.screen,
            screenSurface: person.screenSurface,
            serverMuted: false,
            deafened: false,
            order: person.order,
            status: "active" as const,
            joinedAt: startedAt,
          })),
      };
    }
    const channelId = store.voiceChannelId;
    if (!channelId) return null;
    return {
      kind: "channel",
      id: channelId,
      label:
        activeGuild?.voiceChannels.find((channel) => channel.id === channelId)?.name ??
        t.voiceDeviceLabel,
      presences: liveVoicePresences(store.voiceRosters[channelId]),
    };
  }, [
    call.status,
    call.callId,
    call.peerName,
    call.peerEmail,
    call.participants,
    call.answeredAt,
    call.startedAt,
    store.voiceChannelId,
    store.voiceRosters,
    activeGuild,
    t.voiceDeviceLabel,
  ]);

  /** Whoever this account is, in whichever room it is in. */
  const roomSelf = useMemo<VoicePresence | null>(
    () => room?.presences.find((entry) => entry.email === store.email) ?? null,
    [room, store.email],
  );

  /** The people in the room, in the order the mesh was built from. */
  const roomPresences = useMemo(() => room?.presences ?? [], [room]);

  // A new room is a new room, and the choice to leave its view was made about the
  // last one. Keyed on the room's identity rather than on its label, because two
  // channels can carry the same name.
  useEffect(() => {
    setLeaveRoomView(false);
  }, [room?.id]);

  /**
   * Who could be brought into this room, from everybody this account knows.
   *
   * Friends and contacts alike, and not only the ones already in a conversation:
   * the person somebody wants in a voice channel is very often somebody they have
   * never messaged. Everybody already in the room is left out, because inviting
   * them again is a list that looks broken.
   */
  const roomInviteCandidates = useMemo(
    () =>
      callCandidates({
        friends: store.friends,
        contacts,
        chats: [],
        self: store.email,
        inCall: roomPresences.map((person) => person.email),
      }),
    [store.email, store.friends, contacts, roomPresences],
  );

  /**
   * A call that has not connected yet, and one that just ended.
   *
   * Neither is a room: there is nobody in the first to draw and nobody in the
   * second to remember, so both keep the takeover screen that says what is
   * happening.
   */
  const callSettling =
    call.status === "outgoing" || call.status === "connecting" || call.status === "ended";

  /**
   * Starts or stops sharing a screen with everybody in the channel.
   *
   * The store owns the media, so the view only says what it wants and reads back
   * whether it happened.
   */
  const toggleVoiceScreen = useCallback(
    async (channelId: string, share: boolean) => {
      const result = await messagesStore.setVoiceScreen(channelId, share, screenQuality);
      if (result.ok) return;
      // "Could not share", not "this browser cannot make calls".
      //
      // `no-screen` is what a share returns whether the person closed the picker,
      // the platform has no API, or a policy header refused it — the three are the
      // same three reasons it cannot tell them apart. Telling somebody their
      // browser is the problem when they pressed cancel is worse than saying
      // nothing, because it sends them looking for a setting that is not there.
      flash(t.callShareFailed);
    },
    [flash, screenQuality, t.callShareFailed],
  );

  /**
   * The four switches, told which room they are in.
   *
   * One set of buttons for a call and a channel, because a person pressing "mute"
   * in a room does not care which kind of room it is. What the switches do differs,
   * so the difference lives here rather than in four near-identical handlers.
   */
  const leaveRoom = useCallback(async () => {
    if (room?.kind === "call") await messagesStore.endCall("hangup");
    else if (room?.kind === "channel") await messagesStore.leaveVoiceChannel(room.id);
  }, [room]);

  const toggleRoomMic = useCallback(
    async (on: boolean) => {
      if (room?.kind === "call") {
        messagesStore.callMedia().setMic(on);
        await messagesStore.setCallMedia({ mic: on });
        return;
      }
      if (room?.kind === "channel") await messagesStore.setVoiceMic(room.id, on);
    },
    [room],
  );

  const toggleRoomScreen = useCallback(
    async (on: boolean) => {
      if (room?.kind === "channel") {
        await toggleVoiceScreen(room.id, on);
        return;
      }
      if (room?.kind !== "call") return;
      const changed = on
        ? await messagesStore.callMedia().startScreen(screenQuality)
        : await messagesStore.callMedia().stopScreen();
      // A share that did not start says so: a lit button over nothing is how a
      // person ends up showing a desktop nobody can see.
      if (!changed) {
        flash(t.callShareFailed);
        return;
      }
      await messagesStore.setCallMedia({ screen: on });
    },
    [room, screenQuality, toggleVoiceScreen, flash, t.callShareFailed],
  );

  const toggleRoomCamera = useCallback(
    async (on: boolean) => {
      if (room?.kind === "channel") {
        const result = await messagesStore.setVoiceCamera(room.id, on);
        if (!result.ok) flash(t.callUnsupported);
        return;
      }
      if (room?.kind !== "call") return;
      const changed = await messagesStore.callMedia().setCamera(on);
      // A camera that did not turn on says so, rather than leaving a lit button
      // over nothing.
      if (!changed) {
        flash(t.callUnsupported);
        return;
      }
      await messagesStore.setCallMedia({ camera: on });
    },
    [room, flash, t.callUnsupported],
  );

  const toggleRoomDeafen = useCallback(
    async (off: boolean) => {
      // Deafening is this device's own business: it stops the audio coming out of
      // it, and in a call that is the only side it can act on.
      if (room?.kind === "channel") await messagesStore.setVoiceDeafened(room.id, off);
      else setDeafened(off);
    },
    [room],
  );

  // The media layer is built once and handed to the store, which owns the
  // handshake and the conversation around it.
  useEffect(() => {
    messagesStore.attachCallMedia(messagesStore.callMedia());
    return () => messagesStore.clearCall();
  }, []);

  useEffect(() => {
    setLocalStream(store.localStream);
    setRemoteStreams(store.remoteStreams);
  }, [store.localStream, store.remoteStreams]);

  /** A call that is over closes itself, so the next one starts from clean. */
  useEffect(() => {
    if (call.status !== "ended") return;
    const timer = window.setTimeout(() => messagesStore.clearCall(), 4_000);
    return () => window.clearTimeout(timer);
  }, [call.status]);

  /**
   * Everybody this account could pull into the call, from its friends, its
   * contacts and its conversations. All three, because any of them can be
   * missing while the person is sitting right there in the chat list, and an
   * invite list that only knows about friendships shows an empty panel to
   * somebody who has a dozen conversations.
   */
  const callFriends = useMemo(
    () =>
      callCandidates({
        friends: store.friends,
        contacts,
        chats: chats.map((chat) => ({
          peerEmail: chat.peerEmail,
          peerName: contactsByEmail.get(chat.peerEmail)?.name ?? "",
        })),
        self: store.email,
        inCall: call.participants.filter((person) => !person.isSelf).map((person) => person.email),
      }),
    [call.participants, chats, contacts, contactsByEmail, store.email, store.friends],
  );

  const visibleChats = useMemo(() => {
    if (!needle) return chats;
    return chats.filter((chat) => {
      const contact = contactsByEmail.get(chat.peerEmail);
      const haystack = [
        contact?.name ?? "",
        // Deleted messages are skipped, so what was said stays unsearchable
        // rather than coming back through the search box.
        ...visibleMessages(chat).flatMap((message) => [
          messagePreview(message.text, t),
          ...(message.attachments ?? []).map((attachment) => attachment.name),
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(needle);
    });
  }, [chats, contactsByEmail, needle, t]);

  const visibleContacts = useMemo(() => {
    if (!needle) return contacts;
    return contacts.filter((contact) =>
      `${contact.name} ${contact.about} ${contact.peerEmail}`.toLocaleLowerCase().includes(needle),
    );
  }, [contacts, needle]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats],
  );
  const activeContact = activeChat ? (contactsByEmail.get(activeChat.peerEmail) ?? null) : null;
  const peerTyping = activeChat ? messagesStore.isPeerTyping(activeChat.id) : false;

  /** The channel column: every conversation, as a text channel is here. */
  const channelList = useMemo(
    () =>
      visibleChats.slice(0, 40).map((item) => ({
        id: item.id,
        name: contactsByEmail.get(item.peerEmail)?.name || item.peerEmail,
        unread: unreadIn(item),
      })),
    [visibleChats, contactsByEmail],
  );

  /**
   * Every accepted friend, as one row per person.
   *
   * Accepted friends and online contacts are two different sets, and reading
   * only the contacts is why a friend somebody had just added could be nowhere
   * on the screen: a friendship is a row in the store's own list, and a contact
   * is a row in the cloud snapshot, and accepting somebody writes to the first
   * one. Both are listed, friends first, and an address is never in the column
   * twice.
   *
   * A friend has no last-seen of their own, so the presence dot is answered
   * from the contact row where there is one, and left off where there is not
   * rather than guessed.
   *
   * The address is carried on the row because both places this list is drawn in
   * need it: the friends view opens a conversation from a row, and the right
   * hand column only ever wanted the face.
   */
  const friendRoster = useMemo(() => {
    const me = (store.email ?? "").trim().toLowerCase();
    const seen = new Set<string>();
    const people: FriendRow[] = [];
    for (const record of store.friends.friends) {
      const iAsked = (record.fromEmail ?? "").trim().toLowerCase() === me;
      const email = (iAsked ? record.toEmail : record.fromEmail) ?? "";
      const key = email.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const contact = contactsByEmail.get(key);
      people.push({
        email: key,
        name: (iAsked ? record.toName : record.fromName) || contact?.name || key,
        // The request only carries a face for the person who sent it, so the
        // other side is taken from the contact row.
        avatar: iAsked ? (contact?.avatar ?? null) : record.fromAvatar,
        accent: contact?.accent ?? "#5865f2",
        online: contact ? isOnlineAt(contact.lastSeenAt) : false,
        about: contact?.about ?? "",
        status: contact?.status ?? "online",
      });
    }
    return people;
  }, [store.friends, store.email, contactsByEmail]);

  const railFriends = useMemo(
    () =>
      friendRoster.map(({ name, avatar, accent, online }) => ({ name, avatar, accent, online })),
    [friendRoster],
  );

  const railOnline = useMemo(() => {
    // Deduped on the address rather than the name: two people can be called the
    // same thing, and one address appearing twice in the same column is a worse
    // mistake than a stranger showing up who is also a friend.
    const already = new Set(friendRoster.map((person) => person.email));
    return visibleContacts
      .filter((person) => isOnlineAt(person.lastSeenAt))
      .filter((person) => !already.has(person.peerEmail.trim().toLowerCase()))
      .map((person) => ({
        email: person.peerEmail.trim().toLowerCase(),
        name: person.name || person.peerEmail,
        avatar: person.avatar,
        accent: person.accent,
        about: person.about,
        online: true,
        status: person.status,
      }));
  }, [visibleContacts, friendRoster]);

  // The call that is up, whether it belongs to this conversation or another one.
  const liveCall = store.call;
  const incomingCall = liveCall.status === "incoming" ? liveCall : null;
  const callInThread = liveCall.status === "idle" || liveCall.status === "ended" ? null : liveCall;

  /**
   * Messages and calls read as one thread, and a call that is up right now is
   * the last line of it, because it started after everything already written.
   */
  const thread = useMemo(
    () =>
      timelineFor(activeChat ?? undefined, {
        viewer: data?.profile.email ?? "",
        call: callInThread,
      }),
    [activeChat, callInThread, data?.profile.email],
  );

  /**
   * Down to the newest message, but only while that is what the reader wants.
   *
   * This is the whole difference between a chat that follows you down and one that
   * yanks the page out from under you halfway through reading yesterday. The rule
   * is the one every messenger uses: if the scrollbar was already at the bottom,
   * keep it there as content arrives; if it was up somewhere, leave it there,
   * because they put it there.
   *
   * Measured against the height before the change rather than after, since by the
   * time content has grown the scrollbar is no longer at the bottom and "was it at
   * the bottom" has already lost the answer.
   */
  const followRef = useRef(true);
  const scrollToBottom = useCallback((force = false) => {
    const node = scrollRef.current;
    if (!node) return;
    if (!force) {
      const before = node.scrollHeight - node.clientHeight - node.scrollTop;
      // A few pixels of slack, because `clientHeight` is rounded to whole pixels
      // and a scrollbar that reads as "at the bottom" can land a pixel or two
      // short. Without the slack the chat stops following after the first message
      // for reasons nobody can see.
      if (before > 24) {
        followRef.current = false;
        return;
      }
    }
    node.scrollTop = node.scrollHeight;
    followRef.current = true;
  }, []);

  /**
   * Follow the bottom as the thread grows underneath.
   *
   * An effect keyed on the message count is not enough, and this was the actual
   * bug: a call card, an avatar or an image arrives with no height, and the browser
   * only learns how tall it is once it has loaded. Every one of those makes the
   * thread taller *after* the scroll has already happened, so the scrollbar is
   * left where it was — which on a long conversation is the top, because that is
   * where `scrollHeight` pointed before the pictures filled in.
   *
   * Watching the content's own box catches all of them at once, whenever they
   * arrive: an image decoding, a web font landing, a card settling into two lines.
   * Scrolling in the handler rather than in the observer callback is what keeps it
   * from fighting a person who is reading upwards.
   */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const content = node.firstElementChild;
    if (!content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (!followRef.current) return;
      node.scrollTop = node.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [activeChatId, thread.length]);

  useEffect(() => {
    /**
     * Forced on a change of conversation, because opening a chat is a request to
     * read it from the end and not a moment for leaving the reader where they
     * were.
     */
    scrollToBottom(true);
    const frame = window.requestAnimationFrame(() => scrollToBottom(true));
    return () => window.cancelAnimationFrame(frame);
  }, [activeChatId, scrollToBottom]);

  /**
   * A short chime when a message arrives in a conversation the user is not
   * looking at. The first pass only records what is already there, so opening
   * the page never plays a burst for the history it just loaded, and several
   * messages in one sync make a single sound.
   */
  const seenMessages = useRef<Set<string>>(new Set());
  const soundPrimed = useRef(false);
  useEffect(() => {
    const seen = seenMessages.current;
    const arrived: string[] = [];
    for (const chat of chats) {
      for (const message of chat.messages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        if (!message.fromMe && !message.deletedAt) arrived.push(chat.id);
      }
    }
    if (!soundPrimed.current) {
      soundPrimed.current = true;
      return;
    }
    if (arrived.length === 0) return;
    if (
      !shouldAnnounce({
        chatId: arrived[0] as string,
        activeChatId,
        visible: document.visibilityState === "visible" && document.hasFocus(),
      })
    ) {
      return;
    }
    playMessageSound();
  }, [activeChatId, chats]);

  // Browsers only let audio through after a gesture, so the first one is spent
  // on unlocking it rather than being swallowed.
  useEffect(() => {
    const unlock = () => unlockChatSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const openChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setShowList(false);
    // Opening a conversation is asking to read it, so the room's view steps aside.
    // Coming back is the channel's own row and the voice panel's, and both are on
    // screen while this is.
    setLeaveRoomView(true);
    void messagesStore.markRead(chatId);
  }, []);

  const openChatWithContact = useCallback((contact: ChatContact) => {
    const chatId = messagesStore.openChatWithContact(contact);
    setActiveChatId(chatId);
    setShowList(false);
    setLeaveRoomView(true);
  }, []);

  const startNewChat = useCallback(() => {
    const first = contacts[0];
    if (first) openChatWithContact(first);
    else {
      setShowList(true);
      setSidebarView("contacts");
    }
  }, [contacts, openChatWithContact]);

  const handleSend = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      if (!activeChat) return;
      const text = draft.trim();
      const attachments = pending;
      if (!text && attachments.length === 0) return;

      setDraft("");
      setPending([]);
      // The thread answers the press, so the hand never waits on the network.
      playSendSound();
      void messagesStore
        .sendMessage({
          chatId: activeChat.id,
          peerEmail: activeChat.peerEmail,
          text,
          attachments,
        })
        .then((result) => {
          if (result.ok) return;
          // Three different failures that all look like "it did not send" from the
          // chair: a server with nowhere to put a file, a connection that gave
          // out, and everything else. Only one of them is worth retrying, so the
          // word is chosen rather than guessed at.
          if (result.reason === "attachments-not-configured") flash(t.uploadUnavailable);
          else if (result.reason === "upload-failed") flash(t.uploadFailed);
          else flash(t.storageFull);
        });
    },
    [activeChat, draft, flash, pending, t.storageFull, t.uploadFailed, t.uploadUnavailable],
  );

  /**
   * Shares a message. A phone gets the system share sheet through the Web Share
   * API, everything else falls back to the clipboard, which is the one target
   * every desktop browser has.
   */
  const shareMessage = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value) return;
      const share = navigator.share?.bind(navigator);
      if (share) {
        try {
          await share({ text: value });
          return;
        } catch {
          // A cancelled sheet throws, and a clipboard is still there to try.
        }
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const field = document.createElement("textarea");
          field.value = value;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.append(field);
          field.select();
          document.execCommand("copy");
          field.remove();
        }
        flash(t.messageShared);
      } catch {
        flash(t.messageShareFailed);
      }
    },
    [flash, t.messageShareFailed, t.messageShared],
  );

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const room = MAX_ATTACHMENTS_PER_MESSAGE - pending.length;
      if (room <= 0) return;

      const accepted: IncomingAttachment[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        try {
          accepted.push(await fileToAttachment(file));
        } catch (error) {
          const reason = error instanceof Error ? error.message : "";
          // The limit is worked out from what this build can actually deliver, so
          // the number in the message is that one rather than a figure typed into
          // three languages and left to go stale.
          if (reason === "image-too-big") flash(t.imageTooBig(formatSize(MAX_IMAGE_BYTES)));
          else if (reason === "file-too-big") flash(t.fileTooBig(formatSize(MAX_FILE_BYTES)));
          else flash(t.fileUnreadable);
        }
      }
      if (accepted.length > 0) setPending((current) => [...current, ...accepted]);
    },
    // The copy object rather than the three keys: the messages are built from the
    // limits, so a change to either of them has to reach this closure.
    [flash, pending.length, t],
  );

  /**
   * Files dragged onto the conversation.
   *
   * Left unhandled, the browser does what a browser does with a file it has no
   * use for: it navigates to it. The tab then shows the file, or an empty page,
   * and the chat and the half-written message are gone — the drag destroys the
   * thing it was meant to add to. Inside the program the window is protected from
   * that navigation, so the same drag leaves the screen not reacting at all,
   * which is the same complaint said more quietly.
   *
   * A count rather than a flag per event: `dragleave` also fires when the pointer
   * crosses onto a child, so a boolean would flicker and the panel would blink
   * out from under the drag halfway across the thread.
   *
   * Files only. Text dragged in from another page is somebody's own words, and
   * swallowing it would eat the message they were trying to copy.
   */
  const dropDepthRef = useRef(0);
  const [dropActive, setDropActive] = useState(false);
  const carriesFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event)) return;
    // The default is to refuse the drop, which is what makes the cursor a bar
    // with a line through it: the one shape that says the window wants nothing
    // from you.
    event.preventDefault();
    dropDepthRef.current += 1;
    setDropActive(true);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = () => {
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) setDropActive(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dropDepthRef.current = 0;
    setDropActive(false);
    void addFiles(event.dataTransfer?.files ?? null);
  };

  /**
   * The window's answer to a file let go anywhere but the thread.
   *
   * Refusing the default is what stops the browser from navigating to the file,
   * and it has to be refused at the window rather than only where the files are
   * taken: the rail, the list and the profile are all nowhere to put a file, and
   * a person whose aim was a few pixels off should get nothing rather than lose
   * the conversation.
   */
  useEffect(() => {
    const refuse = (event: globalThis.DragEvent) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
        event.preventDefault();
      }
    };
    window.addEventListener("dragover", refuse);
    window.addEventListener("drop", refuse);
    return () => {
      window.removeEventListener("dragover", refuse);
      window.removeEventListener("drop", refuse);
    };
  }, []);

  const insertEmoji = useCallback((emoji: string) => {
    const field = textareaRef.current;
    setDraft((current) => {
      if (!field) return `${current}${emoji}`;
      const start = field.selectionStart ?? current.length;
      const end = field.selectionEnd ?? current.length;
      return `${current.slice(0, start)}${emoji}${current.slice(end)}`;
    });
    requestAnimationFrame(() => field?.focus());
  }, []);

  /**
   * A sticker leaves the tray on its own, the way the tray looks, so the draft
   * and anything already staged for the attachment tray stay untouched.
   */
  /**
   * A Giphy sticker is a remote file, so it travels as a short token in the
   * message text rather than as an uploaded attachment. That keeps sending
   * instant and costs no storage, and the receiver renders the same picture.
   */
  const sendGiphySticker = useCallback(
    (url: string) => {
      if (!activeChat) return;
      const text = giphyStickerText(url);
      if (!text) return;
      // A sticker is a message too, so it leaves with the same sound.
      playSendSound();
      void messagesStore
        .sendMessage({
          chatId: activeChat.id,
          peerEmail: activeChat.peerEmail,
          text,
          attachments: [],
        })
        .then((result) => {
          if (!result.ok) flash(t.storageFull);
        });
    },
    [activeChat, flash, t.storageFull],
  );

  const handleSelfAvatar = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const dataUrl = await fileToAvatarDataUrl(file);
        storageSet("userAvatar", dataUrl);
        writePersistedUserProfile({ avatar: dataUrl });
        const result = await messagesStore.updateProfile({ avatar: dataUrl });
        if (!result.ok) flash(t.storageFull);
      } catch {
        flash(t.imageTooBig(formatSize(MAX_IMAGE_BYTES)));
      }
    },
    [flash, t],
  );

  /**
   * Renaming this account.
   *
   * The local copy is written first and unconditionally, because the name is on
   * this screen before the request comes back and a widget that still says the
   * old name for a moment looks like the save failed. A refused request syncs
   * the store back down, which is what puts the old name back.
   */
  const handleSaveName = useCallback(
    async (name: string) => {
      const next = name.trim().slice(0, MAX_NAME_LENGTH);
      storageSet("userName", next);
      writePersistedUserProfile({ name: next });
      const result = await messagesStore.updateProfile({ name: next });
      if (!result.ok) {
        flash(t.statusSaveFailed);
        return false;
      }
      flash(t.nameSaved);
      return true;
    },
    [flash, t.nameSaved, t.statusSaveFailed],
  );

  // On a wide screen both panes are visible, so the most recent conversation is
  // opened as soon as the list arrives from the cloud. This is what makes the
  // right pane come up with a real thread and a working composer instead of the
  // "choose a conversation" placeholder. Narrow screens keep the list in front,
  // because jumping straight in would hide the chats the user came to browse.
  useEffect(() => {
    if (activeChatId || chats.length === 0) return;
    // Guarded: a throw here would blank the whole view, so an environment
    // without matchMedia simply keeps the placeholder instead.
    const wide =
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(min-width: 1024px)").matches;
    if (!wide) return;
    const newest = [...chats].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    })[0];
    if (newest) setActiveChatId(newest.id);
  }, [activeChatId, chats]);

  if (store.status === "needs-auth") {
    return <MessagesSignIn t={t} />;
  }

  if (store.status === "error" || (store.status === "loading" && !store.data)) {
    return (
      <MessagesUnavailable t={t} reason={store.error} onRetry={() => void messagesStore.retry()} />
    );
  }

  if (!data) {
    return (
      <MessagesUnavailable t={t} reason={store.error} onRetry={() => void messagesStore.retry()} />
    );
  }

  return (
    // The whole window, edge to edge.
    //
    // The header does not render on this route, so nothing is subtracted from
    // the height: the chat is the screen, with no strip above it and no margin
    // around it. `w-full` rather than `w-screen` sideways for the same reason
    // `w-full` rather than `100vw` — a viewport width includes the width of a
    // scrollbar that is not there, and invents one when there is.
    <main className="grid-bg relative m-0 h-[100dvh] w-full max-w-none overflow-hidden p-0">
      {store.mode === "local" ? (
        <div className="w-full max-w-none">
          <OfflineBanner t={t} onTryCloud={() => void messagesStore.promoteToCloud()} />
        </div>
      ) : null}
      {/**
       * The three columns, and only from a width that can hold them.
       *
       * Every column here is a fixed width that refuses to shrink, and the thread
       * between them is the only one that flexes, so the columns hold their places
       * while the conversation takes whatever is left. The reverse is what a
       * squeezed screen does: everything is sized by `flex-basis`, the thread is
       * squeezed to nothing, and the whole row shifts left as the browser makes
       * room for it.
       *
       * The people on the right wait for `xl` rather than `lg`. At `lg` the rail,
       * the channel list and the conversation list already want more width than a
       * 1280 screen has to give, and a right column that squeezes the chat is
       * worse than no right column.
       */}
      {/**
       * The screen, with nothing around it.
       *
       * Full width, full height, no rounded corners and no border: a chat that
       * stops short of the edge of the window is a chat with a margin around it,
       * and that margin is space that belongs to nothing. The columns inside are
       * the layout, and they divide what is left between them.
       */}
      <section
        ref={shellRef}
        className="discord-shell relative m-0 flex h-full w-full max-w-none flex-col overflow-hidden border-0 bg-card shadow-none backdrop-blur-xl lg:flex-row"
      >
        {/**
         * The rail is a wide screen's left edge, and on a phone it belongs
         * behind the menu button instead. Laid out as a row across the top it was
         * a strip of five roundels above the conversations, which is the one part
         * of the page a thumb cannot use and the part nothing on it is about, so
         * it carries `hidden lg:flex` itself rather than being wrapped: the shell's
         * children are the columns, and a wrapper between them would make the
         * rail a grandchild of a flex row, which lays out nothing.
         */}
        <ServerRail
          t={t}
          guilds={guilds}
          activeGuildId={activeGuildId}
          liveChannelIds={liveChannelIds}
          busy={creatingGuild}
          inApp={inProgram}
          onSelect={setActiveGuildId}
          onHome={() => {
            setActiveGuildId(null);
            setShowList(true);
          }}
          onCreate={() => {
            if (creatingGuild) return;
            const name = window.prompt(t.serverNamePlaceholder);
            if (!name?.trim()) return;
            setCreatingGuild(true);
            void messagesStore
              .createGuild(name)
              .then(async (result) => {
                if (!result.ok) {
                  flash(t.serverCreateFailed);
                  return;
                }
                flash(t.serverCreated);
                const guildId = result.guild?.id ?? "";
                if (!guildId) return;
                /**
                 * Everybody who is already a friend walks in with it.
                 *
                 * A server with one person in it is a note to self, and the people
                 * a person makes a server *with* are the ones they already know —
                 * so the friendship list is the membership list. The server chooses
                 * the addresses, not this call: it reads them out of the account's
                 * own friendship list, which is why one request can carry fifty
                 * people and cannot be pointed at a stranger.
                 *
                 * Failures are quiet on purpose. The server exists either way, and a
                 * person who made it does not need to be told that the automatic
                 * part did not happen — they can see who is in it, and the invite
                 * tile is still there for anybody who was missed.
                 */
                const joined = await messagesStore.addGuildFriends(guildId);
                if (joined.ok && joined.added > 0) {
                  flash(
                    joined.added === joined.wanted
                      ? t.serverFriendsJoined(joined.added)
                      : t.serverFriendsPartial(joined.added, joined.wanted),
                  );
                }
              })
              .finally(() => setCreatingGuild(false));
          }}
        />
        {/**
         * The second column, and only the second column.
         *
         * A server's channels and the conversation list name the same people, so
         * as two columns standing side by side they are one too many. They are
         * one column here that shows one of the two: a server's channels while a
         * server is open, the conversations and the shortcuts otherwise. Which
         * one is on screen is the server rail's answer — a roundel is the only
         * thing on screen that says which place you are in.
         *
         * The account widget and the voice panel live here rather than inside
         * either list, because they are not part of either one and must not move
         * when the list above them does.
         *
         * The width is a share of what is left, like every other column, and a
         * smaller one than the chat's: a list of names does not need as much
         * room as a conversation, and giving it equal room is what makes a panel
         * of short lines look stretched out of place.
         */}
        <div
          data-pane="list-col"
          className={`min-h-0 flex-1 basis-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:min-w-[16rem] ${
            showList ? "flex" : "hidden lg:flex"
          }`}
        >
          {activeGuild ? (
            <ChannelColumn
              t={t}
              guild={activeGuild}
              activeTextChannelId={activeChatId}
              activeVoiceChannelId={store.voiceChannelId}
              connectingChannelId={store.voiceConnectingId}
              selfEmail={store.email}
              voiceRosters={store.voiceRosters}
              canModerate={ownsGuild(activeGuild, store.email)}
              onSelectText={openChat}
              onSelectVoice={(channelId) => {
                // Walking into a channel somebody is already standing in joins the
                // room rather than starting a call: that is what makes it a channel
                // and not a conversation.
                void messagesStore.joinVoiceChannel(channelId, activeGuild.id);
                setActiveChatId(null);
                // And the room comes back into the middle of the screen. Pressing
                // the channel you are already standing in is the way back from a
                // conversation, so it has to work whether or not you are walking in
                // for the first time or just switching back.
                setLeaveRoomView(false);
              }}
              onLeaveVoice={(channelId) => void messagesStore.leaveVoiceChannel(channelId)}
              onServerMute={(channelId, email, muted) => {
                void messagesStore.setVoiceServerMute(channelId, email, muted);
              }}
              onInvite={() => flash(t.callInviteHint)}
              onCreateText={(name) => {
                void messagesStore.addGuildChannel({ guildId: activeGuild.id, kind: "text", name });
              }}
              onCreateVoice={(name) => {
                void messagesStore.addGuildChannel({
                  guildId: activeGuild.id,
                  kind: "voice",
                  name,
                });
              }}
              onGoToFriends={() => {
                // The friends live in the home column, so this is the rail's own
                // move: the server closes and the friends list opens already on the
                // friends tab, which is the list that has the button that adds one.
                setActiveGuildId(null);
                setSidebarView("friends");
                setShowList(true);
              }}
              onRenameServer={
                ownsGuild(activeGuild, store.email) ? () => renameTheServer(activeGuild) : undefined
              }
              onDeleteServer={
                ownsGuild(activeGuild, store.email)
                  ? () => setConfirmDeleteGuild(activeGuild)
                  : undefined
              }
            />
          ) : (
            <ChatSidebar
              t={t}
              lang={lang}
              onOpenMenu={() => setMenuOpen(true)}
              view={sidebarView}
              onViewChange={setSidebarView}
              live={store.live}
              online={store.online}
              localMode={store.mode === "local"}
              chats={visibleChats}
              contacts={visibleContacts}
              contactsByEmail={contactsByEmail}
              activeChatId={activeChatId}
              query={query}
              onQueryChange={setQuery}
              onSelectChat={openChat}
              onSelectContact={openChatWithContact}
              onClearPeople={() => messagesStore.clearPeople()}
              friends={store.friends}
              people={store.people}
              searching={store.searching}
              selfEmail={store.email}
              onSearchPeople={(value) => void messagesStore.searchPeople(value)}
              onAddFriend={(person) => {
                void messagesStore.sendFriendRequest(person).then((outcome) => {
                  flash(outcome.ok ? t.requestSent : t.storageFull);
                });
              }}
              onRespondFriend={(id, accept) => {
                // Find who asked so the conversation can open straight away.
                const incoming = store.friends.incoming.find((item) => item.id === id);
                void messagesStore.respondToFriendRequest(id, accept).then((result) => {
                  if (!result.ok) {
                    flash(t.storageFull);
                    return;
                  }
                  if (!accept) return;
                  const peerEmail = incoming?.fromEmail ?? "";
                  if (!peerEmail) return;
                  const chatId = messagesStore.openChatWithPeer(peerEmail, {
                    name: incoming?.fromName ?? "",
                    avatar: incoming?.fromAvatar ?? null,
                  });
                  if (chatId) {
                    setActiveChatId(chatId);
                    setShowList(false);
                    setSidebarView("chats");
                  }
                });
              }}
              onRemoveFriend={(id) => {
                void messagesStore.removeFriend(id);
              }}
              onOpenFriendChat={(peer) => {
                // A friend row knows the real name and avatar, so the conversation
                // opens labelled like a person rather than like an address.
                const chatId = messagesStore.openChatWithPeer(peer.email, {
                  name: peer.name,
                  avatar: peer.avatar,
                });
                if (!chatId) return;
                setActiveChatId(chatId);
                setShowList(false);
                // The conversation is the subject now, and the list the way back.
                setSidebarView("chats");
                void messagesStore.markRead(chatId);
              }}
              onFlash={flash}
              onNewChat={startNewChat}
              onAddContact={() => setContactDialogOpen(true)}
              onTogglePin={(chatId) => messagesStore.togglePin(chatId)}
              onRemoveChat={(chatId) => {
                setActiveChatId(null);
                void messagesStore.removeChat(chatId);
              }}
              confirmDeleteId={confirmDeleteId}
              onRequestDelete={setConfirmDeleteId}
              onConfirmDelete={(contactId) => {
                setConfirmDeleteId(null);
                void messagesStore.removeContact(contactId);
              }}
              className={showList ? "flex" : "hidden lg:flex"}
            />
          )}

          {/**
           * The voice panel and the account, at the foot of the column whatever
           * the list above them happens to be.
           *
           * The panel says which channel this device is on, and it is only on
           * screen while it is on one: a microphone that is open is not something
           * anybody should have to go looking for, and a panel that stays after
           * the call ends is a panel telling a lie.
           */}
          {room ? (
            <div className="shrink-0 px-2 pb-2">
              {/*
               * The screen on a row of its own, because a name that replaced the
               * panel's own line would push the room out of sight, and the room
               * is what a person checks to know where they are.
               */}
              {roomSelf?.screen ? (
                <SharedScreenStrip
                  t={t}
                  label={roomSelf.screenLabel || t.callScreenLabel}
                  onOpenQuality={() => setVoicePanel("quality")}
                />
              ) : null}

              <VoiceStatusPanel
                t={t}
                serverName={
                  room.kind === "channel"
                    ? (activeGuild?.name ?? "")
                    : call.peerName || t.callActive
                }
                channelName={room.kind === "channel" ? room.label : call.peerName || t.callActive}
                presence={roomSelf}
                onLeave={() => void leaveRoom()}
                onShowRoom={leaveRoomView ? () => setLeaveRoomView(false) : null}
              />

              {/*
               * The same four switches the bottom bar carries, reachable without
               * the cursor leaving the column.
               */}
              <VoiceQuickBar
                t={t}
                micOn={Boolean(roomSelf?.mic) && !roomSelf?.serverMuted}
                cameraOn={Boolean(roomSelf?.camera)}
                screenOn={Boolean(roomSelf?.screen)}
                deafened={Boolean(roomSelf?.deafened)}
                people={roomPresences}
                onMic={() => void toggleRoomMic(!(roomSelf?.mic ?? true))}
                onCamera={() => void toggleRoomCamera(!(roomSelf?.camera ?? false))}
                onScreen={() => void toggleRoomScreen(!(roomSelf?.screen ?? false))}
                onDeafen={() => void toggleRoomDeafen(!(roomSelf?.deafened ?? false))}
                onPeople={() => setShowChannelPeople((open) => !open)}
              />

              {showChannelPeople ? (
                <ChannelPeoplePanel
                  t={t}
                  selfEmail={store.email}
                  presences={roomPresences}
                  canModerate={Boolean(
                    activeGuild && ownsGuild(activeGuild, store.email) && room.kind === "channel",
                  )}
                  onServerMute={(email, muted) => {
                    if (room.kind !== "channel") return;
                    void messagesStore.setVoiceServerMute(room.id, email, muted);
                  }}
                  onClose={() => setShowChannelPeople(false)}
                />
              ) : null}
            </div>
          ) : null}

          {/**
           * The call dock, in the foot of this column above the account widget.
           *
           * It used to be pinned to the bottom-left of the whole page, which put it
           * straight on top of the widget: measured, the two overlapped by more
           * than half the widget's height at every width from the point the dock
           * appears. The two are the same column's furniture and belong to the same
           * column, so in the flow one above the other they cannot collide, and the
           * widget growing with a long name pushes the dock up instead of under it.
           */}
          {callUp ? (
            <div className="flex shrink-0 justify-center px-2 pb-2">
              <VoiceDock
                t={t}
                self={{
                  name: data.profile.name || data.profile.email,
                  avatar: data.profile.avatar,
                  accent: data.profile.accent,
                }}
                mic={call.mic}
                deafened={deafened}
                elapsed={callElapsed}
                onMic={() => {
                  const next = !call.mic;
                  messagesStore.callMedia().setMic(next);
                  void messagesStore.setCallMedia({ mic: next });
                }}
                onDeafen={() => setDeafened((current) => !current)}
                onLeave={() => void messagesStore.endCall("hangup")}
              />
            </div>
          ) : null}

          <AccountWidget
            t={t}
            profile={data.profile}
            online={store.online}
            localMode={store.mode === "local"}
            micOn={Boolean(callUp ? call.mic : (roomSelf?.mic ?? false))}
            cameraOn={Boolean(callUp ? call.camera : (roomSelf?.camera ?? false))}
            inVoice={Boolean(room)}
            deafened={deafened}
            themeId={themeId}
            callStatus={call.status}
            onOpenThemes={() => setThemesOpen(true)}
            onDownloadApp={downloadProgram}
            onDownloadAndroid={downloadAndroid}
            inApp={inProgram}
            onMic={(on) => {
              // The switch in the widget is the switch the call listens to, so a
              // person who mutes from the foot of the column is muted for
              // everybody, not just on their own screen.
              if (callUp) {
                messagesStore.callMedia().setMic(on);
                void messagesStore.setCallMedia({ mic: on });
                return;
              }
              if (room) void toggleRoomMic(on);
            }}
            onCamera={(on) => {
              if (callUp) {
                messagesStore.callMedia().setCamera(on);
                void messagesStore.setCallMedia({ camera: on });
                return;
              }
              if (room) void toggleRoomCamera(on);
            }}
            onDeafen={(on) => setDeafened(!on)}
            onSetStatus={(status) => {
              void messagesStore.setStatus(status).then((result) => {
                if (!result.ok) flash(t.statusSaveFailed);
              });
            }}
            onPickAvatar={() => avatarInputRef.current?.click()}
            onEditName={() => setEditNameOpen(true)}
            onSync={() => void messagesStore.sync()}
            onSwitchAccount={() => {
              // The messages session is one HttpOnly cookie per origin, so a
              // second account needs a fresh sign-in on this device.
              void messagesStore.signOut().then(() => {
                window.location.href = "/login";
              });
            }}
            onSignOut={() => void messagesStore.signOut()}
          />
        </div>

        {/**
         * The three switches that belong in the corner rather than in a bar
         * that has to be found. They live in the account widget at the foot of
         * this column, and the call dock that used to float over this corner now
         * sits above it in the same column, so nothing here is pinned to the page
         * and nothing can land on top of the profile.
         */}

        <div
          data-pane="thread"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative min-h-0 min-w-0 flex-[2.4] basis-0 flex-col border-border bg-background/40 lg:flex lg:border-l ${
            showList ? "hidden lg:flex" : "flex"
          }`}
        >
          {/**
           * The confirmation, over the thread, while the files are still held
           * above it.
           *
           * A drop that says nothing is a drop a person is not sure of: they
           * cannot tell a window that will take the file from one that will open
           * it and lose the conversation, which is exactly the doubt that made
           * them hesitate. Named over the thread rather than over the composer,
           * because it is the thread that will carry them.
           */}
          {dropActive ? (
            <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-background/80 backdrop-blur-sm">
              <div className="grid justify-items-center gap-2 rounded-3xl border-2 border-dashed border-brand/60 px-8 py-6 text-center">
                <Download className="size-6 text-brand" />
                <p className="font-display text-base font-bold">{t.dropFilesHere}</p>
                <p className="text-xs text-muted-foreground">{t.dropFilesHint}</p>
              </div>
            </div>
          ) : null}
          {/**
           * The room takes the middle of the screen, whatever kind it is.
           *
           * A call that has connected is a room, and drawing it as something else
           * meant two of everything: two stages, two bars, two sets of tiles, and
           * a call that looked like a different application from the channel two
           * fingers away. The chat goes where the room was, because a room you are
           * in is where you are now.
           *
           * Unless the arrow beside the invitation was pressed, which is the one
           * way to be in the room and be reading a conversation at the same time.
           * The microphone stays open either way — this is about what the middle of
           * the screen shows, not about whether you are connected.
           */}
          {room && !leaveRoomView ? (
            <>
              <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/60 px-3 py-3 backdrop-blur-xl sm:gap-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => setShowList(true)}
                  aria-label={t.back}
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <MenuButton t={t} onClick={() => setMenuOpen(true)} />
                {room.kind === "channel" ? (
                  <Volume2 className="size-5 shrink-0 text-[var(--discord-online)]" />
                ) : (
                  <Phone className="size-5 shrink-0 text-[var(--discord-online)]" />
                )}
                <h2 className="min-w-0 flex-1 truncate font-display text-sm font-bold">
                  {room.label}
                </h2>
                {/* How long they have been talking, beside the name rather than
                    under it, so a person looking for it finds it without reading
                    anything else. */}
                {room.kind === "call" && callElapsed ? (
                  <time
                    dateTime={`PT${callElapsed}`}
                    aria-label={`${t.callElapsed} ${callElapsed}`}
                    className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground"
                  >
                    {callElapsed}
                  </time>
                ) : null}

                {/**
                 * Who is in here, in the corner of the room.
                 *
                 * In the header rather than only on the quick bar down the column,
                 * because the header is the one part of a voice room a person is
                 * already looking at and the count is the question they opened it
                 * to answer — is anybody here, and is it the person I meant to come
                 * and find. It carries the number rather than being a bare icon: a
                 * people glyph is a button whose contents have to be guessed at,
                 * and the number is the answer.
                 *
                 * Its own popover rather than the panel down the column, because a
                 * button whose contents appear in a different column reads as
                 * broken for the half second before the eye catches up.
                 */}
                <Popover open={showRoomPeople} onOpenChange={setShowRoomPeople}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${t.callInChannel} — ${roomPresences.length}`}
                      title={t.callInChannel}
                      className={`relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors ${
                        showRoomPeople
                          ? "bg-[var(--accent)] text-foreground"
                          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      }`}
                    >
                      <Users className="size-4.5" />
                      {roomPresences.length > 0 ? (
                        <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-[var(--brand)] px-1 font-mono text-[0.55rem] leading-4 font-bold text-white">
                          {roomPresences.length}
                        </span>
                      ) : null}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    sideOffset={8}
                    collisionPadding={12}
                    className="w-64 border-border bg-popover p-2"
                  >
                    <p className="px-1 pb-1 font-mono text-[0.55rem] tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
                      {t.callInChannel}
                    </p>
                    <div className="max-h-72 overflow-y-auto">
                      <ChannelPeopleList
                        t={t}
                        selfEmail={store.email}
                        presences={roomPresences}
                        canModerate={Boolean(
                          activeGuild &&
                          ownsGuild(activeGuild, store.email) &&
                          room.kind === "channel",
                        )}
                        onServerMute={(email, muted) => {
                          if (room.kind !== "channel") return;
                          void messagesStore.setVoiceServerMute(room.id, email, muted);
                        }}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </header>

              <VoiceStage
                t={t}
                selfEmail={store.email}
                presences={roomPresences}
                streams={store.remoteStreams}
                screenStream={store.screenStream}
                localStream={store.localStream}
                onInvite={() =>
                  room.kind === "call"
                    ? void messagesStore.inviteToCall(call.peerEmail)
                    : flash(t.callInviteHint)
                }
                onActivity={() => {
                  window.location.href = "/games";
                }}
                onGoToChat={() => {
                  // The most recent conversation, so there is somewhere to type. A
                  // person who pressed this came to write, and landing on the
                  // friends list with no conversation open is the friends list with
                  // no conversation open.
                  const newest = chats[0];
                  if (newest) {
                    setActiveChatId(newest.id);
                    void messagesStore.markRead(newest.id);
                  }
                  setShowList(false);
                  setSidebarView("chats");
                  setLeaveRoomView(true);
                }}
                inviteCandidates={roomInviteCandidates}
                onInvitePick={(email) => {
                  if (room.kind !== "channel" || !activeGuild) return;
                  void messagesStore.addGuildMember(activeGuild.id, email).then((result) => {
                    flash(result.ok ? t.callInviteSent : t.callInviteFailed);
                    if (result.ok) void messagesStore.sync();
                  });
                }}
              />

              <VoiceControlBar
                t={t}
                presence={roomSelf}
                remoteStreams={store.remoteStreams}
                micDeviceOpen={voicePanel === "mic"}
                cameraDeviceOpen={voicePanel === "camera"}
                qualityOpen={voicePanel === "quality"}
                quality={screenQuality}
                onQualityMenu={() => setVoicePanel(voicePanel === "quality" ? null : "quality")}
                onQualityPick={(next) => {
                  setScreenQuality(next);
                  setVoicePanel(null);
                }}
                onToggleMic={() => void toggleRoomMic(!(roomSelf?.mic ?? true))}
                onToggleCamera={() => void toggleRoomCamera(!(roomSelf?.camera ?? false))}
                onToggleScreen={() => void toggleRoomScreen(!(roomSelf?.screen ?? false))}
                onToggleDeafen={() => void toggleRoomDeafen(!(roomSelf?.deafened ?? false))}
                onLeave={() => void leaveRoom()}
                onMicMenu={() => setVoicePanel(voicePanel === "mic" ? null : "mic")}
                onCameraMenu={() => setVoicePanel(voicePanel === "camera" ? null : "camera")}
                onMore={() => flash(t.callMore)}
              />
            </>
          ) : activeChat && activeContact ? (
            <>
              <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/60 px-3 py-3 backdrop-blur-xl sm:gap-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => setShowList(true)}
                  aria-label={t.back}
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <MenuButton t={t} onClick={() => setMenuOpen(true)} />
                <ContactAvatar contact={activeContact} t={t} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-sm font-bold">{activeContact.name}</h2>
                  <p className="truncate text-[0.7rem] text-muted-foreground">
                    {peerTyping ? (
                      <span className="flex items-center gap-1.5 text-brand">
                        <span className="flex items-end gap-1" aria-hidden="true">
                          <span className="size-1.5 animate-tk-bounce rounded-full bg-brand" />
                          <span className="size-1.5 animate-tk-bounce rounded-full bg-brand [animation-delay:120ms]" />
                          <span className="size-1.5 animate-tk-bounce rounded-full bg-brand [animation-delay:240ms]" />
                        </span>
                        {t.typing}
                      </span>
                    ) : isOnlineAt(activeContact.lastSeenAt) ? (
                      t.activeNow
                    ) : (
                      formatLastSeen(activeContact.lastSeenAt, t, lang)
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      void messagesStore
                        .beginCall({ chatId: activeChat.id, starts: "audio" })
                        .then((result) => {
                          // A call that cannot be placed says so, rather than
                          // leaving a screen that reads "connecting" for ever
                          // while nothing at all is happening behind it.
                          if (result.ok) return;
                          if (result.reason === "offline") flash(t.callNoCloud);
                          else if (result.reason === "no-address") flash(t.callNoAddress);
                          else if (result.reason === "busy") flash(t.callEndedBusy);
                        });
                    }}
                    aria-label={t.callAudio}
                    title={t.callAudio}
                    className="grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-brand sm:grid"
                  >
                    <Phone className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void messagesStore
                        .beginCall({ chatId: activeChat.id, starts: "video" })
                        .then((result) => {
                          if (result.ok) return;
                          if (result.reason === "offline") flash(t.callNoCloud);
                          else if (result.reason === "no-address") flash(t.callNoAddress);
                          else if (result.reason === "busy") flash(t.callEndedBusy);
                        });
                    }}
                    aria-label={t.callVideo}
                    title={t.callVideo}
                    className="grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-brand sm:grid"
                  >
                    <Video className="size-4" />
                  </button>
                  <ChatSettingsMenu
                    t={t}
                    chat={activeChat}
                    contact={activeContact}
                    profile={data.profile}
                    chats={chats}
                    contacts={contacts}
                    lang={lang}
                    themeId={themeId}
                    onOpenThemes={() => setThemesOpen(true)}
                    onFlash={flash}
                  />
                </div>
              </header>

              <div
                ref={scrollRef}
                onScroll={() => {
                  /**
                   * Read by hand as well as by the resize watcher, because a
                   * reader who scrolls up is telling us something the thread's
                   * size cannot: they have gone to look at something. The slack is
                   * the same few pixels `scrollToBottom` allows, so the flag does
                   * not flicker between true and false on a drag that happens to
                   * end a pixel short.
                   */
                  const node = scrollRef.current;
                  if (!node) return;
                  const slack = node.scrollHeight - node.clientHeight - node.scrollTop;
                  followRef.current = slack <= 24;
                }}
                className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto overscroll-contain overflow-x-hidden bg-background/60 px-2 py-2 sm:px-3 sm:py-2.5"
              >
                {thread.length === 0 ? (
                  <div className="mx-auto mt-10 max-w-sm text-center">
                    <ContactAvatar contact={activeContact} t={t} size="lg" />
                    <p className="mt-4 font-display text-lg font-bold">{activeContact.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {activeContact.about || t.writeMessage}
                    </p>
                  </div>
                ) : (
                  thread.map((entry, index) => {
                    const previous = thread[index - 1];
                    const showDay = !previous || dayKey(previous.at) !== dayKey(entry.at);
                    return (
                      <div key={`${entry.kind}-${entry.id}`}>
                        {showDay ? (
                          <div className="my-5 flex items-center justify-center">
                            <span className="rounded-full border border-border/70 bg-surface/80 px-4 py-1 font-mono text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase">
                              {formatDayLabel(entry.at, t)}
                            </span>
                          </div>
                        ) : null}
                        {entry.kind === "call" ? (
                          <CallEntry
                            t={t}
                            entry={entry}
                            peerName={activeContact.name || activeContact.peerEmail}
                            onAnswer={() => void messagesStore.answerCall()}
                            onDecline={() => void messagesStore.endCall("declined")}
                            onHangup={() => void messagesStore.endCall("hangup")}
                            onCancel={() => void messagesStore.endCall("hangup")}
                            onOpenCall={(starts) =>
                              void messagesStore.beginCall({ chatId: activeChat.id, starts })
                            }
                          />
                        ) : (
                          <MessageBubble
                            message={entry.message}
                            profile={data.profile}
                            peer={{
                              name: activeContact.name || activeContact.peerEmail,
                              avatar: activeContact.avatar,
                              accent: activeContact.accent,
                            }}
                            grouped={
                              previous?.kind === "message" &&
                              previous.message.fromMe === entry.message.fromMe &&
                              entry.at - previous.at < 7 * 60_000
                            }
                            upload={uploads[entry.message.id]}
                            t={t}
                            composerRef={composerRef}
                            email={data.profile.email}
                            onSaveEdit={async (text) => {
                              const result = await messagesStore.editMessage({
                                chatId: activeChat.id,
                                messageId: entry.message.id,
                                text,
                              });
                              if (!result.ok) flash(t.messageActionFailed);
                              return result.ok;
                            }}
                            onDelete={async () => {
                              const result = await messagesStore.deleteMessage({
                                chatId: activeChat.id,
                                messageId: entry.message.id,
                              });
                              if (!result.ok) flash(t.messageActionFailed);
                              return result.ok;
                            }}
                            onShare={(text) => void shareMessage(text)}
                            onReact={(emoji) => {
                              void messagesStore
                                .toggleReaction({
                                  chatId: activeChat.id,
                                  messageId: entry.message.id,
                                  emoji,
                                })
                                .then((result) => {
                                  if (!result.ok) flash(t.messageActionFailed);
                                });
                            }}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {pending.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto overscroll-x-contain border-t border-border/60 bg-card/40 px-3 py-2.5 sm:px-5">
                  {pending.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="relative flex shrink-0 items-center gap-2 rounded-2xl border border-border/70 bg-surface/70 p-2 pr-8"
                    >
                      {attachment.kind === "image" ? (
                        <span
                          style={{ backgroundImage: `url("${attachment.dataUrl}")` }}
                          className="size-11 shrink-0 rounded-xl bg-cover bg-center"
                        />
                      ) : (
                        <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand">
                          <FileText className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block max-w-[9rem] truncate text-[0.7rem] font-normal">
                          {attachment.name}
                        </span>
                        <span className="block font-mono text-[0.55rem] text-muted-foreground">
                          {formatSize(attachment.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPending((current) =>
                            current.filter((item) => item.id !== attachment.id),
                          )
                        }
                        aria-label={t.delete}
                        className="absolute right-1 top-1 grid size-5 cursor-pointer place-items-center rounded-full bg-background/80 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <form
                ref={composerRef}
                onSubmit={handleSend}
                className="flex shrink-0 items-end gap-1.5 border-t border-border/60 bg-card/60 px-2 py-2 backdrop-blur-xl sm:gap-2 sm:px-3"
              >
                {/* The tray of tools never shrinks; the field takes what is left. */}
                <div className="flex shrink-0 items-center gap-0.5 pb-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={t.emoji}
                        className="grid size-9 max-[380px]:size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-brand"
                      >
                        <Smile className="size-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="top"
                      sideOffset={10}
                      collisionPadding={12}
                      className="w-[min(21rem,calc(100vw-1.5rem))] border-border/70 bg-popover/95 p-3 backdrop-blur-xl"
                    >
                      <EmojiPicker t={t} onPick={insertEmoji} />
                    </PopoverContent>
                  </Popover>
                  <Popover open={stickerTrayOpen} onOpenChange={setStickerTrayOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={t.stickers}
                        title={t.stickers}
                        className="grid size-9 max-[380px]:size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-brand"
                      >
                        <Sticker className="size-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="top"
                      sideOffset={10}
                      collisionPadding={12}
                      // Sized against the viewport so it never runs off a phone,
                      // and clipped so a tile can never paint outside the frame.
                      className="w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden border-border/70 bg-popover/95 p-3 backdrop-blur-xl"
                    >
                      <StickerPicker
                        t={t}
                        onSend={(url) => {
                          sendGiphySticker(url);
                          setStickerTrayOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    aria-label={t.attachImage}
                    title={t.attachImage}
                    className="grid size-9 max-[380px]:size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-brand"
                  >
                    <ImageIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label={t.attachFile}
                    title={t.attachFile}
                    className="grid size-9 max-[380px]:size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-brand"
                  >
                    <Paperclip className="size-4" />
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  rows={1}
                  placeholder={t.placeholder}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (activeChat) {
                      messagesStore.notifyTyping(activeChat.id, activeChat.peerEmail);
                    }
                  }}
                  onFocus={(event) => {
                    // On a phone the soft keyboard covers the composer unless the
                    // field is pulled back into the visual viewport.
                    event.currentTarget.scrollIntoView({ block: "nearest" });
                  }}
                  onBlur={() => {
                    if (activeChat) {
                      messagesStore.stopTyping(activeChat.id, activeChat.peerEmail);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (activeChat) {
                        messagesStore.stopTyping(activeChat.id, activeChat.peerEmail);
                      }
                      handleSend();
                    }
                  }}
                  className="max-h-32 min-h-[42px] min-w-0 flex-1 resize-none rounded-3xl border border-border/70 bg-surface/70 px-3 py-2.5 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60 sm:px-4"
                />
                {draft.trim() || pending.length > 0 ? (
                  <button
                    type="submit"
                    aria-label={t.send}
                    className="grid size-11 max-[380px]:size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-brand text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_18px_rgba(29,185,84,0.35)]"
                  >
                    <Send className="size-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="voice"
                    className="grid size-11 max-[380px]:size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
                  >
                    <Mic className="size-4" />
                  </button>
                )}
              </form>
            </>
          ) : (
            /**
             * Nothing open: the friends, in the middle of the screen.
             *
             * This is what the design puts here when no conversation has been
             * picked, and it is a better answer than the old "choose a
             * conversation" panel — that one only told a person with no friends
             * that they had no friends, and gave somebody with twelve of them no
             * way to reach any of the twelve from the middle of the screen. A
             * row opens the conversation, so the thread still lands in this same
             * column.
             */
            <FriendsView
              t={t}
              friends={friendRoster}
              query={friendQuery}
              onQueryChange={setFriendQuery}
              onOpenChat={(person) => {
                const chatId = messagesStore.openChatWithPeer(person.email, {
                  name: person.name,
                  avatar: person.avatar,
                });
                if (!chatId) return;
                setActiveChatId(chatId);
                setShowList(false);
                setSidebarView("chats");
                void messagesStore.markRead(chatId);
              }}
              onRemoveFriend={(email) => {
                // The store removes by request id, and the row knows only the
                // address, so the record is looked up rather than guessed at.
                const record = store.friends.friends.find(
                  (item) =>
                    item.fromEmail.trim().toLocaleLowerCase() === email ||
                    item.toEmail.trim().toLocaleLowerCase() === email,
                );
                if (record) void messagesStore.removeFriend(record.id);
              }}
              onRespondFriend={(id, accept) => {
                const incoming = store.friends.incoming.find((item) => item.id === id);
                void messagesStore.respondToFriendRequest(id, accept).then((result) => {
                  if (!result.ok) {
                    flash(t.storageFull);
                    return;
                  }
                  if (!accept) return;
                  const peerEmail = incoming?.fromEmail ?? "";
                  if (!peerEmail) return;
                  const chatId = messagesStore.openChatWithPeer(peerEmail, {
                    name: incoming?.fromName ?? "",
                    avatar: incoming?.fromAvatar ?? null,
                  });
                  if (chatId) {
                    setActiveChatId(chatId);
                    setShowList(false);
                    setSidebarView("chats");
                  }
                });
              }}
            />
          )}
        </div>

        {/* A ringing call waits at the bottom of the hub, in whatever
              conversation the user happens to be reading, and is answered from
              there rather than by a screen that takes everything away. */}
        {incomingCall ? (
          <IncomingCallBar
            t={t}
            call={incomingCall}
            onAnswer={() => void messagesStore.answerCall()}
            onDecline={() => void messagesStore.endCall("declined")}
          />
        ) : null}

        {/**
         * Only while there is no room yet.
         *
         * A call that is still ringing, connecting, or has just ended has nobody
         * in it to put a tile on, so it keeps the takeover screen that says what is
         * happening. Once it connects it is a room, and a room is drawn in the
         * middle of the screen like every other room.
         */}
        {callSettling ? (
          <CallScreen
            t={t}
            call={call}
            remoteStreams={remoteStreams}
            localStream={localStream}
            friends={callFriends}
            inCall={call.participants
              .filter((person) => !person.isSelf)
              .map((person) => person.email)}
            onInvite={(email) => {
              // Pulling somebody into a call that is already up is not a new
              // call: they are added to this one, and the rest of the call is
              // told so the tiles appear before they are even connected.
              void messagesStore.inviteToCall(email);
            }}
            onActivity={() => {
              window.location.href = "/games";
            }}
            onAccept={() => void messagesStore.answerCall()}
            onDecline={() => void messagesStore.endCall("declined")}
            onMute={() => {
              const next = !call.mic;
              messagesStore.callMedia().setMic(next);
              void messagesStore.setCallMedia({ mic: next });
            }}
            onCamera={() => {
              const next = !call.camera;
              messagesStore.callMedia().setCamera(next);
              void messagesStore.setCallMedia({ camera: next });
            }}
            onScreen={() => {
              const media = messagesStore.callMedia();
              const next = !call.screen;
              void (next ? media.startScreen() : media.stopScreen())
                .then((changed) => {
                  // A share that did not start says so: a button that stays lit
                  // over nothing is how people end up sharing nothing and
                  // wondering why nobody can see it.
                  if (!changed) {
                    if (next) flash(t.callShareFailed);
                    return;
                  }
                  void messagesStore.setCallMedia({ screen: next });
                })
                .catch(() => flash(t.callShareFailed));
            }}
            onSettings={(kind, deviceId) => {
              // The picker is a live switch: the chosen device takes the
              // sender's place, so the call never breaks for it.
              void messagesStore
                .callMedia()
                .switchInput(kind === "mic" ? "audio" : "video", deviceId);
            }}
            onEnd={() => void messagesStore.endCall("hangup")}
          />
        ) : null}

        {/* The people in the call, at the far right of the row and after the
            chat, so the conversation keeps the middle of the screen and the
            roster sits where a list of people belongs: at the end of it. */}
        <MemberRail
          t={t}
          inCall={
            callUp
              ? call.participants
                  .filter((person) => !person.isSelf)
                  .map((person) => ({
                    name: person.name || person.email,
                    avatar: person.avatar,
                    accent: person.isSelf ? "#1DB954" : "#22d3ee",
                    muted: !person.mic,
                    voice: carriesAudio(remoteStreams[person.email]),
                  }))
              : []
          }
          friends={friendRoster.slice(0, 24)}
          online={railOnline.slice(0, 24)}
        />
      </section>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelfAvatar}
      />

      <EditNameDialog
        t={t}
        open={editNameOpen}
        current={data.profile.name}
        onOpenChange={setEditNameOpen}
        onSave={handleSaveName}
      />

      {/**
       * The phone's menu, standing over the page.
       *
       * The servers and the four shortcuts, which on a wide screen live in the
       * rail down the side and at the top of the list. A phone has no room for a
       * column beside the conversation and no room for a row above it, so both go
       * in here and the page gets its height back. Escape, a tap on the dimmed
       * page, and the cross at the top all close it, which is the behaviour a
       * drawer is expected to have without being asked for.
       */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="flex w-[min(17rem,80vw)] flex-col gap-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-0 sm:max-w-[17rem]"
        >
          <SheetTitle className="sr-only">{t.menuTitle}</SheetTitle>
          <ServerRail
            t={t}
            guilds={guilds}
            activeGuildId={activeGuildId}
            liveChannelIds={liveChannelIds}
            busy={creatingGuild}
            layout="column"
            inApp={inProgram}
            onNavigate={() => setMenuOpen(false)}
            onSelect={(guildId) => {
              setActiveGuildId(guildId);
              setShowList(true);
            }}
            onHome={() => {
              setActiveGuildId(null);
              setShowList(true);
            }}
            onCreate={() => setMenuOpen(false)}
          />
          {/**
           * The shortcuts travel with the servers, because on a phone they were
           * the other half of the same row: a person reaching for a server and a
           * person reaching for a friend should not have to open two different
           * things to get there.
           */}
          <nav
            aria-label={t.title}
            className="flex flex-col gap-0.5 border-t border-[var(--border)] p-2"
          >
            {SIDEBAR_NAV.map(({ id, label, Icon }) => {
              const here = sidebarView === id;
              const pending = id === "friends" && store.friends.incoming.length > 0;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSidebarView(id);
                    if (id === "friends") messagesStore.clearPeople();
                    setMenuOpen(false);
                  }}
                  aria-current={here ? "page" : undefined}
                  className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 text-left text-[0.85rem] transition-colors ${
                    here
                      ? "bg-[var(--accent)] text-foreground"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t[label]}</span>
                  {pending ? (
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--destructive)] text-[0.65rem] font-bold text-white">
                      {store.friends.incoming.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
            <a
              href="/games"
              className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 text-left text-[0.85rem] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]/60 hover:text-foreground"
            >
              <Gamepad2 className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t.navGames}</span>
            </a>
          </nav>
        </SheetContent>
      </Sheet>

      <ContactDialog
        t={t}
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        onCreate={async (input) => {
          const result = await messagesStore.addContact(input);
          if (!result.ok) {
            flash(t.storageFull);
            return false;
          }
          setContactDialogOpen(false);
          setSidebarView("chats");
          return true;
        }}
      />

      {/**
       * The themes.
       *
       * Sits outside the conversation's own menu rather than inside it: the menu
       * is three export buttons wide, and a grid of gradients is not something to
       * fold into that. Opened from there, applied from here.
       */}
      <ChatThemesDialog
        t={t}
        open={themesOpen}
        onOpenChange={setThemesOpen}
        themeId={themeId}
        onSelect={(id) => {
          setThemeId(id);
          writeChatThemeId(id);
        }}
      />

      {/**
       * Deleting a server.
       *
       * Its own dialog, and not a `confirm()`, because the answer matters and the
       * stakes are not this device's: the server goes for everybody in it, the
       * channels go with it, and there is nothing to undo. A browser confirm says
       * "are you sure" about a question nobody read, and its OK button is the one
       * anybody's finger is already on when the question appears.
       *
       * So it names the server, says who is in it, and asks once more with the
       * destructive button the one that is not focused.
       */}
      <AlertDialog
        open={confirmDeleteGuild !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteGuild(null);
        }}
      >
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.serverDeleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteGuild
                ? t.serverDeleteConfirmBody(confirmDeleteGuild.name)
                : t.serverDeleteConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // The default action is focused, which is wrong for the one that
                // cannot be taken back. Refusing the default here and doing the
                // work ourselves is what puts the safe button under the finger.
                event.preventDefault();
                const guild = confirmDeleteGuild;
                setConfirmDeleteGuild(null);
                if (!guild) return;
                void messagesStore.deleteGuild(guild.id).then((result) => {
                  if (!result.ok) {
                    flash(t.serverDeleteFailed);
                    return;
                  }
                  // It may be the one on screen, and a column still drawing a
                  // server that is gone is a server somebody will try to click.
                  setActiveGuildId((current) => (current === guild.id ? null : current));
                  flash(t.serverDeleted);
                });
              }}
              className="bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90"
            >
              {t.serverDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {notice ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-5 py-2 text-xs text-red-300 backdrop-blur-xl">
            {notice}
          </span>
        </div>
      ) : null}
    </main>
  );
}

function MessagesUnavailable({
  t,
  reason,
  onRetry,
}: {
  t: MessagesCopy;
  reason: string;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid-bg flex min-h-[calc(100dvh-68px)] items-center justify-center px-4 py-10">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-border/70 bg-card/80 p-6 text-center shadow-glow backdrop-blur-xl sm:p-8">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300">
          <CloudOff className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t.syncFailedTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.syncFailedBody}</p>
        {reason ? (
          <p className="mt-3 font-mono text-[0.6rem] tracking-[0.1em] text-muted-foreground/70 uppercase">
            {reason}
          </p>
        ) : null}
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              onRetry();
              window.setTimeout(() => setBusy(false), 1500);
            }}
            disabled={busy}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 font-mono text-xs font-bold tracking-[0.18em] text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {t.retry}
          </button>
          <button
            type="button"
            onClick={() => messagesStore.goLocal()}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-6 py-3 font-mono text-xs font-bold tracking-[0.18em] text-brand transition-colors hover:bg-brand/20"
          >
            <CloudOff className="size-3.5" />
            {t.continueOffline}
          </button>
        </div>
      </div>
    </main>
  );
}

function OfflineBanner({ t, onTryCloud }: { t: MessagesCopy; onTryCloud: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[0.7rem] text-amber-200">
      <span className="flex items-center gap-1.5 font-bold">
        <CloudOff className="size-3.5 shrink-0" />
        {t.localModeBadge}
      </span>
      <span className="min-w-0 flex-1 font-normal text-amber-100/80">{t.localModeBody}</span>
      <button
        type="button"
        onClick={onTryCloud}
        className="label-mono shrink-0 cursor-pointer text-[0.55rem] text-amber-200 transition-colors hover:text-white"
      >
        {t.tryCloudAgain}
      </button>
    </div>
  );
}

function MessagesSignIn({ t }: { t: MessagesCopy }) {
  const session = readPersistedAuthSession();
  const [email, setEmail] = useState(session?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await messagesStore.signIn(email, password);
      if (!result.ok) {
        setError(result.reason === "network" ? t.syncFailedBody : t.unlockInvalid);
      } else setPassword("");
    } catch (caught) {
      console.warn("Messages session failed.", caught);
      setError(t.syncFailedBody);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid-bg flex min-h-[calc(100dvh-68px)] items-center justify-center px-4 py-10">
      <form
        onSubmit={submit}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-border/70 bg-card/80 p-6 shadow-glow backdrop-blur-xl sm:p-8"
      >
        <span className="mb-4 grid size-12 place-items-center rounded-2xl border border-brand/30 bg-brand/10 text-brand">
          <ShieldCheck className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t.unlockTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.unlockBody}</p>

        <div className="mt-6 grid gap-3">
          <label className="grid gap-1.5">
            <span className="label-mono text-[0.55rem]">{t.unlockEmail}</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-border/70 bg-surface/70 px-4 py-2.5 text-sm font-normal outline-none transition-colors focus:border-brand/60"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="label-mono text-[0.55rem]">{t.unlockPassword}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-border/70 bg-surface/70 px-4 py-2.5 text-sm font-normal outline-none transition-colors focus:border-brand/60"
            />
          </label>
        </div>

        {error ? (
          <span className="mt-4 block rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-[0.7rem] text-red-300">
            {error}
          </span>
        ) : null}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 font-mono text-xs font-bold tracking-[0.18em] text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          {t.unlockSubmit}
        </button>

        {/**
         * The site's own sign-in, under the button.
         *
         * This screen asks for an account in a hurry, with two fields and no way
         * to see anything else. Somebody who already has one, or who would rather
         * register where there is a Google button and a password reset, is sent
         * there rather than left to guess that the address bar knows something
         * this page does not.
         *
         * A new tab, because the lock screen is worth keeping: the person comes
         * back to it after signing in, and in the program the shell sends the link
         * to the browser rather than walking this window out of the app.
         */}
        <a
          href={SITE_SIGN_IN}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-surface/50 px-4 py-3 transition-colors hover:border-brand/50 hover:bg-surface"
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-[0.7rem] font-bold tracking-[0.18em] text-foreground uppercase">
              {t.siteSignIn}
            </span>
            <span className="text-[0.7rem] text-muted-foreground">{t.siteSignInHint}</span>
          </span>
          <LogIn className="size-4 shrink-0 text-brand" />
        </a>
      </form>
    </main>
  );
}

type ChatSidebarProps = {
  t: MessagesCopy;
  lang: Lang;
  /** Opens the servers and the shortcuts, which a phone keeps behind a button. */
  onOpenMenu: () => void;
  view: "chats" | "contacts" | "friends";
  onViewChange: (view: "chats" | "contacts" | "friends") => void;
  live: boolean;
  online: boolean;
  localMode: boolean;
  chats: MessageChat[];
  contacts: ChatContact[];
  contactsByEmail: Map<string, ChatContact>;
  activeChatId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectChat: (chatId: string) => void;
  onSelectContact: (contact: ChatContact) => void;
  onClearPeople: () => void;
  friends: FriendsSnapshot;
  people: DirectoryEntry[];
  searching: boolean;
  selfEmail: string;
  onSearchPeople: (query: string) => void;
  onAddFriend: (person: DirectoryEntry) => void;
  onRespondFriend: (id: string, accept: boolean) => void;
  onRemoveFriend: (id: string) => void;
  onOpenFriendChat: (peer: { email: string; name: string; avatar: string | null }) => void;
  onFlash: (message: string) => void;
  onNewChat: () => void;
  onAddContact: () => void;
  onTogglePin: (chatId: string) => void;
  onRemoveChat: (chatId: string) => void;
  confirmDeleteId: string | null;
  onRequestDelete: (contactId: string) => void;
  onConfirmDelete: (contactId: string) => void;
  className?: string;
};

/**
 * The four shortcuts under the search, as the design has them.
 *
 * A row each rather than a segmented control: they are four different places,
 * not three views of one, so a control that looks like it holds one of three
 * would be lying about the fourth. Games is a link out to the site rather than a
 * view, which is why it carries no active state.
 */
const SIDEBAR_NAV: Array<{
  id: "chats" | "contacts" | "friends";
  label: "navChats" | "navContacts" | "navFriends";
  Icon: typeof MessageSquarePlus;
}> = [
  { id: "chats", label: "navChats", Icon: MessageSquarePlus },
  { id: "contacts", label: "navContacts", Icon: Users },
  { id: "friends", label: "navFriends", Icon: UserPlus },
];

function ChatSidebar({
  t,
  lang,
  onOpenMenu,
  view,
  onViewChange,
  live,
  online,
  localMode,
  chats,
  contacts,
  contactsByEmail,
  activeChatId,
  query,
  onQueryChange,
  onSelectChat,
  onSelectContact,
  onClearPeople,
  friends,
  people,
  searching,
  selfEmail,
  onSearchPeople,
  onAddFriend,
  onRespondFriend,
  onRemoveFriend,
  onOpenFriendChat,
  onFlash,
  onNewChat,
  onAddContact,
  onTogglePin,
  onRemoveChat,
  confirmDeleteId,
  onRequestDelete,
  onConfirmDelete,
  className,
}: ChatSidebarProps) {
  const heading =
    view === "contacts"
      ? t.contactsHeading
      : view === "friends"
        ? t.friendsHeading
        : t.directMessages;

  /**
   * The top search narrows whatever this column is holding, not only the
   * conversations.
   *
   * It is one field pinned above three lists, so a friend whose name matches
   * while the conversations are showing is a friend the search claims to find
   * and does not. Narrowing the snapshot here rather than inside the panel keeps
   * the field honest about everything underneath it. The badge on the shortcut
   * above still counts the real requests: a badge that empties as somebody types
   * is a badge that cannot be acted on.
   */
  const needle = query.trim().toLocaleLowerCase();
  const shownFriends = useMemo(() => {
    if (!needle) return friends;
    const keeps = (record: FriendRequest) =>
      `${record.fromName} ${record.fromEmail} ${record.toName} ${record.toEmail}`
        .toLocaleLowerCase()
        .includes(needle);
    return {
      incoming: friends.incoming.filter(keeps),
      outgoing: friends.outgoing.filter(keeps),
      friends: friends.friends.filter(keeps),
      declined: friends.declined.filter(keeps),
    };
  }, [friends, needle]);

  return (
    <aside
      data-pane="list"
      className={`min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden border-border bg-[var(--surface)] ${className ?? "flex"}`}
    >
      {/**
       * The one row this column keeps of its own: the button that opens the menu,
       * and the name of what is in the column.
       *
       * It replaces the strip of roundels that used to sit across the top on a
       * phone — five controls, none of them about the list, none of them a thumb's
       * width — with one control and a title. It is hidden on a wide screen,
       * where the rail down the side already says where you are and this row
       * would only repeat it.
       */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 lg:hidden">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={t.openMenu}
          title={t.openMenu}
          aria-haspopup="dialog"
          className="-ml-1 grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-foreground transition-colors hover:bg-[var(--accent)]"
        >
          <Menu className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-[0.95rem] font-bold">{heading}</h1>
      </div>

      {/**
       * The search, at the very top and on its own line.
       *
       * It sits above the shortcuts rather than under them because it is the one
       * thing in this column that is used every single time, and a field a person
       * has to scroll back up to find is not a field they will use. The border
       * goes and the fill carries it instead, which is what keeps it from reading
       * as a form in a list of names.
       */}
      <div className="shrink-0 px-2.5 pb-1 pt-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t.findOrStart}
            aria-label={t.findOrStart}
            className="w-full rounded bg-[var(--background)] py-1.5 pl-8 pr-7 text-[0.8rem] text-foreground outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-brand"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label={t.cancel}
              className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      {/**
       * The four shortcuts. One row each on a wide column, one row of four on a
       * phone.
       *
       * On a phone the column is the whole screen, so a stack of four rows spends
       * a fifth of the height on four destinations before a single conversation
       * is on screen, and each of those rows is too short to hit with a thumb. Laid
       * across they are the height of one row instead of four, every target is a
       * thumb wide, and the list starts where the eye already is.
       *
       * They are still four different places rather than three views of one, so
       * this is a row of buttons and not a segmented control. Games stays a link
       * out to the site, which is why it carries no active state.
       */}
      <nav
        className="grid shrink-0 grid-cols-4 gap-1 px-2.5 pt-0.5 pb-1 sm:block sm:space-y-0.5"
        aria-label={t.title}
      >
        {SIDEBAR_NAV.map(({ id, label, Icon }) => {
          const here = view === id;
          const pending = id === "friends" && friends.incoming.length > 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                onViewChange(id);
                if (id === "friends") onClearPeople();
              }}
              aria-current={here ? "page" : undefined}
              aria-label={pending ? `${t[label]} (${friends.incoming.length})` : t[label]}
              className={`flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded px-1 py-1.5 text-center text-[0.62rem] leading-tight transition-colors sm:min-h-0 sm:flex-row sm:items-center sm:gap-2.5 sm:text-left sm:text-[0.85rem] ${
                here
                  ? "bg-[var(--accent)] text-foreground"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]/60 hover:text-foreground"
              }`}
            >
              <span className="relative shrink-0">
                <Icon className="size-5" />
                {/* The count sits on the icon while the four are across, because
                    beside a label that narrow it is what gets cut off first. */}
                {pending ? (
                  <span className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-[var(--destructive)] text-[0.5rem] font-bold text-white sm:static sm:size-4 sm:text-[0.6rem]">
                    {friends.incoming.length}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 truncate sm:flex-1">{t[label]}</span>
            </button>
          );
        })}
        <a
          href="/games"
          className="flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded px-1 py-1.5 text-center text-[0.62rem] leading-tight text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]/60 hover:text-foreground sm:min-h-0 sm:flex-row sm:items-center sm:gap-2.5 sm:text-left sm:text-[0.85rem]"
        >
          <Gamepad2 className="size-5 shrink-0" />
          <span className="min-w-0 truncate sm:flex-1">{t.navGames}</span>
        </a>
      </nav>

      {/**
       * The heading over the list, which says what the list under it holds, and
       * the button that adds another row to it. The label follows the shortcut
       * that is open, so a column called "Contacts" does not head a list called
       * "Direct Messages".
       */}
      <div className="group/head mt-1 flex shrink-0 items-center gap-1 px-4 pb-0.5 sm:mt-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[0.58rem] font-bold tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
          {heading}
        </span>
        <button
          type="button"
          onClick={view === "chats" ? onNewChat : onAddContact}
          aria-label={view === "chats" ? t.newChat : t.newContact}
          title={view === "chats" ? t.newChat : t.newContact}
          className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2">
        {view === "chats" ? (
          chats.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted-foreground">{t.searchEmpty}</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {chats.map((chat) => {
                const contact = contactsByEmail.get(chat.peerEmail) ?? null;
                // A deleted message still holds its place in the thread, but it
                // must not preview, count or badge the conversation.
                const shown = visibleMessages(chat);
                const unread = unreadIn(chat);
                const isActive = chat.id === activeChatId;
                // The preview is whatever happened last, a message or a call, so
                // a missed call is not hidden behind an older message.
                const last = timelineLast(chat, selfEmail);
                const lastMessage = last?.kind === "message" ? last.message : null;
                const lastCall = last?.kind === "call" ? last : null;
                const lastAttachment = lastMessage?.attachments?.at(-1);
                const label = contact?.name ?? (chat.peerEmail || t.newChat);
                const preview = lastCall
                  ? `${lastCall.summary?.missed ? "📕 " : "📞 "}${callLogText(lastCall.summary!, t)}`
                  : lastMessage
                    ? messagePreview(lastMessage.text, t) ||
                      (lastAttachment ? `📎 ${lastAttachment.name}` : "")
                    : t.newChat;

                return (
                  <li key={chat.id}>
                    <button
                      type="button"
                      data-chat={chat.id}
                      // Marked as the current one as well, so the open conversation
                      // is the one a test or a screen reader can ask for rather
                      // than only one it has to guess at from the class list.
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => onSelectChat(chat.id)}
                      className={`group relative flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left transition-colors active:bg-surface-2 sm:px-3 ${
                        isActive ? "bg-surface-2" : "hover:bg-surface/70"
                      }`}
                    >
                      {isActive ? (
                        <span
                          className="absolute inset-y-0 left-0 w-0.5 bg-brand"
                          aria-hidden="true"
                        />
                      ) : null}
                      <ContactAvatar
                        contact={contact}
                        t={t}
                        label={label}
                        unread={isActive ? 0 : unread}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-bold text-foreground">
                            {label}
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[0.6rem] text-muted-foreground">
                            {last ? formatListStamp(last.at, lang) : ""}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span
                            className={`truncate text-xs font-normal ${
                              (unread > 0 || lastCall?.summary?.missed) && !lastMessage?.fromMe
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {lastMessage
                              ? `${lastMessage.fromMe ? (lang === "bg" ? "Ти: " : lang === "zh" ? "你：" : "You: ") : ""}${messagePreview(lastMessage.text, t) || (lastAttachment ? `📎 ${lastAttachment.name}` : "")}`
                              : preview}{" "}
                          </span>
                          {unread > 0 ? (
                            <span className="ml-auto grid size-4 shrink-0 place-items-center rounded-full bg-brand text-[0.6rem] font-bold text-primary-foreground">
                              {unread}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {chat.muted ? (
                          <BellOff className="size-3 text-muted-foreground" aria-label={t.muted} />
                        ) : null}
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={t.pinned}
                          onClick={(event) => {
                            event.stopPropagation();
                            onTogglePin(chat.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              onTogglePin(chat.id);
                            }
                          }}
                          className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:bg-brand/10 sm:size-6 ${
                            chat.pinned
                              ? "text-brand"
                              : "text-muted-foreground/50 opacity-60 group-hover:opacity-100 sm:opacity-0"
                          }`}
                        >
                          <Pin className="size-3" />
                        </span>
                        {isActive ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={t.removeChat}
                            onClick={(event) => {
                              event.stopPropagation();
                              onRemoveChat(chat.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onRemoveChat(chat.id);
                              }
                            }}
                            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 sm:size-6"
                          >
                            <Trash2 className="size-3" />
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : view === "friends" ? (
          <FriendsPanel
            t={t}
            friends={shownFriends}
            people={people}
            searching={searching}
            selfEmail={selfEmail}
            offline={!online}
            relationshipOf={(email) => messagesStore.friendshipWith(email)}
            onSearch={onSearchPeople}
            onAdd={onAddFriend}
            onRespond={onRespondFriend}
            onRemove={onRemoveFriend}
            onOpenChat={onOpenFriendChat}
            avatarOf={(email) => contactsByEmail.get(email)?.avatar ?? null}
          />
        ) : (
          <ContactsPanel
            t={t}
            lang={lang}
            contacts={contacts}
            selfEmail={selfEmail}
            onSelectContact={onSelectContact}
            onAddContact={onAddContact}
            confirmDeleteId={confirmDeleteId}
            onRequestDelete={onRequestDelete}
            onConfirmDelete={onConfirmDelete}
          />
        )}
      </div>
    </aside>
  );
}

/**
 * The account, at the very foot of the second column, with the three switches a
 * person needs during a call sitting beside it.
 *
 * Its own component rather than the foot of the conversation list, because the
 * foot of that column belongs to a server's channels half the time and the
 * account does not move when the column does. Pinned to the bottom in both, so
 * the name and the microphone are in the same place whichever list is up.
 *
 * The microphone and the camera are the real switches rather than a second copy
 * of their state: a control that looks live and is not the one the call is
 * listening to is worse than no control at all.
 */
function AccountWidget({
  t,
  profile,
  online,
  localMode,
  micOn,
  cameraOn,
  inVoice,
  deafened,
  onMic,
  onCamera,
  onDeafen,
  onSetStatus,
  onPickAvatar,
  onEditName,
  onSync,
  onSwitchAccount,
  onSignOut,
  onOpenThemes,
  onDownloadApp,
  onDownloadAndroid,
  inApp,
  themeId,
  callStatus,
}: {
  t: MessagesCopy;
  profile: MessagesProfile;
  online: boolean;
  localMode: boolean;
  micOn: boolean;
  cameraOn: boolean;
  inVoice: boolean;
  deafened: boolean;
  onMic: (on: boolean) => void;
  onCamera: (on: boolean) => void;
  onDeafen: (on: boolean) => void;
  onSetStatus: (status: PresenceStatus) => void;
  onPickAvatar: () => void;
  onEditName: () => void;
  onSync: () => void;
  onSwitchAccount: () => void;
  onSignOut: () => void;
  /** Opens the themes, after this panel has taken itself out of the way. */
  onOpenThemes: () => void;
  /** Hands over the installer, or says there is nothing to hand over. */
  onDownloadApp: () => void;
  /** The Android build, which is a different file and is always worth handing over. */
  onDownloadAndroid: () => void;
  /** Already running inside the program, where there is nothing to download. */
  inApp: boolean;
  themeId: string;
  callStatus: CallState["status"];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);

  /**
   * The panel is taken down first, for the same reason as the themes.
   *
   * A download is a navigation the browser takes over, and a popover still
   * listening for clicks underneath it is a popover somebody has to click twice to
   * close.
   */
  const downloadApp = () => {
    setMenuOpen(false);
    setGearOpen(false);
    onDownloadApp();
  };

  const downloadAndroid = () => {
    setMenuOpen(false);
    setGearOpen(false);
    onDownloadAndroid();
  };

  /**
   * The themes live in their own dialog, which is portalled to the body and traps
   * focus. Opening it from under a popover that is still open leaves two overlays
   * fighting over who has focus and where Escape goes, so this panel is taken down
   * first and the dialog opened on the next tick.
   */
  const openThemes = () => {
    setMenuOpen(false);
    setGearOpen(false);
    onOpenThemes();
  };

  const menu = (
    <PopoverContent
      align="start"
      side="top"
      sideOffset={8}
      collisionPadding={12}
      className="w-60 border-border bg-popover p-0"
    >
      <AccountMenu
        t={t}
        profile={profile}
        online={online}
        onPickAvatar={onPickAvatar}
        onSync={onSync}
        onSwitchAccount={onSwitchAccount}
        onSignOut={onSignOut}
        onOpenThemes={openThemes}
        onDownloadApp={downloadApp}
        onDownloadAndroid={downloadAndroid}
        inApp={inApp}
        themeId={themeId}
      />
    </PopoverContent>
  );

  return (
    <div className="shrink-0 bg-[var(--surface-2)] p-2">
      <div className="flex items-center gap-1.5">
        {/**
         * The face and the name open the account panel; the status under them
         * opens the four statuses and nothing else.
         *
         * Two triggers rather than one, because they answer two different
         * questions and the status is asked far more often: picking yourself
         * invisible is a thing people do every time they open a chat, and a
         * switch that is two clicks deep behind a panel is a switch people stop
         * using.
         */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-start gap-0.5">
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-[var(--accent)]"
                  aria-label={t.userWidgetMenu}
                >
                  <span className="relative shrink-0">
                    <span
                      className="grid size-8 place-items-center overflow-hidden rounded-full font-display text-[0.7rem] font-bold"
                      style={{
                        backgroundColor: `${profile.accent}1f`,
                        color: profile.accent,
                      }}
                    >
                      {profile.avatar ? (
                        <span
                          style={{ backgroundImage: `url("${profile.avatar}")` }}
                          className="size-full bg-cover bg-center"
                        />
                      ) : (
                        initialsForName(profile.name || t.you)
                      )}
                    </span>
                    <PresenceDot
                      status={profile.status}
                      online={online}
                      t={t}
                      border="border-[var(--surface-2)]"
                    />
                  </span>
                  {/**
                   * Two lines, and a third carrying the address.
                   *
                   * The address is not decoration here. There is no username to
                   * show instead of it — people sign in with an address and are
                   * known by it — so a widget that shows only "TK" cannot answer
                   * "which account am I in", which is the one question a person with
                   * two of them opens this screen to answer.
                   */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.78rem] font-semibold leading-tight">
                      {profile.name || t.you}
                    </span>
                    <span className="block truncate text-[0.62rem] leading-tight text-[var(--muted-foreground)]">
                      {profile.email}
                    </span>
                  </span>
                </button>
              </PopoverTrigger>
              {menu}
            </Popover>

            {/**
             * The name is the one field of this account a person reaches for often
             * and cannot reach at all: the picture is a button, the status is a
             * button, and the name was neither. It is a sibling of that trigger
             * rather than part of it, because a button inside a button is not a
             * control. It sits on the name's own line rather than centred on the
             * block, so it reads as belonging to the name and not to the address.
             */}
            <button
              type="button"
              onClick={onEditName}
              aria-label={t.editName}
              title={t.editName}
              className="mt-1.5 grid size-4 shrink-0 cursor-pointer place-items-center rounded text-[var(--muted-foreground)] transition-colors hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t.statusOnline}
                title={t.statusOnline}
                className="-ml-1 flex min-w-0 cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--accent)]"
              >
                <span className="truncate text-[0.65rem] leading-tight text-[var(--muted-foreground)]">
                  {profile.status === "away"
                    ? t.statusAway
                    : profile.status === "busy"
                      ? t.statusBusy
                      : profile.status === "invisible"
                        ? t.statusInvisible
                        : localMode
                          ? t.localModeBadge
                          : online
                            ? t.live
                            : t.offline}
                </span>
                <ChevronDown className="size-3 shrink-0 text-[var(--muted-foreground)]" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="top"
              sideOffset={8}
              collisionPadding={12}
              className="border-0 bg-transparent p-0 shadow-none"
            >
              <PresenceMenu
                t={t}
                current={profile.status}
                onPick={(status) => onSetStatus(status)}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/**
         * The microphone opens its settings rather than silencing you.
         *
         * The state is still on the button — red and crossed while muted, read
         * from across the room — so nothing was given up to get the menu. What was
         * given up is being able to mute in one click from the foot of the column,
         * which is why the mute is the first row of what opens and why the call bar
         * keeps its own direct switch for when a call is up.
         */}
        <Popover>
          <PopoverTrigger asChild>
            <WidgetSwitch
              label={t.userWidgetMic}
              on={micOn}
              onIcon={<Mic className="size-4" />}
              offIcon={<MicOff className="size-4" />}
            />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={8}
            collisionPadding={12}
            className="w-64 border-[var(--border)] bg-popover p-0"
          >
            <MicSettingsMenu
              t={t}
              open
              micOn={micOn}
              // A live level needs a stream to watch, and the stream only exists
              // while a call is actually up — not merely while sitting in a channel.
              inCall={callStatus !== "idle" && callStatus !== "ended"}
              onMic={onMic}
            />
          </PopoverContent>
        </Popover>
        <WidgetSwitch
          label={t.userWidgetCamera}
          on={cameraOn}
          onClick={() => onCamera(!cameraOn)}
          onIcon={<Video className="size-4" />}
          offIcon={<VideoOff className="size-4" />}
        />
        <WidgetSwitch
          label={t.userWidgetHeadset}
          on={!deafened}
          onClick={() => onDeafen(!deafened)}
          onIcon={<Headphones className="size-4" />}
          offIcon={<HeadphoneOff className="size-4" />}
        />
        {/**
         * The gear, and the same panel the name opens.
         *
         * One panel on two triggers rather than two panels: there is one set of
         * account things to do here, and a second copy of them is a second list
         * to keep in step with the first.
         */}
        <Popover open={gearOpen} onOpenChange={setGearOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t.userWidgetSettings}
              title={t.userWidgetSettings}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-foreground"
            >
              <Settings className="size-4" />
            </button>
          </PopoverTrigger>
          {menu}
        </Popover>
      </div>
    </div>
  );
}

/**
 * The microphone's own settings, opened off the switch in the account widget.
 *
 * A mute switch and a settings menu are two different jobs, and they used to be
 * one button: the button could only silence you, so picking the wrong microphone
 * or being too quiet was something you found out mid-call and could do nothing
 * about. The switch still shows its state plainly on the widget itself — a red
 * crossed microphone is readable at a glance from across the room — and this is
 * where the two things that can be quietly wrong get fixed.
 *
 * Which of the two meters is offered depends on what there is to measure. A live
 * level needs a stream to watch and the stream only exists while a call is up, so
 * outside one the menu offers a recording instead, which asks the browser for the
 * microphone itself and so works with no call at all. Showing an empty bar until
 * somebody starts a call would have been the alternative, and an empty bar reads
 * as a broken microphone.
 */
function MicSettingsMenu({
  t,
  open,
  micOn,
  inCall,
  onMic,
}: {
  t: MessagesCopy;
  open: boolean;
  micOn: boolean;
  inCall: boolean;
  onMic: (on: boolean) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfoLike[]>([]);
  const [chosen, setChosen] = useState("");
  const [volume, setVolume] = useState(1);
  const [recording, setRecording] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const meterRef = useRef<HTMLSpanElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingRef = useRef<{ stop: () => Promise<Blob | null> } | null>(null);

  const media = messagesStore.callMedia();

  useEffect(() => {
    if (!open) return;
    void media
      .devices()
      .then((list) => {
        const mics = list.filter((device) => device.kind === "audioinput");
        setDevices(mics);
        setChosen((current) => current || mics[0]?.deviceId || "");
      })
      .catch(() => setFailed(true));
  }, [media, open]);

  // Only runs while the menu is open, so a closed one costs nothing.
  useEffect(() => {
    const bar = meterRef.current;
    if (!open || !inCall || !bar) return;
    let alive = true;
    void media
      .startMeter((level) => {
        if (!alive) return;
        // Written straight to the node: no state, so no re-render per frame.
        bar.style.width = `${Math.round(Math.min(1, level) * 100)}%`;
        bar.dataset["level"] = level > 0.02 ? "hot" : "quiet";
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      media.stopMeter();
    };
  }, [inCall, media, open]);

  // The test: record a few seconds and play it back, for when there is no call to
  // watch a level on.
  const toggleTest = async () => {
    if (recording) {
      const handle = recordingRef.current;
      recordingRef.current = null;
      setRecording(false);
      const blob = await handle?.stop();
      if (!blob) {
        setFailed(true);
        return;
      }
      setTestUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      requestAnimationFrame(() => void audioRef.current?.play?.().catch(() => undefined));
      return;
    }
    try {
      const handle = await media.recordTest();
      if (!handle) {
        setFailed(true);
        return;
      }
      recordingRef.current = handle;
      setRecording(true);
    } catch {
      setFailed(true);
    }
  };

  const row =
    "flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-left text-[0.78rem] transition-colors";

  return (
    <div className="w-64 p-2">
      <p className="label-mono px-2 pt-1 pb-1.5 text-[0.55rem] text-[var(--muted-foreground)]">
        {t.userWidgetMic}
      </p>

      {/**
       * Mute first, because it is the thing people open this menu for in a hurry.
       * Its state is on the switch outside as well, so this is the same control
       * rather than a second copy that could disagree with the first.
       */}
      <button
        type="button"
        onClick={() => onMic(!micOn)}
        className={`${row} ${
          micOn
            ? "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-foreground"
            : "text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
        }`}
      >
        {micOn ? <Mic className="size-4 shrink-0" /> : <MicOff className="size-4 shrink-0" />}
        {micOn ? t.micMute : t.micUnmute}
      </button>

      <div className="my-1 h-px bg-[var(--border)]" />

      <label className="block px-2 pb-1 text-[0.6rem] text-[var(--muted-foreground)]">
        {t.callMicDevice}
      </label>
      <select
        value={chosen}
        aria-label={t.callMicDevice}
        onChange={(event) => {
          const deviceId = event.target.value;
          setChosen(deviceId);
          // A live switch where a call is up: the chosen device takes the sender's
          // place rather than the call breaking and starting again.
          void media.switchInput("audio", deviceId);
        }}
        className="w-full cursor-pointer rounded bg-[var(--surface-2)] px-2 py-1.5 text-[0.72rem] text-foreground outline-none"
      >
        {devices.length === 0 ? <option value="">{t.callUnknown}</option> : null}
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || device.deviceId}
          </option>
        ))}
      </select>

      <div className="mt-3 flex items-center gap-2 px-2">
        <Volume2 className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
        <input
          type="range"
          min={0}
          max={200}
          step={5}
          value={Math.round(volume * 100)}
          disabled={!media.canSetInputVolume}
          aria-label={t.callInputVolume}
          onChange={(event) => {
            const next = Number(event.target.value) / 100;
            setVolume(next);
            void media.setInputVolume(next);
          }}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--surface-2)] accent-[var(--brand)] disabled:cursor-default disabled:opacity-50"
        />
        <span className="w-9 shrink-0 text-right font-mono text-[0.6rem] tabular-nums text-[var(--muted-foreground)]">
          {Math.round(volume * 100)}%
        </span>
      </div>

      {inCall ? (
        <div className="mt-3 px-2">
          <span className="relative block h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <span
              ref={meterRef}
              data-level="quiet"
              className="absolute inset-y-0 left-0 w-0 rounded-full bg-[var(--brand)] transition-[width] duration-75 data-[level=hot]:bg-[var(--brand-bright)]"
            />
          </span>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 px-2">
          <button
            type="button"
            onClick={() => void toggleTest()}
            aria-pressed={recording}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.68rem] transition-colors ${
              recording
                ? "border-red-500/50 bg-red-500/10 text-red-300"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {recording ? (
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
            ) : (
              <Mic className="size-3" />
            )}
            {recording ? t.callTestStop : t.callTestStart}
          </button>
          {testUrl ? (
            <>
              <button
                type="button"
                onClick={() => void audioRef.current?.play?.()}
                aria-label={t.callTestPlay}
                className="grid size-7 cursor-pointer place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-colors hover:bg-[var(--surface-2)]"
              >
                <Play className="size-3" />
              </button>
              <audio ref={audioRef} src={testUrl} className="hidden" />
            </>
          ) : null}
        </div>
      )}

      {failed ? (
        <p className="mt-2 px-2 text-[0.6rem] text-[var(--destructive)]">{t.callUnsupported}</p>
      ) : null}
    </div>
  );
}

/**
 * One of the three round switches in the account widget.
 *
 * Red means the thing is not happening: the microphone is muted, the camera is
 * dark, the speakers are deafened. That is the honest reading and it is meant to
 * be noticed at a glance rather than read — a switch that is quietly off is how a
 * person talks for twenty minutes without being heard.
 *
 * The headphone row is the third because deafening the speakers is not the same
 * switch as muting the microphone, and a laptop picking up a room is a different
 * problem from a person who cannot hear because their headset is on the desk.
 */
function WidgetSwitch({
  label,
  on,
  onIcon,
  offIcon,
  ...buttonProps
}: {
  label: string;
  on: boolean;
  onIcon: ReactNode;
  offIcon: ReactNode;
  /**
   * Everything else goes to the button underneath.
   *
   * Not decoration: the microphone is a `PopoverTrigger` with `asChild`, and Radix
   * hands a trigger its own click handler, `aria-expanded`, `aria-haspopup` and
   * `data-state` through props on whatever the child is. A component that names the
   * four props it wants and drops the rest looks like it works — the click survives
   * only because the handler happens to be called `onClick` — and then behaves
   * nothing like a menu button to the keyboard and to a screen reader.
   */
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "type">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      {...buttonProps}
      className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-full transition-colors ${
        on
          ? "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-foreground"
          : "bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/80"
      }`}
    >
      {on ? onIcon : offIcon}
    </button>
  );
}

/**
 * What the account name opens.
 *
 * The photo, the address and the way out of the session, in one place. The
 * avatar has to stay reachable from here as well as from the widget itself: it is
 * the only control that changes who you look like, and burying it in a settings
 * page is how a person ends up not changing it at all.
 */
function AccountMenu({
  t,
  profile,
  online,
  onPickAvatar,
  onSync,
  onSwitchAccount,
  onSignOut,
  onOpenThemes,
  onDownloadApp,
  onDownloadAndroid,
  inApp,
  themeId,
}: {
  t: MessagesCopy;
  profile: MessagesProfile;
  online: boolean;
  onPickAvatar: () => void;
  onSync: () => void;
  onSwitchAccount: () => void;
  onSignOut: () => void;
  onOpenThemes: () => void;
  onDownloadApp: () => void;
  onDownloadAndroid: () => void;
  /** Already running inside the program, where there is nothing to download. */
  inApp: boolean;
  themeId: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg">
      <div className="bg-[var(--surface-2)] p-3">
        <div className="flex items-center gap-2.5">
          <span className="relative shrink-0">
            <span
              className="grid size-12 place-items-center overflow-hidden rounded-full font-display text-sm font-bold"
              style={{ backgroundColor: `${profile.accent}1f`, color: profile.accent }}
            >
              {profile.avatar ? (
                <span
                  style={{ backgroundImage: `url("${profile.avatar}")` }}
                  className="size-full bg-cover bg-center"
                />
              ) : (
                initialsForName(profile.name || t.you)
              )}
            </span>
            <PresenceDot
              status={profile.status}
              online={online}
              t={t}
              size="lg"
              border="border-[var(--surface-2)]"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{profile.name || t.you}</span>
            <span className="block truncate text-[0.68rem] text-[var(--muted-foreground)]">
              {profile.email}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onPickAvatar}
          className="mt-3 w-full cursor-pointer rounded bg-[var(--brand)] px-3 py-2 font-mono text-[0.55rem] font-bold tracking-[0.12em] text-white uppercase transition-colors hover:bg-[var(--brand-dim)]"
        >
          {t.changePhoto}
        </button>
      </div>
      <div className="p-1.5">
        {/**
         * The themes, on the same panel as everything else about this account.
         *
         * Here as well as off the conversation's own menu, because this is the
         * panel a person opens when they want to change something about themselves
         * rather than about the thread they happen to be reading. Two places to
         * reach the same thing, both opening one dialog.
         */}
        <button
          type="button"
          onClick={onOpenThemes}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-left text-[0.78rem] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-foreground"
        >
          <span
            className="grid size-4 shrink-0 place-items-center"
            style={{
              color: chatThemeById(themeId).brand,
            }}
          >
            <ChatThemeMark className="size-4" />
          </span>
          {t.chatThemes}
          <span
            className="ml-auto size-3.5 shrink-0 rounded-[4px] border border-white/10"
            style={{ backgroundImage: chatThemeGradient(chatThemeById(themeId), 145) }}
          />
        </button>
        <button
          type="button"
          onClick={onSync}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-left text-[0.78rem] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-foreground"
        >
          <RefreshCw className="size-4" />
          {t.syncing}
        </button>
        <button
          type="button"
          onClick={onSwitchAccount}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-left text-[0.78rem] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-foreground"
        >
          <Repeat className="size-4" />
          {t.switchAccount}
        </button>
        <div className="my-1 h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={onDownloadApp}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-left text-[0.78rem] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-foreground"
        >
          <MonitorDown className="size-4" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{inApp ? t.downloadAppInApp : t.downloadApp}</span>
            <span className="block truncate text-[0.6rem] text-[var(--muted-foreground)]">
              {t.downloadAppHint}
            </span>
          </span>
        </button>
        {/**
         * Android, beside the Windows installer rather than inside it.
         *
         * Two rows and not one that offers a choice, because a panel this narrow has
         * no room for a question and because the person reading it is usually on the
         * device the answer is about. The Android row stays put inside the program:
         * somebody on a phone who opened the chat on a computer is exactly who this
         * row is for.
         */}
        <button
          type="button"
          onClick={onDownloadAndroid}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-left text-[0.78rem] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-foreground"
        >
          <Smartphone className="size-4" />
          <span className="min-w-0 flex-1 truncate">{t.downloadAppAndroid}</span>
        </button>
        <div className="my-1 h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-left text-[0.78rem] text-[var(--destructive)] transition-colors hover:bg-[var(--destructive)]/10"
        >
          <LogOut className="size-4" />
          {t.signOut}
        </button>
      </div>
    </div>
  );
}

type FriendsPanelProps = {
  t: MessagesCopy;
  friends: FriendsSnapshot;
  people: DirectoryEntry[];
  searching: boolean;
  selfEmail: string;
  onSearch: (query: string) => void;
  onAdd: (person: DirectoryEntry) => void;
  onRespond: (id: string, accept: boolean) => void;
  onRemove: (id: string) => void;
  onOpenChat: (peer: { email: string; name: string; avatar: string | null }) => void;
  /** Best known photo for an address, from the contact list. */
  avatarOf: (email: string) => string | null;
  relationshipOf: (email: string) => FriendRequest | null;
  offline: boolean;
};

function FriendsPanel({
  t,
  friends,
  people,
  searching,
  selfEmail,
  onSearch,
  onAdd,
  onRespond,
  onRemove,
  onOpenChat,
  avatarOf,
  relationshipOf,
  offline,
}: FriendsPanelProps) {
  return (
    <div className="divide-y divide-border/40">
      {offline ? (
        <p className="px-4 py-3 text-center text-[0.7rem] text-amber-200/80">{t.friendsOffline}</p>
      ) : (
        <div className="p-3">
          <label className="grid gap-1.5">
            <span className="label-mono text-[0.55rem]">{t.findPeople}</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                onChange={(event) => onSearch(event.target.value)}
                placeholder={t.findPeoplePlaceholder}
                aria-label={t.findPeople}
                className="w-full rounded-full border border-border/70 bg-background/70 py-2 pl-9 pr-3 text-xs font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
              />
            </div>
            <span className="text-[0.6rem] font-normal text-muted-foreground">
              {t.findPeopleHint}
            </span>
          </label>

          {searching ? (
            <p className="mt-3 flex items-center justify-center gap-2 text-[0.7rem] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
            </p>
          ) : null}

          {people.length > 0 ? (
            <ul className="mt-3 grid gap-1.5">
              {people.map((person) => {
                const relationship = relationshipOf(person.email);
                const already = relationship?.status === "accepted";
                const pending = relationship?.status === "pending";
                return (
                  <li
                    key={person.email}
                    className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-surface/50 p-2.5"
                  >
                    <ContactAvatar
                      contact={{
                        id: person.email,
                        peerEmail: person.email,
                        name: person.name,
                        initials: person.name.slice(0, 2).toUpperCase(),
                        about: "",
                        accent: "#1DB954",
                        avatar: person.avatar,
                        online: false,
                        lastSeenAt: 0,
                        lastSeenLabel: "",
                        linked: true,
                        status: "online",
                      }}
                      t={t}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{person.name}</span>
                      <span className="block truncate text-[0.65rem] font-normal text-muted-foreground">
                        {person.email}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={already || pending}
                      onClick={() => onAdd(person)}
                      className="shrink-0 cursor-pointer rounded-full bg-brand px-3.5 py-1.5 font-mono text-[0.55rem] font-bold tracking-[0.12em] text-primary-foreground uppercase transition-colors hover:bg-brand/85 disabled:cursor-default disabled:bg-surface-2 disabled:text-muted-foreground"
                    >
                      {already ? t.alreadyFriend : pending ? t.requestPending : t.addFriend}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}

      {friends.incoming.length > 0 ? (
        <section className="p-3">
          <p className="label-mono mb-2 text-[0.55rem] text-brand">{t.incomingRequests}</p>
          <ul className="grid gap-1.5">
            {friends.incoming.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-brand/30 bg-brand/5 p-2.5"
              >
                <ContactAvatar
                  contact={{
                    id: request.id,
                    peerEmail: request.fromEmail,
                    name: request.fromName,
                    initials: request.fromName.slice(0, 2).toUpperCase(),
                    about: "",
                    accent: "#1DB954",
                    avatar: request.fromAvatar,
                    online: false,
                    lastSeenAt: 0,
                    lastSeenLabel: "",
                    linked: true,
                    status: "online",
                  }}
                  t={t}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{request.fromName}</span>
                  <span className="block truncate text-[0.65rem] font-normal text-muted-foreground">
                    {t.friendRequestFrom}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onRespond(request.id, true)}
                    className="cursor-pointer rounded-full bg-brand px-3.5 py-1.5 font-mono text-[0.55rem] font-bold tracking-[0.12em] text-primary-foreground uppercase transition-colors hover:bg-brand/85"
                  >
                    {t.accept}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespond(request.id, false)}
                    className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 font-mono text-[0.55rem] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-red-500/40 hover:text-red-300"
                  >
                    {t.decline}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {friends.outgoing.length > 0 ? (
        <section className="p-3">
          <p className="label-mono mb-2 text-[0.55rem] text-muted-foreground">
            {t.outgoingRequests}
          </p>
          <ul className="grid gap-1.5">
            {friends.outgoing.map((request) => (
              <li
                key={request.id}
                className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-surface/40 p-2.5"
              >
                <ContactAvatar
                  contact={{
                    id: request.id,
                    peerEmail: request.toEmail,
                    name: request.toName,
                    initials: request.toName.slice(0, 2).toUpperCase(),
                    about: "",
                    accent: "#22d3ee",
                    avatar: null,
                    online: false,
                    lastSeenAt: 0,
                    lastSeenLabel: "",
                    linked: true,
                    status: "online",
                  }}
                  t={t}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{request.toName}</span>
                  <span className="block truncate font-mono text-[0.55rem] tracking-[0.1em] text-brand-dim uppercase">
                    {t.requestPending}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="p-3">
        <p className="label-mono mb-2 text-[0.55rem] text-brand">{t.myFriends}</p>
        {friends.friends.length === 0 ? (
          <p className="py-2 text-[0.7rem] font-normal text-muted-foreground">
            {friends.incoming.length === 0 && friends.outgoing.length === 0
              ? t.noFriends
              : t.noRequests}
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {friends.friends.map((record) => {
              const iAmSender = record.fromEmail.toLowerCase() === selfEmail;
              const otherEmail = iAmSender ? record.toEmail : record.fromEmail;
              const otherName = iAmSender ? record.toName : record.fromName;
              // The request only carries the sender's photo, so the linked
              // contact is the better source for whoever asked me.
              const otherAvatar = avatarOf(otherEmail) ?? (iAmSender ? null : record.fromAvatar);
              return (
                <li
                  key={record.id}
                  className="group flex items-center gap-1 rounded-2xl border border-border/60 bg-surface/50 p-1.5 transition-colors hover:border-brand/40 hover:bg-surface-2/60 focus-within:border-brand/40"
                >
                  <button
                    type="button"
                    onClick={() =>
                      onOpenChat({ email: otherEmail, name: otherName, avatar: otherAvatar })
                    }
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl p-1 text-left"
                  >
                    <ContactAvatar
                      contact={{
                        id: record.id,
                        peerEmail: otherEmail,
                        name: otherName,
                        initials: initialsForName(otherName),
                        about: "",
                        accent: "#1DB954",
                        avatar: otherAvatar,
                        online: false,
                        lastSeenAt: 0,
                        lastSeenLabel: "",
                        linked: true,
                        status: "online",
                      }}
                      t={t}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{otherName}</span>
                      <span className="block truncate text-[0.65rem] font-normal text-muted-foreground">
                        {otherEmail}
                      </span>
                    </span>
                    {/* The whole row opens the conversation, so say so. */}
                    <MessageSquarePlus
                      className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-brand"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(record.id)}
                    aria-label={t.removeFriend}
                    title={t.removeFriend}
                    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground opacity-60 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

type ContactsPanelProps = {
  t: MessagesCopy;
  lang: Lang;
  contacts: ChatContact[];
  selfEmail: string;
  onSelectContact: (contact: ChatContact) => void;
  onAddContact: () => void;
  confirmDeleteId: string | null;
  onRequestDelete: (contactId: string) => void;
  onConfirmDelete: (contactId: string) => void;
};

function ContactsPanel({
  t,
  lang,
  contacts,
  selfEmail,
  onSelectContact,
  onAddContact,
  confirmDeleteId,
  onRequestDelete,
  onConfirmDelete,
}: ContactsPanelProps) {
  return (
    <div>
      <div className="border-b border-border/40 p-3">
        <button
          type="button"
          onClick={onAddContact}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-brand/40 bg-brand/5 py-2.5 font-mono text-[0.6rem] font-bold tracking-[0.15em] text-brand uppercase transition-colors hover:bg-brand/15"
        >
          <Plus className="size-3.5" />
          {t.newContact}
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-3xl border border-brand/30 bg-brand/10 text-brand">
            <Users className="size-6" />
          </span>
          <p className="text-xs text-muted-foreground">{t.noContacts}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {contacts.map((contact) => {
            const isConfirming = confirmDeleteId === contact.id;
            return (
              <li key={contact.id}>
                <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface/70">
                  <button
                    type="button"
                    onClick={() => onSelectContact(contact)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                  >
                    <ContactAvatar contact={contact} t={t} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">
                        {contact.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                        {isOnlineAt(contact.lastSeenAt)
                          ? t.activeNow
                          : (formatLastSeen(contact.lastSeenAt, t, lang) ?? contact.about)}
                      </span>
                      {!contact.linked ? (
                        <span className="mt-0.5 block truncate font-mono text-[0.52rem] tracking-[0.1em] text-brand-dim uppercase">
                          {t.notLinked}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {isConfirming ? (
                    <button
                      type="button"
                      onClick={() => onConfirmDelete(contact.id)}
                      title={t.confirmDelete}
                      className="shrink-0 cursor-pointer rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 font-mono text-[0.55rem] tracking-[0.1em] text-red-300 uppercase transition-colors hover:bg-red-500/20"
                    >
                      {t.confirmDelete}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRequestDelete(contact.id)}
                      aria-label={t.deleteContact}
                      title={t.deleteContact}
                      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type ContactDialogProps = {
  t: MessagesCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: {
    name: string;
    about: string;
    accent: string;
    avatar: string | null;
    peerEmail: string;
  }) => Promise<boolean>;
};

function ContactDialog({ t, open, onOpenChange, onCreate }: ContactDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [about, setAbout] = useState("");
  const [accent, setAccent] = useState<string>(CONTACT_ACCENTS[0]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setAbout("");
      setAccent(CONTACT_ACCENTS[0]);
      setAvatar(null);
      setError("");
    }
  }, [open]);

  const pickAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setAvatar(await fileToAvatarDataUrl(file));
    } catch {
      setError(t.imageTooBig(formatSize(MAX_IMAGE_BYTES)));
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      setError(t.contactName);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const created = await onCreate({ name, about, accent, avatar, peerEmail: email.trim() });
      if (!created) setError(t.storageFull);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto border-border/70 bg-card p-5 sm:max-w-md sm:p-6">
        <div>
          <DialogTitle className="font-display text-lg font-bold">{t.newContact}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">
            {t.contactEmailHint}
          </DialogDescription>
        </div>

        <div className="flex items-center gap-4">
          <label className="grid size-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-3xl border border-border bg-brand/10 font-display text-lg font-bold text-brand">
            {avatar ? (
              <span
                style={{ backgroundImage: `url("${avatar}")` }}
                className="size-full bg-cover bg-center"
              />
            ) : (
              (name.trim().slice(0, 2) || "?").toUpperCase()
            )}
            <input type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
          </label>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold">{t.contactAvatar}</p>
            <p className="mt-0.5 text-[0.7rem] font-normal text-muted-foreground">
              PNG / JPG / WEBP
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="label-mono text-[0.55rem]">{t.contactName}</span>
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.contactNamePlaceholder}
              className="w-full rounded-2xl border border-border/70 bg-surface/70 px-4 py-2.5 text-sm font-normal outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="label-mono text-[0.55rem]">{t.contactEmail}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t.contactEmailPlaceholder}
              className="w-full rounded-2xl border border-border/70 bg-surface/70 px-4 py-2.5 text-sm font-normal outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="label-mono text-[0.55rem]">{t.contactAbout}</span>
            <input
              value={about}
              onChange={(event) => setAbout(event.target.value)}
              placeholder={t.contactAboutPlaceholder}
              className="w-full rounded-2xl border border-border/70 bg-surface/70 px-4 py-2.5 text-sm font-normal outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
            />
          </label>
          <div className="grid gap-1.5">
            <span className="label-mono text-[0.55rem]">{t.contactAccent}</span>
            <div className="flex flex-wrap gap-2">
              {CONTACT_ACCENTS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setAccent(color)}
                  style={{ backgroundColor: color }}
                  className={`size-7 cursor-pointer rounded-full transition-transform ${
                    accent === color
                      ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-card"
                      : "opacity-70 hover:scale-105 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-[0.7rem] text-red-300">
            {error}
          </span>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-full border border-border px-5 py-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-5 py-2 font-mono text-[0.62rem] font-bold tracking-[0.15em] text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            {t.save}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The box where this account's own name is written.
 *
 * Its own dialog rather than a field inside the account menu, because the name
 * is on screen constantly — in the widget, on every message, on every member
 * row — and a field in a menu that closes on every click is a field nobody
 * trusts. The server keeps eighty characters, so the field stops there rather
 * than accepting a name that would be silently cut.
 */
function EditNameDialog({
  t,
  open,
  current,
  onOpenChange,
  onSave,
}: {
  t: MessagesCopy;
  open: boolean;
  current: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(current);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reopened, the field always shows what is actually saved, never a leftover
  // from an attempt that was cancelled.
  useEffect(() => {
    if (!open) return;
    setName(current);
    setError("");
  }, [current, open]);

  const submit = async () => {
    const next = name.trim();
    if (!next) {
      setError(t.nameRequired);
      inputRef.current?.focus();
      return;
    }
    if (next.length > MAX_NAME_LENGTH) {
      setError(t.nameTooLong);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (await onSave(next)) onOpenChange(false);
      else setError(t.storageFull);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 border-border/70 bg-card p-5 sm:max-w-md sm:p-6">
        <div>
          <DialogTitle className="font-display text-lg font-bold">{t.editNameTitle}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">
            {t.editNameHint}
          </DialogDescription>
        </div>

        <label className="grid gap-1.5">
          <span className="label-mono text-[0.55rem]">{t.editName}</span>
          <input
            ref={inputRef}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              // Enter saves, the way a one field box is expected to behave.
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={t.editNamePlaceholder}
            className="w-full rounded-2xl border border-border/70 bg-surface/70 px-4 py-2.5 text-sm font-normal outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
          />
        </label>

        {error ? (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-[0.7rem] text-red-300">
            {error}
          </span>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-full border border-border px-5 py-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-5 py-2 font-mono text-[0.62rem] font-bold tracking-[0.15em] text-primary-foreground uppercase transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            {t.save}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmojiPicker({ t, onPick }: { t: MessagesCopy; onPick: (emoji: string) => void }) {
  return (
    <div className="scrollbar-thin max-h-[min(16rem,40dvh)] space-y-3 overflow-y-auto pr-1">
      {EMOJI_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="label-mono mb-1.5 text-[0.52rem]">
            {t.emojiCategories[group.id] ?? group.id}
          </p>
          <div className="grid grid-cols-8 gap-0.5">
            {group.emoji.map((emoji, index) => (
              <button
                key={`${group.id}-${index}`}
                type="button"
                onClick={() => onPick(emoji)}
                className="grid size-7 cursor-pointer place-items-center rounded-lg text-base transition-colors hover:bg-brand/20"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The tray behind the sticker button: a Giphy search that opens on the trending
 * stickers and narrows as the reader types. Giphy keeps stickers and plain gif
 * loops in two separate collections, so the tray switches between them; the
 * search box is shared, which is what a reader expects when they type a word
 * and then decide where to look for it. Tapping a tile sends it right away,
 * the way a sticker tray should behave, and a result is an ordinary message so
 * the receiver never needs Giphy of their own.
 */
function StickerPicker({ t, onSend }: { t: MessagesCopy; onSend: (url: string) => void }) {
  const [collection, setCollection] = useState<GiphyCollection>("stickers");
  const [query, setQuery] = useState("");
  const [stickers, setStickers] = useState<GiphySticker[]>([]);
  const [loading, setLoading] = useState(false);
  // `settled` separates "still loading" from "loaded and genuinely empty", so
  // the empty state never flashes on the way in.
  const [settled, setSettled] = useState(false);
  const configured = giphyConfigured();

  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    // Debounced so every keystroke does not become a request.
    const timer = setTimeout(
      () => {
        setLoading(true);
        void searchGiphy({ query, collection, signal: controller.signal })
          .then((results) => {
            if (controller.signal.aborted) return;
            setStickers(results);
          })
          .finally(() => {
            if (controller.signal.aborted) return;
            setLoading(false);
            setSettled(true);
          });
      },
      query.trim() ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [collection, configured, query]);

  return (
    // No width here on purpose: the frame is sized by `PopoverContent`, and a
    // second width on the inside is how the right column ends up painting
    // outside the panel.
    <div className="flex flex-col">
      <div
        role="tablist"
        aria-label={t.giphySearchLabel}
        className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-surface-2/70 p-1"
      >
        {(
          [
            ["stickers", t.stickers],
            ["gifs", t.gifs],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={collection === id}
            onClick={() => {
              setCollection(id);
              setSettled(false);
            }}
            className={`cursor-pointer rounded-lg py-1.5 font-mono text-[0.55rem] tracking-[0.12em] uppercase transition-colors ${
              collection === id
                ? "bg-brand text-primary-foreground"
                : "text-muted-foreground hover:text-brand"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative mb-2">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSettled(false);
          }}
          aria-label={t.giphySearchLabel}
          placeholder={t.stickerSearchPlaceholder}
          className="w-full rounded-xl border border-border/70 bg-surface-2/60 py-1.5 pr-3 pl-8 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand"
        />
      </div>

      {!configured ? (
        <p className="px-1 py-3 text-center text-xs text-muted-foreground">{t.stickerNoKey}</p>
      ) : (
        <div className="grid max-h-[min(16rem,40dvh)] grid-cols-3 gap-1.5 overflow-y-auto pr-1">
          {stickers.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              onClick={() => onSend(sticker.url)}
              title={sticker.title}
              aria-label={sticker.title}
              className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl bg-surface-2/60 transition-transform hover:scale-105"
            >
              <img
                src={sticker.preview}
                alt={sticker.title}
                width={96}
                height={96}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-full object-contain"
              />
            </button>
          ))}
          {loading && stickers.length === 0 ? (
            <p className="col-span-3 flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              {t.stickerLoading}
            </p>
          ) : null}
          {settled && !loading && stickers.length === 0 ? (
            <p className="col-span-3 py-6 text-center text-xs text-muted-foreground">
              {t.stickerEmpty}
            </p>
          ) : null}
        </div>
      )}
      <p className="mt-2 text-[0.6rem] text-muted-foreground">{t.stickerTapToSend}</p>
    </div>
  );
}

/**
 * The presence dot that sits on the bottom-right of an avatar, with the four
 * states the messaging apps use. Away is drawn as a crescent, so the three
 * "visible" states are distinguishable at a glance without reading the label.
 */
function PresenceDot({
  status,
  online,
  t,
  size = "md",
  border = "border-card",
}: {
  status: PresenceStatus;
  online: boolean;
  t: MessagesCopy;
  size?: "md" | "lg";
  /**
   * The fill the dot's ring has to cut out of. It has to be told rather than
   * assumed, because the same dot is worn on two different backgrounds in this
   * screen and a ring cut from the wrong one leaves a visible halo.
   */
  border?: string;
}) {
  const label =
    status === "away"
      ? t.statusAway
      : status === "busy"
        ? t.statusBusy
        : status === "invisible"
          ? t.statusInvisible
          : online
            ? t.activeNow
            : t.lastSeenOffline;

  // A peer who is genuinely offline always reads as grey, whatever they picked,
  // so a stale "online" choice cannot make them look reachable.
  const tone = !online
    ? "bg-muted-foreground/40"
    : status === "busy"
      ? "bg-red-500"
      : status === "invisible"
        ? "bg-muted-foreground/60"
        : "bg-brand";
  const dot = size === "lg" ? "size-4 border-[3px]" : "size-3 border-2";
  const ring = size === "lg" ? "size-2.5" : "size-2";

  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 z-10 grid place-items-center rounded-full border-2 ${border} ${dot} ${tone}`}
      aria-label={label}
      title={label}
    >
      {status === "away" && online ? (
        <span className={`absolute right-[-1px] rounded-full ${border} ${ring}`} />
      ) : null}
    </span>
  );
}

/**
 * The unread count on a chat avatar. Wide enough for a three digit number such
 * as 121, and it counts down with the thread rather than clipping to a dot.
 */
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className={`absolute -top-1 -right-1 z-10 grid min-w-4 place-items-center rounded-full bg-brand px-1 font-mono leading-4 font-bold text-primary-foreground shadow-[0_0_10px_rgba(29,185,84,0.45)] tabular-nums ${
        count > 9 ? "text-[0.55rem]" : "text-[0.6rem]"
      } ${count > 99 ? "min-w-5" : ""}`}
      aria-label={String(count)}
    >
      {count > 999 ? "999+" : count}
    </span>
  );
}

/** The four-state presence menu, laid out like the reference screenshot. */
function PresenceMenu({
  t,
  current,
  onPick,
}: {
  t: MessagesCopy;
  current: PresenceStatus;
  onPick: (status: PresenceStatus) => void;
}) {
  const options: Array<{ id: PresenceStatus; label: string; tone: string }> = [
    { id: "online", label: t.statusOnline, tone: "bg-brand" },
    { id: "away", label: t.statusAway, tone: "bg-[#f5c542]" },
    { id: "busy", label: t.statusBusy, tone: "bg-red-500" },
    { id: "invisible", label: t.statusInvisible, tone: "bg-muted-foreground/60" },
  ];

  return (
    <div className="w-[min(17rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onPick(option.id)}
          className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface ${
            current === option.id ? "bg-surface" : ""
          }`}
        >
          <span className="relative grid size-3 shrink-0 place-items-center">
            <span className={`size-2.5 rounded-full ${option.tone}`} />
            {option.id === "away" ? (
              <span className="absolute right-[-2px] size-2.5 rounded-full bg-popover" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-normal">{option.label}</span>
          {current === option.id ? (
            <Check className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

function ContactAvatar({
  contact,
  t,
  size = "md",
  label,
  unread = 0,
  showPresence = true,
}: {
  contact: ChatContact | null;
  t: MessagesCopy;
  size?: "md" | "lg";
  label?: string;
  unread?: number;
  showPresence?: boolean;
}) {
  const box = size === "lg" ? "size-16 rounded-3xl text-xl" : "size-11 rounded-full text-sm";
  const accent = contact?.accent ?? "#1DB954";
  const initials = contact?.initials ?? "?";
  const avatar = contact?.avatar ?? null;

  // The neon frame: a solid accent ring for the edge, a soft one for the glow
  // that carries the colour into the surface behind it. Both are inline because
  // the colour is per contact, taken from their own profile.
  const neon =
    size === "lg"
      ? { boxShadow: `0 0 0 2px ${accent}, 0 0 26px ${accent}59` }
      : { boxShadow: `0 0 0 2px ${accent}, 0 0 14px ${accent}4d` };

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden font-display font-bold ${box}`}
      style={{ backgroundColor: `${accent}1f`, color: accent, ...neon }}
    >
      {avatar ? (
        <span
          style={{ backgroundImage: `url("${avatar}")` }}
          className="size-full bg-cover bg-center"
        />
      ) : (
        <>
          <span
            className="absolute inset-0 opacity-70"
            style={{
              backgroundImage: `radial-gradient(circle at 30% 20%, ${accent}40, transparent 70%)`,
            }}
            aria-hidden="true"
          />
          <span className="relative">{initials}</span>
        </>
      )}
      {size === "md" && showPresence ? (
        <PresenceDot
          status={contact?.status ?? "online"}
          online={!!contact && isOnlineAt(contact.lastSeenAt)}
          t={t}
        />
      ) : null}
      {size === "lg" && showPresence ? (
        <PresenceDot
          status={contact?.status ?? "online"}
          online={!!contact && isOnlineAt(contact.lastSeenAt)}
          t={t}
          size="lg"
        />
      ) : null}
      <UnreadBadge count={unread} />
    </span>
  );
}

/**
 * One participant in a call.
 *
 * The same neon frame the chat list uses, so a face looks the same everywhere in
 * the app. A live video track paints over the initials; without one the initials
 * and the state of the microphone carry the tile, the way they do in every chat
 * app on a phone.
 */
/** The one video track of a stream, with only what is read off it. */
type VideoTrackLike = {
  getSettings?: () => { width?: number; height?: number; frameRate?: number };
  addEventListener?: (name: string, fn: () => void) => void;
  removeEventListener?: (name: string, fn: () => void) => void;
};

/**
 * Whether the picture on this tile is still moving.
 *
 * A frozen desktop is the worst thing a share can do, and it is indistinguishable
 * from a share that works: the tile is there, the name is on it, the badge says
 * live, and nothing moves. So the frames the browser has actually decoded are
 * counted, and the bar only says anything while that number is going up.
 *
 * The video element is asked directly rather than the track, because the element
 * is the thing that knows how many frames it has painted.
 */
function useStreamAlive(node: HTMLVideoElement | null, sharing: boolean) {
  const [alive, setAlive] = useState(false);

  useEffect(() => {
    if (!sharing || !node) {
      setAlive(false);
      return;
    }
    // A browser that will not say is not guessed at. A bar that pulses because a
    // timer fired is claiming the stream is fine, which is the exact lie this
    // exists to prevent.
    const quality = node as unknown as {
      getVideoPlaybackQuality?: () => { totalVideoFrames?: number };
    };
    if (typeof quality.getVideoPlaybackQuality !== "function") return;

    let last = quality.getVideoPlaybackQuality().totalVideoFrames ?? 0;
    const check = () => {
      const now = quality.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
      setAlive(now !== last);
      last = now;
    };
    // Long enough that a 30 frames a second stream is clearly still going, short
    // enough that a stall is noticed while somebody is still looking at it.
    const timer = window.setInterval(check, 1_500);
    return () => window.clearInterval(timer);
  }, [node, sharing]);

  return alive;
}

/**
 * What a video track is actually carrying, as a short label.
 *
 * `720P 30 FPS` is what the design shows over a shared screen, and it is read
 * off the track rather than off the constraints that were asked for. A browser
 * drops either one when the connection cannot carry it, so the two are not the
 * same number, and a person whose screen has quietly become a blur has no other
 * way of telling.
 *
 * Nothing is shown until there is something to show: a caption that reads `P  FPS`
 * while the track is still starting is worse than no caption.
 */
function useStreamStats(stream: unknown, sharing: boolean) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!sharing) {
      setLabel("");
      return;
    }
    const source = stream as { getVideoTracks?: () => Array<TrackLike> } | null;
    const track = source?.getVideoTracks?.()[0];
    if (!track) {
      setLabel("");
      return;
    }

    const describe = () => {
      const settings = track.getSettings?.() ?? {};
      const width = Number(settings.width) || 0;
      const height = Number(settings.height) || 0;
      const frameRate = Math.round(Number(settings.frameRate) || 0);
      const height_ = height >= 900 ? "1080P" : height >= 600 ? "720P" : height > 0 ? "360P" : "";
      if (!height_) {
        setLabel("");
        return;
      }
      setLabel(frameRate > 0 ? `${height_} ${frameRate} FPS` : height_);
    };

    describe();
    // The settings change as the connection is re-negotiated, and a label left
    // reading the first number is a label that is wrong for the rest of the share.
    track.addEventListener?.("resize", describe);
    return () => {
      track.removeEventListener?.("resize", describe);
    };
  }, [stream, sharing]);

  return { label };
}

/** The one video track of a stream, with only what is read off it. */
type TrackLike = {
  getSettings?: () => { width?: number; height?: number; frameRate?: number };
  addEventListener?: (name: string, fn: () => void) => void;
  removeEventListener?: (name: string, fn: () => void) => void;
};

/**
 * One person in a call, as a tile.
 *
 * With four people there are four of these, and each is fed by that person's own
 * connection, so nobody's voice is played over somebody else's and nobody's
 * picture is left over from the last person to speak. A tile is a camera when
 * there is a camera, and a face when there is not, which is the state most of a
 * voice call is in.
 */
/**
 * Whether a person's audio has actually arrived, as against their having said
 * it will.
 *
 * Their own `mic` switch is what they asked for, not what is coming. The two come
 * apart on a phone that is still waiting for permission, and on a connection that
 * carried a description and no track behind it, and in both cases a tile that
 * believes the switch is claiming a voice nobody can hear. The stream is the only
 * thing here that is evidence, so it is what the mark is drawn from.
 */
const carriesAudio = (stream: unknown): boolean => {
  const source = stream as {
    getAudioTracks?: () => Array<{ readyState?: string } | null> | null;
  } | null;
  if (!source || typeof source.getAudioTracks !== "function") return false;
  let tracks: Array<{ readyState?: string } | null> = [];
  try {
    tracks = source.getAudioTracks() ?? [];
  } catch {
    // A stream from a browser that has torn the connection down answers by
    // throwing rather than by returning nothing.
    return false;
  }
  return tracks.some((track) => track && track.readyState !== "ended");
};

function CallParticipant({
  name,
  avatar,
  accent = "#1DB954",
  stream,
  video,
  muted,
  isSelf,
  /** True while this person is being connected, or has just arrived. */
  joining = false,
  /** True when their audio has actually arrived, not merely been switched on. */
  voice = false,
  /** True for the person whose screen is being shown to everybody. */
  sharing = false,
  /** What they chose to share, so the label can say which. */
  surface,
  /** The control that moves between sharers, when the room has more than one. */
  screenSwitcher,
  grow = false,
  fill = false,
  square = false,
  t,
}: {
  name: string;
  avatar: string | null;
  accent?: string;
  stream: unknown;
  /** True when there is a camera to show, rather than the initials. */
  video: boolean;
  muted: boolean;
  isSelf: boolean;
  /** True while this person is being connected, or has just arrived. */
  joining?: boolean;
  /** True when their audio has actually arrived, not merely been switched on. */
  voice?: boolean;
  /** True for the person whose screen is being shown to everybody. */
  sharing?: boolean;
  surface?: ScreenSurface;
  /** The control that moves between sharers, when the room has more than one. */
  screenSwitcher?: ReactNode;
  /** Fills the space it is given, which is what a shared screen wants. */
  grow?: boolean;
  /**
   * Takes the whole of its cell rather than holding an aspect ratio.
   *
   * The middle of the stage, where a tile that keeps its own shape leaves the
   * room as a picture floating in empty space.
   */
  fill?: boolean;
  /**
   * Takes a square rather than the whole of its cell.
   *
   * The voice room's arrangement. A tile that stretches to a tall window's height
   * is two and a quarter times taller than it is wide, and a person in it is a
   * small circle stretched between two bands of nothing; a square is sized from
   * its column and is the same shape in a wide window and a phone. It lives on the
   * tile rather than on the grid's rows because the grid cannot set it: there is
   * no `auto-rows-square`, and a row told to be a percentage of nothing is a row
   * sized by whatever is in it.
   */
  square?: boolean;
  t: MessagesCopy;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stats = useStreamStats(stream, Boolean(sharing));
  const alive = useStreamAlive(videoRef.current, Boolean(sharing));

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    const source = stream as { srcObject?: unknown } | null;
    if (source && typeof MediaStream !== "undefined" && source instanceof MediaStream) {
      node.srcObject = source;
      /**
       * Playing is asked for again after every change of stream, not only on the
       * first one.
       *
       * A browser suspends a video it is not showing, and a picture that has
       * come back is often left paused: the element is there, the picture is
       * black, and nothing in the page says why. Asking is harmless when it is
       * already playing, and it is the difference between a shared screen and a
       * black rectangle.
       */
      void node.play?.().catch(() => undefined);
    } else {
      node.srcObject = null;
    }
  }, [stream]);

  // A shared screen is watched rather than framed: cropping a document to a
  // square loses the lines off the right, and the whole point is that they can
  // read it. A camera is framed, because a face in a wide box is a face in a
  // corner.
  //
  // `fill` is the one that is not a fixed shape at all. A tile with an aspect
  // ratio is the right size for a strip of participants along the bottom of the
  // screen, and the wrong size for the middle of a tall window: it stays short,
  // the stage centres it, and the room is a tile floating in two bands of
  // nothing. In the middle it takes the height it is given.
  const face = grow
    ? "aspect-video w-full rounded-2xl text-4xl sm:text-5xl"
    : fill || square
      ? "size-full rounded-lg text-4xl sm:text-5xl"
      : "aspect-square w-full max-w-[13rem] rounded-2xl text-2xl sm:max-w-[15rem]";
  const fit = sharing ? "object-contain" : "object-cover";

  /**
   * A face with no camera on it.
   *
   * A large circle over a tile that is almost the colour of the room, not a ring
   * around a square. The tile is the room's largest surface, and a glowing outline
   * around it draws the eye to the edge of a box rather than to the person inside
   * it — a wall of outlined squares reads as a grid of buttons, where a flat tile
   * with one round face in the middle reads as a room.
   *
   * The tile itself is Discord's own near-black rather than the person's colour at
   * full strength. They are the same object only because they are the same size,
   * and colouring each one in its own hue turns a room of four into a chart; the
   * hue lives in the circle, which is the part a person is actually looking at.
   */
  const portrait = (
    <>
      {avatar ? (
        <span
          style={{ backgroundImage: `url("${avatar}")` }}
          className="relative size-[min(38%,11rem)] rounded-full bg-cover bg-center"
        />
      ) : (
        <span
          className="relative grid size-[min(38%,11rem)] place-items-center rounded-full font-display font-bold text-[clamp(1.5rem,4.5vw,3.5rem)] leading-none text-white"
          style={{ backgroundColor: `${accent}40` }}
        >
          {initialsForName(name)}
        </span>
      )}
    </>
  );

  return (
    <div
      data-tile={fill || square ? "fill" : undefined}
      className={`flex min-w-0 flex-col items-center gap-1.5 ${
        square
          ? "relative aspect-square w-full self-center"
          : grow || fill
            ? "relative h-full w-full"
            : ""
      }`}
    >
      <span
        className={`relative grid place-items-center overflow-hidden bg-[var(--surface)] font-display font-bold ${face} ${
          fill ? "" : "shrink-0"
        }`}
      >
        {video ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            /**
             * Muted, always.
             *
             * A browser refuses to play a video that carries sound unless the
             * person asked for it, and a video it refuses is a black one. The
             * sound is played by an element of its own further down, so nothing
             * is lost by this being off, and a shared tab's audio would otherwise
             * come back out of the very speakers being captured.
             */
            muted
            // A shared screen is never mirrored, and a camera with text on it is
            // not either: a mirrored screenshot is backwards.
            className={`size-full ${fit} ${isSelf && !sharing ? "-scale-x-100" : ""}`}
          />
        ) : (
          portrait
        )}

        {/**
         * The microphone, at the bottom corner, and only when there is something
         * to say about it.
         *
         * Discord draws no mark at all on somebody who is talking, and that is
         * right: a badge on every tile in a busy room is a row of identical marks
         * that has to be read one tile at a time to learn nothing. Two states do
         * earn the mark — switched off, and switched on but not yet arriving —
         * because both of those are a claim the room should not take on trust.
         */}
        {muted || !voice || joining ? (
          <span className="absolute right-2 bottom-2 flex items-center gap-1">
            {joining ? (
              <span
                className="grid size-5 place-items-center rounded-full bg-black/55 text-white"
                aria-label={t.callLogConnecting}
              >
                <Loader2 className="size-2.5 animate-spin" />
              </span>
            ) : null}
            {!joining ? (
              <span
                className={`grid size-5 place-items-center rounded-full ${
                  muted ? "bg-[var(--destructive)]" : "bg-black/55"
                } text-white`}
                aria-label={muted ? t.callMicMuted : t.callVoiceWaiting}
                title={muted ? t.callMicMuted : t.callVoiceWaiting}
              >
                <MicOff className="size-2.5" />
              </span>
            ) : null}
          </span>
        ) : null}

        {sharing ? (
          <>
            <span className="absolute top-1 left-1 rounded-full bg-brand px-2 py-0.5 font-mono text-[0.5rem] tracking-[0.14em] text-primary-foreground uppercase">
              {/* What is being shared, because "why is my whole desktop on their
                  phone" is a question a label can answer. */}
              {surface === "browser"
                ? t.callScreenLabelTab
                : surface === "window"
                  ? t.callScreenLabelWindow
                  : t.callScreenLabel}
            </span>

            {/**
             * Whose screen this is, when more than one is up.
             *
             * Placed here rather than left to the caller because it has to sit
             * beside the "sharing a screen" badge and only this tile knows where
             * that is — the strip's tiles carry the same overlay at a tenth of the
             * size, and a switcher sized for the stage is a switcher that covers
             * the whole strip tile.
             */}
            {screenSwitcher ? (
              <span className="absolute top-1 left-1 translate-y-6">{screenSwitcher}</span>
            ) : null}

            {/* What is actually arriving, and that it is arriving now.
                The resolution and the frame rate are read off the video track
                rather than off what was asked for, because a browser quietly
                halves either one when the network cannot carry it — and a shared
                screen that is being downscaled to a blur is the one thing the
                person sharing has no other way of finding out. */}
            <span className="absolute top-1 right-1 flex items-center gap-1">
              {stats.label ? (
                <span className="rounded-full bg-black/55 px-2 py-0.5 font-mono text-[0.5rem] tracking-[0.14em] text-white uppercase">
                  {stats.label}
                </span>
              ) : null}
              <span className="rounded-full bg-[var(--destructive)] px-2 py-0.5 font-mono text-[0.5rem] tracking-[0.14em] text-white uppercase">
                {t.callScreenLive}
              </span>
            </span>

            {/**
             * The bar along the foot of a shared screen.
             *
             * It moves only while frames are actually arriving, so a desktop that
             * has stopped moving is visibly still rather than confidently wrong.
             * A browser that will not say how many frames it painted gets no bar
             * at all, because a bar that pulses on a timer claims the picture is
             * live when it may not be.
             */}
            {alive ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 flex justify-center pb-0.5"
              >
                <span className="h-0.5 w-16 animate-pulse rounded-full bg-[#5865f2]" />
              </span>
            ) : null}
          </>
        ) : null}
      </span>
      {/*
       * The name, once, at the bottom corner of its own tile.
       *
       * A "you" badge beside it repeated what the tile already says: this frame
       * is tinted differently from everybody else's, so nothing needs to say whose
       * it is twice. Cut short rather than wrapped, because a three part Bulgarian
       * name broken over two lines pushes the face up and off centre, and a
       * three part name in one line at the corner is read as a corner label rather
       * than as the tile's title.
       *
       * Inside the tile rather than under it: a label under a full-height tile
       * would push the tile past the height it was given and the room would
       * scroll, which is the same reason the whole label lives in the corner the
       * design puts it in.
       */}
      <p
        className={
          fill || square
            ? "absolute bottom-2 left-2 max-w-[70%] truncate text-xs font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
            : "w-full max-w-[14rem] break-words px-1 text-center text-xs font-bold"
        }
        title={name}
      >
        {name}
      </p>
    </div>
  );
}

/**
 * The people on a call screen, and where a shared screen goes.
 *
 * When somebody shares, their screen takes the whole width and the rest of the
 * call becomes a strip underneath. That is the only arrangement that makes a
 * shared screen legible on a phone: four tiles at once would shrink a spreadsheet
 * to nothing, and the point of sharing is that it can be read.
 */
function CallStage({
  t,
  participants,
  streams,
  localStream,
}: {
  t: MessagesCopy;
  participants: CallMember[];
  streams: Record<string, unknown>;
  localStream: unknown;
}) {
  const sharer = participants.find((person) => person.screen && !person.isSelf);
  const strip = participants.filter((person) => person !== sharer);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      {sharer ? (
        <>
          <div className="min-h-0 flex-1">
            <CallParticipant
              grow
              t={t}
              name={sharer.name || t.callUnknown}
              avatar={sharer.avatar}
              accent="#22d3ee"
              stream={streams[sharer.email]}
              video
              muted={!sharer.mic}
              voice={carriesAudio(streams[sharer.email])}
              isSelf={false}
              sharing
              surface={sharer.screenSurface}
            />
          </div>
          <div className="flex shrink-0 justify-start gap-3 overflow-x-auto pb-1">
            {strip.map((person) => (
              <CallParticipant
                key={person.email}
                t={t}
                name={person.name || t.callUnknown}
                avatar={person.avatar}
                accent={person.isSelf ? "#1DB954" : "#22d3ee"}
                stream={person.isSelf ? localStream : streams[person.email]}
                // Somebody who is sharing still has a picture, whatever their
                // camera is doing: the screen is the video now.
                video={person.camera || person.screen}
                muted={!person.mic}
                voice={carriesAudio(streams[person.email])}
                isSelf={person.isSelf}
                sharing={person.screen}
                surface={person.screenSurface}
                joining={person.status === "joining" || person.status === "invited"}
              />
            ))}
          </div>
        </>
      ) : (
        <div
          className={`grid min-h-0 flex-1 content-center gap-4 ${
            participants.length <= 1
              ? "grid-cols-1"
              : participants.length === 2
                ? "grid-cols-2"
                : participants.length <= 4
                  ? "grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-3"
          }`}
        >
          {participants.map((person) => (
            <CallParticipant
              key={person.email}
              t={t}
              name={person.name || t.callUnknown}
              avatar={person.avatar}
              accent={person.isSelf ? "#1DB954" : "#22d3ee"}
              stream={person.isSelf ? localStream : streams[person.email]}
              video={person.camera}
              muted={!person.mic}
              isSelf={person.isSelf}
              joining={person.status === "joining" || person.status === "invited"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The strip of round icons down the far left.
 *
 * Discord calls these servers and they are one app each; here each icon is one
 * of the site's own sections, which is the same idea made of what this app
 * actually has. The messages one is held in its active state, so the strip
 * always says where a person is even when the rest of the screen does not.
 */
function GuildRail({
  sections,
  active,
  label,
  profile,
}: {
  sections: Array<{ key: string; label: string; to: string; initials: string }>;
  active: string;
  label: string;
  /** Who is signed in, which is what the foot of this column is for. */
  profile: { name: string; avatar: string | null; accent: string };
}) {
  return (
    <nav
      aria-label={label}
      data-pane="icons"
      className="hidden shrink-0 flex-col items-center gap-2 overflow-y-auto bg-[var(--discord-rail)] py-3 lg:flex"
    >
      {sections.map((section) => {
        const here = section.key === active;
        return (
          <a
            key={section.key}
            href={section.to}
            aria-current={here ? "page" : undefined}
            title={section.label}
            className={`grid size-12 shrink-0 place-items-center rounded-[1.6rem] text-2xl transition-all ${
              here
                ? "rounded-2xl bg-[var(--primary)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:rounded-2xl hover:bg-[var(--accent)] hover:text-foreground"
            }`}
          >
            <span className="sr-only">{section.label}</span>
            <span aria-hidden="true">{section.initials}</span>
          </a>
        );
      })}

      {/**
       * The account, at the foot of the column.
       *
       * Pinned to the bottom so it is in the same place whatever the column
       * arrangement is, and a link rather than a button: the settings it would
       * open live on the site, and a control here that looks like it opens
       * something and then does not is worse than one that plainly goes there.
       */}
      <div className="mt-auto shrink-0 pt-3">
        <a
          href="/"
          title={profile.name}
          className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-transparent font-display text-sm font-bold transition-colors hover:border-[var(--primary)]"
          style={{ backgroundColor: `${profile.accent}1f`, color: profile.accent }}
        >
          {profile.avatar ? (
            <span
              className="size-full bg-cover bg-center"
              style={{ backgroundImage: `url("${profile.avatar}")` }}
            />
          ) : (
            initialsForName(profile.name)
          )}
        </a>
      </div>
    </nav>
  );
}

/**
 * The strip of roundels down the far left, one per server.
 *
 * A server is a place several people are in at once, with its own channels and
 * its own voice, and the roundel is the only thing on screen that says which one
 * is open. Its ring wears the server's own colour so two servers are told apart
 * without reading either name, and a server with somebody talking in it carries
 * a green mark in the corner for the same reason a phone does.
 *
 * The site header does not render on this route, so the rail also carries the
 * way back into the site: a screen with no link out of it is one a person can
 * only leave with the browser's back button. Inside the program there is no site
 * to go back to — this window is the whole thing — so the link is left out there
 * rather than offering a page the app cannot show.
 */
function ServerRail({
  t,
  guilds,
  activeGuildId,
  onSelect,
  onHome,
  onCreate,
  liveChannelIds,
  busy = false,
  layout = "rail",
  onNavigate,
  inApp = false,
}: {
  t: MessagesCopy;
  guilds: GuildView[];
  activeGuildId: string | null;
  onSelect: (guildId: string) => void;
  /** Back out of a server, to the conversations and the friends. */
  onHome: () => void;
  onCreate: () => void;
  /** Channels with somebody in them, so a server can be marked live. */
  liveChannelIds: string[];
  /** A server is being made and its friends are walking in, so not yet. */
  busy?: boolean;
  /**
   * `rail` is the column down the side of a wide screen. `column` is the same
   * list standing up inside the phone's menu, where there is no width to lay it
   * out across, so it must not inherit the row the narrow layout uses.
   */
  layout?: "rail" | "column";
  /** Called after a choice, so a menu standing over the page can close itself. */
  onNavigate?: () => void;
  /** Already running inside the program, where the way back to the site is meaningless. */
  inApp?: boolean;
}) {
  return (
    <nav
      aria-label={t.servers}
      data-pane="servers"
      className={
        layout === "column"
          ? "flex shrink-0 flex-col items-start gap-2 overflow-y-auto bg-[var(--discord-rail)] p-2"
          : "hidden shrink-0 flex-row items-center gap-2 overflow-x-auto overflow-y-hidden bg-[var(--discord-rail)] px-2 py-3 lg:flex lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
      }
    >
      {/**
       * Back to the site, at the top of the rail.
       *
       * Put back after being taken out. The rail is a column with nothing above
       * it, so with this gone the top of it was a bare edge and the way out of
       * the chat was gone with it — the only other way back is the browser's own
       * button, which is not there on a desktop app window.
       *
       * In the program it goes again, because there is nothing behind this window
       * to go back to and the browser's button is not there either: the arrow
       * there opened a page that left the app, which is the opposite of what an
       * arrow at the top of a window is for.
       */}
      {inApp ? null : (
        <a
          href="/"
          aria-label={t.backToSite}
          title={t.backToSite}
          className="grid size-12 shrink-0 place-items-center rounded-[1.6rem] bg-[var(--surface-2)] text-xl text-[var(--muted-foreground)] transition-all hover:rounded-2xl hover:bg-[var(--accent)] hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </a>
      )}

      {/**
       * The home roundel, above the servers.
       *
       * A server's channels take the second column over entirely, so without this
       * there would be one button too few on screen: no way back to the
       * conversations without first picking some other server or reloading.
       */}
      <button
        type="button"
        onClick={() => {
          onHome();
          onNavigate?.();
        }}
        aria-current={activeGuildId ? undefined : "page"}
        aria-label={t.directMessages}
        title={t.directMessages}
        className={`grid size-12 shrink-0 place-items-center rounded-[1.6rem] transition-all ${
          activeGuildId
            ? "bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:rounded-2xl hover:bg-[var(--accent)] hover:text-foreground"
            : "rounded-2xl bg-[var(--primary)] text-white"
        }`}
      >
        <MessageSquarePlus className="size-5" />
      </button>

      <span
        aria-hidden="true"
        className={
          layout === "column"
            ? "my-1 h-8 w-0.5 shrink-0 rounded-full bg-white/10"
            : "mx-1 h-px w-8 shrink-0 bg-white/10 lg:mx-0 lg:my-1 lg:h-8 lg:w-0.5 lg:rounded-full"
        }
      />

      {guilds.map((guild) => {
        const here = guild.id === activeGuildId;
        // A server somebody is talking in is the one worth noticing from across
        // the room, which is what the mark in the corner is for.
        const live = guild.voiceChannels.some((channel) => liveChannelIds.includes(channel.id));
        return (
          <button
            key={guild.id}
            type="button"
            // The open server pressed again goes home, which is what the same
            // gesture does in the reference and is the only way back out of a
            // server that is the only server.
            onClick={() => {
              if (here) onHome();
              else onSelect(guild.id);
              onNavigate?.();
            }}
            aria-current={here ? "page" : undefined}
            title={guild.name}
            className={`group/guild relative grid size-12 shrink-0 place-items-center rounded-[1.6rem] font-display text-lg font-bold transition-all ${
              here
                ? "rounded-2xl bg-[var(--primary)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:rounded-2xl hover:bg-[var(--accent)] hover:text-foreground"
            }`}
            style={here ? undefined : { boxShadow: `inset 0 0 0 2px ${guild.accent}55` }}
          >
            <span aria-hidden="true">{guild.initials}</span>
            <span className="sr-only">{guild.name}</span>
            {live ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[var(--discord-rail)] bg-[var(--discord-online)]"
              />
            ) : null}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => {
          onCreate();
          onNavigate?.();
        }}
        disabled={busy}
        aria-label={t.newServer}
        title={t.newServer}
        className="grid size-12 shrink-0 place-items-center rounded-[1.6rem] bg-[var(--surface-2)] text-[var(--muted-foreground)] transition-all hover:rounded-2xl hover:bg-[var(--discord-online)] hover:text-white disabled:cursor-default disabled:opacity-50 disabled:hover:rounded-[1.6rem] disabled:hover:bg-[var(--surface-2)] disabled:hover:text-[var(--muted-foreground)]"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
      </button>
    </nav>
  );
}

/**
 * One channel, with the people standing in it.
 *
 * A voice channel shows who is in it because that is the question the column
 * answers: whether walking in means joining a conversation already in progress.
 * A member somebody else silenced shows a struck microphone, so the person in it
 * can see that the button will not come back on for them.
 */
function VoiceChannelRow({
  t,
  channel,
  presence,
  active,
  connecting,
  here,
  self,
  canModerate,
  onSelect,
  onLeave,
  onSelfDeafen,
  onServerMute,
  onInvite,
}: {
  t: MessagesCopy;
  channel: GuildVoiceChannel;
  presence: VoicePresence[];
  active: boolean;
  connecting: boolean;
  /** This account's own address, which is what marks its own row. */
  here: string;
  /** This account's own row in the channel, or null when it is not in it. */
  self: VoicePresence | null;
  /** True only for the server's owner, who is the one who may silence people. */
  canModerate: boolean;
  onSelect: () => void;
  onLeave: () => void;
  onSelfDeafen: () => void;
  onServerMute: (email: string, muted: boolean) => void;
  onInvite: () => void;
}) {
  return (
    <div className="mb-0.5">
      <div
        className={`group/row flex items-center gap-1 rounded pr-1 transition-colors ${
          active
            ? "bg-[var(--accent)] text-foreground"
            : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]/60 hover:text-foreground"
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          data-voice-channel={channel.id}
          aria-current={active ? "true" : undefined}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left"
        >
          <Volume2 className="size-4 shrink-0 opacity-60" />
          <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
          {connecting ? (
            <span className="shrink-0 text-[0.6rem] text-[var(--muted-foreground)]">…</span>
          ) : null}
        </button>

        {/**
         * The two controls on the channel you are standing in.
         *
         * They live here rather than only at the foot of the window because a
         * channel you are in is where you look when you want to change what your
         * own microphone is doing. Deafening is not the same as muting: one stops
         * the microphone sending, the other stops the channel playing on this
         * device at all, and a person who cannot tell them apart ends up muted
         * and still hearing everybody.
         */}
        {active ? (
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onSelfDeafen}
              aria-label={self?.deafened ? t.callUndeafen : t.callDeafen}
              title={self?.deafened ? t.callUndeafen : t.callDeafen}
              aria-pressed={self?.deafened}
              className={`grid size-6 cursor-pointer place-items-center rounded transition-colors ${
                self?.deafened
                  ? "bg-[var(--destructive)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-foreground"
              }`}
            >
              {self?.deafened ? (
                <HeadphoneOff className="size-3.5" />
              ) : (
                <Headphones className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={onLeave}
              aria-label={t.leaveVoice}
              title={t.leaveVoice}
              className="grid size-6 cursor-pointer place-items-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)] hover:text-white"
            >
              <PhoneOff className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>

      {presence.length > 0 ? (
        <ul className="mt-0.5 space-y-px pr-1 pl-6">
          {presence.map((person) => {
            const mine = person.email === here;
            return (
              <li key={person.email} className="flex items-center gap-1.5 rounded px-1 py-0.5">
                <ContactAvatar
                  contact={{
                    id: person.email,
                    peerEmail: person.email,
                    name: person.name,
                    initials: initialsForName(person.name),
                    about: "",
                    accent: person.serverMuted ? "#8b8b8b" : "#5865f2",
                    avatar: person.avatar,
                    online: true,
                    lastSeenAt: Date.now(),
                    lastSeenLabel: "",
                    linked: true,
                    status: "online",
                  }}
                  t={t}
                  size="md"
                />
                <span className="min-w-0 flex-1 truncate text-[0.8rem] text-[var(--muted-foreground)]">
                  {person.name}
                </span>
                {person.camera ? (
                  <Camera className="size-3 shrink-0 text-[var(--muted-foreground)]" />
                ) : null}
                {/* Who is showing a screen, in the list of who is here.
                    Somebody reading this column is deciding whether to walk in, and
                    "somebody is showing their desktop" is exactly what changes that
                    decision — so it is said here, not only on the tile. */}
                {person.screen ? (
                  <span
                    title={person.screenLabel || t.callScreenLabel}
                    className="shrink-0 rounded bg-[var(--destructive)] px-1.5 py-0.5 font-mono text-[0.5rem] tracking-[0.14em] text-white uppercase"
                  >
                    {t.callScreenLive}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onServerMute(person.email, !person.serverMuted)}
                  // Only the owner of the server gets to silence somebody. The
                  // button is hidden from everybody else rather than shown and
                  // refused: a control that never works is worse than no control.
                  title={
                    person.serverMuted
                      ? `${t.serverMutedBy} ${person.mutedBy ?? ""}`.trim()
                      : t.serverMuted
                  }
                  aria-label={person.serverMuted ? t.callUnmute : t.callMute}
                  hidden={!canModerate}
                  className="grid size-6 shrink-0 place-items-center rounded opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                >
                  {person.mic ? (
                    <Mic className="size-3.5 text-[var(--muted-foreground)]" />
                  ) : (
                    <MicOff
                      className={`size-3.5 ${person.serverMuted ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}`}
                    />
                  )}
                </button>
                {mine ? (
                  <button
                    type="button"
                    onClick={onLeave}
                    aria-label={t.leaveVoice}
                    title={t.leaveVoice}
                    className="grid size-6 shrink-0 place-items-center rounded opacity-0 group-hover/row:opacity-100"
                  >
                    <PhoneOff className="size-3.5 text-[var(--destructive)]" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* The way to bring somebody in, which is the whole point of a channel
          that stays connected rather than a call that is placed. */}
      {presence.length > 0 ? (
        <button
          type="button"
          onClick={onInvite}
          className="mt-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[0.75rem] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]/60 hover:text-foreground"
        >
          <UserPlus className="size-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate">{t.inviteToChannel}</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * The button that opens the servers and the shortcuts on a phone.
 *
 * Its own component because it now appears in three places — the list, the room
 * and the conversation — and three copies of the same square with the same label
 * is how a header ends up with two different sized buttons for the same action.
 */
function MenuButton({ t, onClick }: { t: MessagesCopy; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.openMenu}
      title={t.openMenu}
      aria-haspopup="dialog"
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
    >
      <Menu className="size-4" />
    </button>
  );
}

/**
 * The channel column: the server's name, then its two groups of channels.
 *
 * Text channels and voice channels stand one under the other rather than side by
 * side, which is the arrangement the design follows: a list of rooms, and under
 * the rooms the places people are actually connected to. A voice channel carries
 * its occupants with it, so the column answers "who is in there" without anyone
 * having to join first.
 */
function ChannelColumn({
  t,
  guild,
  activeTextChannelId,
  activeVoiceChannelId,
  connectingChannelId,
  selfEmail,
  voiceRosters,
  canModerate,
  onSelectText,
  onSelectVoice,
  onLeaveVoice,
  onServerMute,
  onInvite,
  onCreateText,
  onCreateVoice,
  onGoToFriends,
  onRenameServer,
  onDeleteServer,
}: {
  t: MessagesCopy;
  guild: GuildView | null;
  activeTextChannelId: string | null;
  activeVoiceChannelId: string | null;
  connectingChannelId: string | null;
  selfEmail: string;
  voiceRosters: Record<string, VoiceRoster>;
  /** True when this account owns the server and may silence its members. */
  canModerate: boolean;
  onSelectText: (id: string) => void;
  onSelectVoice: (id: string) => void;
  onLeaveVoice: (id: string) => void;
  onServerMute: (channelId: string, email: string, muted: boolean) => void;
  onInvite: (channelId: string) => void;
  onCreateText: (name: string) => void;
  onCreateVoice: (name: string) => void;
  /**
   * Out of the server and on to the friends, which is the one list a server's
   * channels cannot reach.
   *
   * `| undefined` rather than just optional, because this file is compiled with
   * `exactOptionalPropertyTypes` and the caller passes a value that is genuinely
   * absent — `undefined` — rather than one that happens to be missing.
   */
  onGoToFriends?: (() => void) | undefined;
  /**
   * Renaming and deleting, offered only to the owner. Absent for a member, which
   * is how the object refuses it as well — the menu is not the only thing standing
   * between a member and somebody else's server.
   */
  onRenameServer?: (() => void) | undefined;
  onDeleteServer?: (() => void) | undefined;
}) {
  const [adding, setAdding] = useState<"text" | "voice" | null>(null);
  const [draft, setDraft] = useState("");

  const submit = (kind: "text" | "voice") => {
    const name = draft.trim();
    if (name) (kind === "text" ? onCreateText : onCreateVoice)(name);
    setDraft("");
    setAdding(null);
  };

  const group = (
    kind: "text" | "voice",
    label: string,
    channels: Array<{ id: string; name: string; order: number }>,
  ) => (
    <div className="mt-3 first:mt-1">
      <div className="group/row flex items-center gap-1 px-2 pb-0.5">
        <span className="flex-1 font-mono text-[0.58rem] tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
          {label}
        </span>
        {guild ? (
          <button
            type="button"
            onClick={() => {
              setAdding(adding === kind ? null : kind);
              setDraft("");
            }}
            aria-label={t.addChannel}
            title={t.addChannel}
            className="grid size-5 place-items-center rounded text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-[var(--surface-2)] hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>

      {adding === kind ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(kind);
          }}
          className="px-1.5 pb-1"
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (!draft.trim()) setAdding(null);
            }}
            placeholder={t.channelNamePlaceholder}
            aria-label={t.channelNamePlaceholder}
            // 16px rather than the browser default: anything smaller and iOS zooms
            // the page in on focus, and the zoom does not go back on blur.
            className="w-full rounded bg-[var(--surface-2)] px-2 py-1.5 text-sm outline-none ring-brand focus:ring-1"
          />
        </form>
      ) : null}

      {channels.length === 0 && adding !== kind ? (
        <p className="px-2 py-0.5 text-[0.7rem] text-[var(--muted-foreground)]/70">
          {t.channelEmpty}
        </p>
      ) : null}

      {kind === "text"
        ? channels.map((channel) => {
            const here = channel.id === activeTextChannelId;
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => onSelectText(channel.id)}
                aria-current={here ? "true" : undefined}
                className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                  here
                    ? "bg-[var(--accent)] text-foreground"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]/60 hover:text-foreground"
                }`}
              >
                <Hash className="size-4 shrink-0 opacity-60" />
                <span className="min-w-0 flex-1 truncate">{channel.name}</span>
              </button>
            );
          })
        : channels.map((channel) => (
            <VoiceChannelRow
              key={channel.id}
              t={t}
              channel={channel as GuildVoiceChannel}
              presence={liveVoicePresences(voiceRosters[channel.id])}
              active={channel.id === activeVoiceChannelId}
              connecting={channel.id === connectingChannelId}
              here={selfEmail}
              self={messagesStore.selfVoicePresence(channel.id)}
              canModerate={canModerate}
              onSelect={() => onSelectVoice(channel.id)}
              onLeave={() => onLeaveVoice(channel.id)}
              onSelfDeafen={() => {
                const mine = messagesStore.selfVoicePresence(channel.id);
                void messagesStore.setVoiceDeafened(channel.id, !(mine?.deafened ?? false));
              }}
              onServerMute={(email, muted) => onServerMute(channel.id, email, muted)}
              onInvite={() => onInvite(channel.id)}
            />
          ))}
    </div>
  );

  return (
    /**
     * The whole column, while a server is open.
     *
     * The server's name is the heading and its channels are the list under it,
     * with nothing above them: this replaces the conversations rather than
     * sitting on top of them, because the two lists name the same people and a
     * column holding both is a column where neither has room to be read.
     *
     * The one thing that stays is the way out to the people, because a server's
     * channels are how this account talks to the people already on this server and
     * nothing on this screen is how it talks to anybody else. With the shortcuts
     * gone from here, the only route to a friend was the rail's home roundel — one
     * click, and only once you knew it was there. A person inside a server who
     * wants to add a friend is not looking for a server icon, so the shortcut sits
     * beside the server's name, where the eye already is.
     *
     * The name stays put and only the groups scroll under it, so a person
     * scrolling a long channel list does not scroll away the answer to which
     * server they are in.
     *
     * The name itself is the menu, which is where the design puts it and for the
     * reason it puts it there: the only control over a server belongs in the one
     * place that says which server this is. Deleting it from a hover menu on the
     * rail's roundel instead would mean a destructive action one accidental hover
     * away from every server on screen — the shape of a mistake nobody can take
     * back.
     */
    <div data-pane="channels" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          {/* A member finds the menu and finds it empty rather than not finding it:
              a control that is there for everybody and does something only for the
              owner is a control that lies about what this account may do. */}
          {onRenameServer || onDeleteServer ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`${guild?.name ?? t.navMessages} — ${t.serverSettings}`}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded text-left transition-colors hover:bg-[var(--accent)]"
                >
                  <h2 className="min-w-0 truncate text-base font-bold text-foreground">
                    {guild?.name ?? t.navMessages}
                  </h2>
                  <ChevronDown className="size-4 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="bottom"
                sideOffset={6}
                collisionPadding={12}
                className="w-56 border-border bg-popover"
              >
                {onRenameServer ? (
                  <DropdownMenuItem
                    onSelect={() => onRenameServer()}
                    className="cursor-pointer gap-2"
                  >
                    <Pencil className="size-3.5" />
                    {t.serverRename}
                  </DropdownMenuItem>
                ) : null}
                {onDeleteServer ? (
                  <DropdownMenuItem
                    onSelect={() => onDeleteServer()}
                    className="cursor-pointer gap-2 text-[var(--destructive)] focus:text-[var(--destructive)]"
                  >
                    <Trash2 className="size-3.5" />
                    {t.serverDelete}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <h2 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">
              {guild?.name ?? t.navMessages}
            </h2>
          )}
          {onGoToFriends ? (
            <button
              type="button"
              onClick={onGoToFriends}
              aria-label={t.friendsTab}
              title={t.friendsTab}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-foreground"
            >
              <UserPlus className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-2">
        {guild ? (
          <div className="px-1.5 pt-1">
            {group("text", t.textChannels, guild.textChannels)}
            {group("voice", t.voiceChannels, guild.voiceChannels)}
          </div>
        ) : (
          <p className="px-4 py-3 text-[0.8rem] text-[var(--muted-foreground)]">
            {t.noServersHint}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The room, in the middle of the screen.
 *
 * One tile per person, laid out by how many there are rather than by a fixed
 * grid: a channel of two is two tiles across, and a channel of one is one tile
 * that fills what is there. Somebody sharing a screen takes the whole stage and
 * everybody else drops to a strip along the bottom, which is the same arrangement
 * the call overlay already used and the only one where a shared document is
 * actually readable.
 */
function VoiceStage({
  t,
  selfEmail,
  presences,
  streams,
  localStream,
  screenStream,
  onInvite,
  onActivity,
  onGoToChat,
  inviteCandidates,
  onInvitePick,
}: {
  t: MessagesCopy;
  /** This account's own address, which is what marks its own tile. */
  selfEmail: string;
  presences: VoicePresence[];
  streams: Record<string, unknown>;
  localStream: unknown;
  /** What this device is sharing, so its own tile shows the desktop and not an
   * empty microphone stream. */
  screenStream: unknown;
  onInvite: () => void;
  /** Put the chat in the middle of the screen while the channel stays connected. */
  onGoToChat: () => void;
  /** Something to do together, which is what a channel people stay in is for. */
  onActivity: () => void;
  /** Who could be brought in, which the invitation lists when it is opened. */
  inviteCandidates: CallCandidate[];
  onInvitePick: (email: string) => void;
}) {
  const [inviting, setInviting] = useState(false);

  /**
   * Everybody in here with a screen up, and which of them is on the stage.
   *
   * More than one at a time is not a mistake to be prevented: the server records
   * each person's own switch and does not arbitrate between them, so two people
   * who both pressed it really are both marked. Picking the first and hiding the
   * rest is what made that look like a bug — one of them is talking about what is
   * on their screen and cannot be seen at all. So the stage shows one and the other
   * is a press away.
   *
   * The choice is remembered by address rather than by position, so somebody
   * joining or leaving does not silently swap whose screen you were reading.
   */
  const sharers = presences.filter((person) => person.screen);
  const [shownSharer, setShownSharer] = useState<string | null>(null);
  const sharer =
    sharers.find((person) => person.email === shownSharer) ?? (sharers.length ? sharers[0] : null);
  const sharerAt = sharer ? sharers.findIndex((person) => person.email === sharer.email) : -1;

  const strip = presences.filter((person) => person !== sharer);
  const isSelf = (person: VoicePresence) => person.email === selfEmail;

  /**
   * What a tile of one's own should play.
   *
   * The desktop while sharing, the microphone stream otherwise. A voice room was
   * joined with no picture at all, so binding the sharer's own tile to that stream
   * shows an empty rectangle to the one person who can actually see that something
   * is wrong — while everybody else watches their desktop perfectly well.
   */
  const selfStreamFor = (person: VoicePresence) =>
    isSelf(person) ? (screenStream ?? localStream) : streams[person.email];

  /**
   * The way to bring somebody in, sitting in the row with everybody else.
   *
   * As its own panel it was a second thing to look at beside the room, in a place
   * where the eye already was not: a channel with one person in it offered a
   * whole wall of invitation, and the room itself was a small panel off to the
   * side. As a tile it is where a person looks when they wonder who else is here —
   * which is the only moment anybody is ever going to want it.
   *
   * Two of them, because it is the same invitation in two shapes and one shape
   * cannot be both: a square in the room, where every tile is a square, and the
   * cell of a short row in the strip under a shared screen. Built from one body so
   * the two cannot drift into looking like different controls.
   */
  const inviteBody = (square: boolean) => (
    <>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
        <UserPlus className="size-5" />
      </span>
      <p className="min-w-0 text-sm font-semibold leading-snug text-foreground">
        {t.inviteToChannel}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => (inviteCandidates.length > 0 ? setInviting(true) : onInvite())}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-brand px-3 py-1.5 text-[0.75rem] font-semibold text-white transition-colors hover:bg-brand-dim"
        >
          <UserPlus className="size-3.5" />
          {t.inviteToChannel}
        </button>
        <button
          type="button"
          onClick={onActivity}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-[var(--surface-2)] px-3 py-1.5 text-[0.75rem] font-semibold text-foreground transition-colors hover:bg-[var(--accent)]"
        >
          <Gamepad2 className="size-3.5" />
          {t.callActivity}
        </button>
      </div>
    </>
  );

  /**
   * The arrow, and whether it is here at all.
   *
   * It is offered only while this account is alone in the room, and it is the one
   * control on a screen that is otherwise a stage of a single face: a channel you
   * have joined by accident is not one you are watching, and what you actually
   * came for was a conversation. It goes away the moment somebody else is in there,
   * because then the room is worth looking at and a button that hides it is just in
   * the way.
   *
   * It sits on the corner of the invitation rather than being a cell of its own.
   * A second full-size square for a single arrow makes the invitation look like two
   * things, and in a one-person room the grid would be half a screen of a control
   * nobody pressed.
   */
  const goToChatCorner =
    presences.length <= 1 ? (
      <button
        type="button"
        onClick={onGoToChat}
        aria-label={t.goToChat}
        title={t.goToChat}
        className="absolute right-3 bottom-3 grid size-9 cursor-pointer place-items-center rounded-lg bg-[var(--surface-2)] text-foreground shadow-lg transition-colors hover:bg-[var(--accent)]"
      >
        <ChevronRight className="size-4.5" />
      </button>
    ) : null;

  /** The same invitation as a cell of a short row, for the strip under a share. */
  const inviteTile = (
    <div
      key="invite"
      data-tile="invite"
      className="relative flex h-full min-w-0 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-center"
    >
      {inviteBody(false)}
      {goToChatCorner}
    </div>
  );

  const squareInviteTile = (
    <div
      key="invite"
      data-tile="invite"
      className="relative flex aspect-square w-full min-w-0 flex-col items-center justify-center gap-3 self-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-center"
    >
      {inviteBody(true)}
      {goToChatCorner}
    </div>
  );

  /**
   * How many tiles share a row.
   *
   * Written out rather than computed into a class name: a class name built at
   * runtime is a class name the build never sees, and the grid silently stays at
   * one column. Four across is where a face stops being a face, so a row with more
   * than that wraps to a second row underneath rather than shrinking everybody to
   * fit. Past nine the count stops mattering: a ninth row of tiles is a room with
   * too many people in it either way, and reading the names is what a person does
   * rather than seeing them.
   *
   * Counted with the invitation in it, so the row a person is looking at is the row
   * that was measured — and a grid rather than a flex line, because a flex line
   * gives the invitation whatever is left over, which in a busy room is a strip
   * twenty pixels wide with two buttons crushed inside it.
   */
  const columnsFor = (count: number) =>
    count <= 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-2"
        : count === 3
          ? "grid-cols-2 sm:grid-cols-3"
          : count <= 6
            ? "grid-cols-2 sm:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  const tile = (person: VoicePresence, square = false) => (
    <CallParticipant
      key={person.email}
      fill
      square={square}
      t={t}
      name={person.name || t.callUnknown}
      avatar={person.avatar}
      accent={isSelf(person) ? "#1DB954" : person.serverMuted ? "#8b8b8b" : "#22d3ee"}
      stream={selfStreamFor(person)}
      video={person.camera || person.screen}
      // A silence somebody else applied shows as off here too, or the room reads
      // as somebody talking who has been switched off.
      muted={!person.mic || person.serverMuted}
      isSelf={isSelf(person)}
      sharing={person.screen}
      surface={person.screenSurface}
      voice={carriesAudio(streams[person.email])}
    />
  );

  /**
   * Moving between sharers, when the room has more than one.
   *
   * Two arrows and a count rather than one button that cycles. With two people a
   * cycle is fine, and with three the next one is a different person each time
   * depending on which way you came round — so which screen you would land on is
   * not something you can work out before pressing it.
   *
   * The count is there because the arrows alone do not say whether there is
   * anything to move to, and a pair of arrows on a single share is a control that
   * looks like it does something.
   */
  const sharerSwitcher =
    sharers.length > 1 ? (
      <span className="flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5">
        <button
          type="button"
          onClick={() =>
            setShownSharer(sharers[(sharerAt - 1 + sharers.length) % sharers.length]?.email ?? null)
          }
          aria-label={t.sharePrevious}
          title={t.sharePrevious}
          className="grid size-5 cursor-pointer place-items-center rounded-full text-white transition-colors hover:bg-black/40"
        >
          <ChevronDown className="size-3 -rotate-90" />
        </button>
        <span
          className="font-mono text-[0.6rem] font-bold text-white tabular-nums"
          title={`${t.shareWhoseScreen}: ${sharers[sharerAt]?.name || t.callUnknown}`}
        >
          {sharerAt + 1}/{sharers.length}
        </span>
        <button
          type="button"
          onClick={() => setShownSharer(sharers[(sharerAt + 1) % sharers.length]?.email ?? null)}
          aria-label={t.shareNext}
          title={t.shareNext}
          className="grid size-5 cursor-pointer place-items-center rounded-full text-white transition-colors hover:bg-black/40"
        >
          <ChevronDown className="size-3 rotate-90" />
        </button>
      </span>
    ) : null;

  /**
   * The room's grid, with every tile square.
   *
   * The square is on the tile rather than on the grid's rows, because the grid
   * cannot set it: there is no `auto-rows-square`, and a row told to be a
   * percentage of nothing is a row sized by whatever is in it. A square tile sizes
   * itself from its column, so a room of two in a wide column and a room of two in
   * a phone are both two squares and neither has to be told which it is. The rows
   * are then shorter than the room, so the grid is `content-center` — a voice room
   * reads as a row of faces sitting in the middle of the screen, not as faces
   * stretched to reach the top and bottom of it.
   *
   * Scrollable rather than clipped, and that is the reason it can be square at all:
   * a tall window full of people would need more rows than fit, and a grid that
   * silently drops the last row of a room is worse than one that scrolls.
   */
  const squareGrid = (count: number) =>
    `grid size-full content-center gap-2 overflow-y-auto sm:gap-3 ${columnsFor(count)}`;

  // Not connected to anybody yet: the invitation is the tile, and it takes the
  // whole room rather than sitting in a band at the top of an empty one. A room
  // with nobody in it is a room waiting to be joined, not a screen to stare at.
  if (presences.length === 0) {
    return (
      <div className="min-h-0 flex-1 bg-[var(--background)] p-3 sm:p-4">
        <div data-pane="voice-stage" className={squareGrid(1)}>
          {squareInviteTile}
        </div>
      </div>
    );
  }

  /**
   * Nobody is sharing, so the people are the stage.
   *
   * This is the arrangement the design has, and it is the right one for a voice
   * room: the tiles are the room, so a channel of two is two large faces rather
   * than a row of thumbnails under an empty black rectangle. The share is the only
   * thing that ever earns a surface of its own, because a document is read and a
   * face is glanced at.
   */
  if (!sharer) {
    return (
      <div className="min-h-0 flex-1 bg-[var(--background)] p-3 sm:p-4">
        <div data-pane="voice-stage" className={squareGrid(presences.length + 1)}>
          {presences.map((person) => tile(person, true))}
          {squareInviteTile}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-[var(--background)] p-3 sm:p-4">
      {/**
       * The stage, which is the room's one large surface.
       *
       * A shared desktop is what a channel is for, so it gets everything above the
       * strip and the strip stays a strip. The other way round — a row of people
       * across the top and a share underneath them — makes the thing being shared
       * the smaller half of the room and the people the larger one, which is the
       * wrong way round for both: a document is read, and a face in a strip is
       * only ever glanced at.
       *
       * Only reached while somebody is sharing, because that is the only thing
       * that earns a surface of its own. Without a share the people are the stage
       * and there is nothing here to be empty.
       */}
      <div
        data-pane="voice-stage"
        className="relative flex min-h-0 flex-1 items-stretch overflow-hidden rounded-lg bg-black/50"
      >
        <CallParticipant
          fill
          t={t}
          name={sharer.name || t.callUnknown}
          avatar={sharer.avatar}
          accent="#22d3ee"
          /**
           * Through the same helper as everybody else's tile.
           *
           * A remote stream is what arrives over a connection, and the person
           * sharing is not connected to themselves: this used to ask the map of
           * remote streams for their own picture and was handed nothing, which is
           * a black rectangle in the one place a share is supposed to be, and the
           * one screen that is not looking at their own desktop.
           */
          stream={selfStreamFor(sharer)}
          video
          muted={!sharer.mic}
          isSelf={isSelf(sharer)}
          sharing
          surface={sharer.screenSurface}
          screenSwitcher={sharerSwitcher}
        />
      </div>

      {/**
       * The people, in a strip along the bottom.
       *
       * Bounded, and never the room. A face is glanced at; a document is read. The
       * rows wrap upwards from the bottom when there are more people than fit, so
       * the strip grows towards the stage rather than pushing it away.
       */}
      <div
        data-pane="voice-strip"
        className={`grid shrink-0 auto-rows-[clamp(6rem,17vh,9.5rem)] gap-2 sm:gap-3 ${columnsFor(strip.length + 2)}`}
      >
        {strip.map((person) => tile(person))}
        {inviteTile}
      </div>

      {/**
       * Who to bring in, opened from the tile.
       *
       * From the tile rather than from a panel of its own, because the tile is
       * where a person looks when they wonder who else is here — the only moment
       * they are ever going to want this.
       */}
      {inviting ? (
        <InviteList
          t={t}
          friends={inviteCandidates}
          inCall={presences.map((person) => person.email)}
          onInvite={(email) => {
            onInvitePick(email);
            setInviting(false);
          }}
          onClose={() => setInviting(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The two choices the browser's own picker does not offer.
 *
 * That picker will hand over a screen or a window and stop there: no resolution,
 * no frame rate, and no word about what either will cost the connection. So the
 * two are picked here, before it opens, and the label beside them says plainly
 * that less video is less video — a person about to show a desktop does not
 * discover the trade-off by watching it stutter.
 *
 * Not a custom picker, and deliberately so: which screens exist is the browser's
 * to know. What the browser cannot say is what sharing one will cost, and that is
 * what this answers.
 */
function ScreenQualityPicker({
  t,
  quality,
  onPick,
  onClose,
}: {
  t: MessagesCopy;
  quality: ScreenQuality;
  onPick: (next: ScreenQuality) => void;
  onClose: () => void;
}) {
  const at = SCREEN_QUALITIES.indexOf(quality);
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border border-border bg-card p-2 shadow-xl">
      <div className="flex items-center gap-2 px-1 pb-2">
        <MonitorUp className="size-4 shrink-0 text-brand" />
        <p className="text-sm font-bold">{t.callStreamQuality}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.callMore}
          className="ml-auto grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="px-1 pb-1.5 text-[0.7rem] text-muted-foreground">{t.callStreamLessVideo}</p>
      <div className="flex gap-1">
        {SCREEN_QUALITIES.map((entry, index) => (
          <button
            key={`${entry.width}-${entry.frameRate}`}
            type="button"
            onClick={() => onPick(entry)}
            aria-pressed={index === at}
            className={`flex-1 cursor-pointer rounded px-2 py-1.5 font-mono text-[0.6rem] tracking-[0.1em] uppercase transition-colors ${
              index === at
                ? "bg-brand text-primary-foreground"
                : "bg-surface-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="block">{screenQualityLabel(entry)}</span>
            <span className="block">{entry.frameRate}fps</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * What is being shared, on a row of its own above the connection panel.
 *
 * Separate from the panel rather than inside it: a name that replaces the panel's
 * own line is a name that pushes the channel out of sight, and the channel is
 * what a person checks when they want to know where they are. The browser's name
 * for the screen goes here because it is the one thing about a share that nothing
 * else in the room can tell you.
 */
function SharedScreenStrip({
  t,
  label,
  onOpenQuality,
}: {
  t: MessagesCopy;
  label: string;
  onOpenQuality: () => void;
}) {
  return (
    <div
      data-pane="shared-screen"
      className="mb-1 flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-2"
    >
      <MonitorUp className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1 truncate text-xs font-bold" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={onOpenQuality}
        aria-label={t.callStreamQuality}
        title={t.callStreamQuality}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-brand hover:text-white"
      >
        <Settings className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * The four switches, as a row of squares under the panel.
 *
 * The same four the bottom bar carries, in the corner of the column. They are
 * duplicated rather than moved because the bottom bar is centred across the whole
 * window while this is what a person reaches for with the cursor already in the
 * sidebar — and a share that has to be stopped from the far side of the screen is
 * a share that keeps going after the browser's own button has gone.
 */
function VoiceQuickBar({
  t,
  micOn,
  cameraOn,
  screenOn,
  deafened,
  people,
  onMic,
  onCamera,
  onScreen,
  onDeafen,
  onPeople,
}: {
  t: MessagesCopy;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  deafened: boolean;
  people: VoicePresence[];
  onMic: () => void;
  onCamera: () => void;
  onScreen: () => void;
  onDeafen: () => void;
  onPeople: () => void;
}) {
  const square =
    "grid size-10 cursor-pointer place-items-center rounded-md transition-colors disabled:opacity-40";

  return (
    <div data-pane="voice-quick" className="mb-1 flex flex-col gap-1.5 px-1">
      {/**
       * The two switches a person reaches for, named rather than symbolised.
       *
       * A row of four identical squares is a toolbar you have to learn; a camera
       * and a screen are the only two things anybody joins a voice channel to turn
       * on, and saying which is which is the difference between a switch and a
       * guess. Above them stay the small ones, which are settings rather than
       * acts.
       */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={onCamera}
          aria-pressed={cameraOn}
          className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[0.7rem] font-bold transition-colors ${
            cameraOn
              ? "bg-[var(--discord-online)] text-white"
              : "bg-[var(--surface-2)] text-foreground hover:bg-[var(--surface-3)]"
          }`}
        >
          <Camera className="size-3.5" />
          {t.voicePanelVideo}
        </button>
        <button
          type="button"
          onClick={onScreen}
          aria-pressed={screenOn}
          className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[0.7rem] font-bold transition-colors ${
            screenOn
              ? "bg-[var(--discord-online)] text-white"
              : "bg-[var(--surface-2)] text-foreground hover:bg-[var(--surface-3)]"
          }`}
        >
          <MonitorUp className="size-3.5" />
          {t.voicePanelScreen}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onMic}
          disabled={!micOn}
          aria-label={micOn ? t.callMute : t.callUnmute}
          title={micOn ? t.callMute : t.callUnmute}
          className={`${square} ${
            // A silence somebody else applied is not this account's to lift, so the
            // switch is plainly unavailable rather than available and inert.
            micOn
              ? "bg-[var(--surface-2)] text-foreground hover:bg-[var(--destructive)] hover:text-white"
              : "bg-[var(--destructive)] text-white"
          }`}
        >
          {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onScreen}
          aria-label={screenOn ? t.callStopShare : t.callShareScreen}
          title={screenOn ? t.callStopShare : t.callShareScreen}
          aria-pressed={screenOn}
          className={`${square} ${
            screenOn
              ? "bg-[var(--discord-online)] text-white"
              : "bg-[var(--surface-2)] text-foreground hover:bg-[var(--surface-3)]"
          }`}
        >
          <MonitorUp className="size-4" />
        </button>
        <button
          type="button"
          onClick={onPeople}
          aria-label={t.callInChannel}
          title={t.callInChannel}
          className={`${square} relative bg-[var(--surface-2)] text-foreground hover:bg-[var(--surface-3)]`}
        >
          <Users className="size-4" />
          {people.length > 0 ? (
            <span className="absolute -right-1 -bottom-1 grid min-w-4 place-items-center rounded-full bg-[var(--destructive)] px-1 text-[0.55rem] leading-4 font-bold text-white">
              {people.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onDeafen}
          aria-label={deafened ? t.callUndeafen : t.callDeafen}
          title={deafened ? t.callUndeafen : t.callDeafen}
          aria-pressed={deafened}
          className={`${square} ${
            deafened
              ? "bg-[var(--destructive)] text-white"
              : "bg-[var(--surface-2)] text-foreground hover:bg-[var(--surface-3)]"
          }`}
        >
          {deafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Who is standing in the channel, opened from the corner of the column.
 *
 * It repeats the list the channel row already draws, and that is the point: the
 * quick bar sits under the panel where somebody's eye already is, and a room of
 * eight should not need a scroll up the column to find out who is in it.
 *
 * Silencing is offered only to the server's owner. A member is shown what
 * everybody can see, because a channel that has somebody in it who cannot be
 * heard is exactly the thing a person needs to be able to see.
 */
function ChannelPeoplePanel({
  t,
  selfEmail,
  presences,
  canModerate,
  onServerMute,
  onClose,
}: {
  t: MessagesCopy;
  selfEmail: string;
  presences: VoicePresence[];
  canModerate: boolean;
  onServerMute: (email: string, muted: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div
      data-pane="channel-people"
      className="mb-1 max-h-64 overflow-y-auto rounded-lg bg-[var(--discord-rail)] p-1.5"
    >
      <div className="flex items-center gap-1 px-1 pb-1">
        <span className="flex-1 font-mono text-[0.55rem] tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
          {t.callInChannel}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.callMore}
          className="grid size-5 cursor-pointer place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
      <ChannelPeopleList
        t={t}
        selfEmail={selfEmail}
        presences={presences}
        canModerate={canModerate}
        onServerMute={onServerMute}
      />
    </div>
  );
}

/**
 * Who is in the channel, and what each of them is doing.
 *
 * Its own component because two places draw it: the panel down the column, and the
 * popover the room's own header opens. They are the same list of the same people,
 * and the header is where a person looks first — a button whose contents appear in
 * another column is a button that looks broken for the half second before the eye
 * catches up.
 *
 * Silencing is offered only to the server's owner. A member is shown what everybody
 * can see, because a channel with somebody in it who cannot be heard is exactly the
 * thing a person needs to be able to see.
 */
function ChannelPeopleList({
  t,
  selfEmail,
  presences,
  canModerate,
  onServerMute,
}: {
  t: MessagesCopy;
  selfEmail: string;
  presences: VoicePresence[];
  canModerate: boolean;
  onServerMute: (email: string, muted: boolean) => void;
}) {
  return (
    <ul className="space-y-px">
      {presences.map((person) => (
        <li key={person.email} className="flex items-center gap-1.5 rounded px-1 py-1">
          <span className="min-w-0 flex-1 truncate text-[0.78rem]">
            {person.name}
            {person.email === selfEmail ? (
              <span className="ml-1 text-[0.6rem] text-[var(--muted-foreground)]">({t.you})</span>
            ) : null}
          </span>
          {person.screen ? (
            <span
              title={person.screenLabel || t.callScreenLabel}
              className="shrink-0 rounded bg-[var(--destructive)] px-1 py-0.5 font-mono text-[0.45rem] tracking-[0.12em] text-white uppercase"
            >
              {t.callScreenLive}
            </span>
          ) : null}
          <span className="shrink-0" aria-hidden="true">
            {person.camera ? (
              <Video className="size-3 text-[var(--muted-foreground)]" />
            ) : (
              <VideoOff className="size-3 text-[var(--muted-foreground)]/50" />
            )}
          </span>
          {canModerate ? (
            <button
              type="button"
              onClick={() => onServerMute(person.email, !person.serverMuted)}
              aria-label={person.serverMuted ? t.callUnmute : t.callMute}
              title={person.serverMuted ? t.serverMuted : t.callMute}
              className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)] hover:text-white"
            >
              {person.mic ? <Mic className="size-3" /> : <MicOff className="size-3" />}
            </button>
          ) : (
            <span aria-hidden="true" className="shrink-0 text-[var(--muted-foreground)]">
              {person.mic ? <Mic className="size-3" /> : <MicOff className="size-3" />}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The panel that says what this device is connected to, pinned above the account
 * bar.
 *
 * It sits where the design puts it because a microphone that is open is not
 * something somebody should have to go looking for: it is a strip at the foot of
 * the column, present whether or not anybody is talking, and the way out of it is
 * on the strip rather than inside a menu.
 */
function VoiceStatusPanel({
  t,
  channelName,
  serverName,
  presence,
  onLeave,
  onShowRoom,
}: {
  t: MessagesCopy;
  channelName: string;
  serverName: string;
  presence: VoicePresence | null;
  onLeave: () => void;
  /**
   * Bring the room back into the middle of the screen, or null while it is already
   * there. The panel is the one thing that stays put while a conversation replaces
   * the room, which makes it the honest place for the way back — the alternative is
   * a screen with an open microphone and no way of seeing the room except by
   * remembering to click the channel again.
   */
  onShowRoom: (() => void) | null;
}) {
  /**
   * The panel always names the channel.
   *
   * It used to swap in the shared screen's name instead, which was the right call
   * while there was nowhere else to put it and is the wrong one now that the
   * screen has a row of its own above: replacing the channel here means a person
   * sharing a screen can no longer see which channel they are in.
   */
  return (
    <div data-pane="voice-status" className="shrink-0 px-2 pb-2">
      <div className="rounded-lg bg-[var(--discord-rail)] p-2">
        <div className="flex items-center gap-2">
          <span className="flex flex-1 items-center gap-1.5 text-[0.7rem] text-[var(--muted-foreground)]">
            {presence?.mic ? (
              <Mic className="size-3.5 shrink-0 text-[var(--discord-online)]" />
            ) : (
              <MicOff className="size-3.5 shrink-0 text-[var(--destructive)]" />
            )}
            <span className="min-w-0 truncate">{t.voiceConnected}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {/* The waveform is the picture of somebody talking: this device's own
                signal, and the one thing on the panel that is not a button. */}
            <span
              aria-hidden="true"
              className={`flex h-3 items-end gap-0.5 ${
                presence?.mic ? "text-[var(--discord-online)]" : "text-[var(--muted-foreground)]"
              }`}
            >
              {[4, 9, 6, 11, 7].map((height, index) => (
                <span
                  key={index}
                  className="w-0.5 rounded-full bg-current"
                  style={{ height: presence?.mic ? height : 2 }}
                />
              ))}
            </span>
            {onShowRoom ? (
              <button
                type="button"
                onClick={onShowRoom}
                aria-label={t.showRoom}
                title={t.showRoom}
                className="grid size-6 place-items-center rounded-full bg-brand text-white transition-colors hover:bg-brand-dim"
              >
                <Volume2 className="size-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onLeave}
              aria-label={t.leaveVoice}
              title={t.leaveVoice}
              className="grid size-6 place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)] hover:text-white"
            >
              <PhoneOff className="size-3.5" />
            </button>
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 truncate text-[0.7rem]">
          <Volume2 className="size-3 shrink-0 opacity-60" />
          <span className="min-w-0 truncate text-foreground">{channelName}</span>
          <span className="text-[var(--muted-foreground)]"> / {serverName}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * The bottom bar of a voice channel: the controls, centred.
 *
 * Centred rather than spread across the width because these are the buttons a
 * person reaches for without looking, and a row of five at the left of a wide
 * screen is a row they have to find. Each control carries a dropdown arrow where
 * picking a different device is the common case, so the device list is one tap
 * from the switch rather than behind a settings panel.
 */
function VoiceControlBar({
  t,
  presence,
  remoteStreams,
  micDeviceOpen,
  cameraDeviceOpen,
  qualityOpen,
  quality,
  onQualityMenu,
  onQualityPick,
  onToggleMic,
  onToggleCamera,
  onToggleScreen,
  onToggleDeafen,
  onLeave,
  onMicMenu,
  onCameraMenu,
  onMore,
}: {
  t: MessagesCopy;
  presence: VoicePresence | null;
  /** One stream per person in the room, so everybody is heard. */
  remoteStreams: Record<string, unknown>;
  micDeviceOpen: boolean;
  cameraDeviceOpen: boolean;
  /** Whether the resolution and frame rate picker is open. */
  qualityOpen: boolean;
  /** What the next share will ask for. */
  quality: ScreenQuality;
  onQualityMenu: () => void;
  onQualityPick: (next: ScreenQuality) => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
  onMicMenu: () => void;
  onCameraMenu: () => void;
  onMore: () => void;
}) {
  const silenced = Boolean(presence?.serverMuted);

  return (
    /**
     * A strip that sits in the column above the account widget, rather than a
     * bar pinned to the bottom of the page.
     *
     * `w-fit` with `max-w-full` is what stops it stretching: pinned to the page
     * it was a full width band on any screen narrower than the three columns,
     * and hugging its own contents is the only width it is right at. The padding
     * is symmetric now — the safe area inset belonged to a bar flush with the
     * screen edge, which this no longer is, and it was what made the strip look
     * as though it hung below where it belonged.
     *
     * `mx-auto` centres what is left over. A bar hugging the left edge of a
     * column twice its own width reads as a strip that ran out of room, and the
     * share button — the one control here people came to use — ended up hard
     * against the edge with nothing around it.
     */
    <div className="mx-auto flex w-fit max-w-full items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-2 py-1.5 backdrop-blur-xl">
      {/* A microphone somebody else switched off is not this account's to turn
          back on, so the button says so rather than doing nothing on a press. */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center overflow-hidden rounded-lg bg-[var(--surface-2)]">
          <button
            type="button"
            onClick={onToggleMic}
            aria-label={presence?.mic ? t.callMute : t.callUnmute}
            title={
              silenced
                ? `${t.serverMutedBy} ${presence?.mutedBy ?? ""}`.trim()
                : presence?.mic
                  ? t.callMute
                  : t.callUnmute
            }
            aria-pressed={!presence?.mic}
            className={`grid size-11 cursor-pointer place-items-center transition-colors ${
              presence?.mic
                ? "text-foreground hover:bg-[var(--destructive)] hover:text-white"
                : "bg-[var(--destructive)] text-white"
            }`}
          >
            {presence?.mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </button>
          <button
            type="button"
            onClick={onMicMenu}
            aria-label={t.callMicDevice}
            title={t.callMicDevice}
            aria-expanded={micDeviceOpen}
            className="grid h-11 w-7 cursor-pointer place-items-center text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)] hover:text-white"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>

        <div className="flex items-center overflow-hidden rounded-lg bg-[var(--surface-2)]">
          <button
            type="button"
            onClick={onToggleCamera}
            aria-label={presence?.camera ? t.callCameraOff : t.callCameraOn}
            title={presence?.camera ? t.callCameraOff : t.callCameraOn}
            aria-pressed={presence?.camera}
            className={`grid size-11 cursor-pointer place-items-center transition-colors ${
              presence?.camera
                ? "text-foreground hover:bg-[var(--destructive)] hover:text-white"
                : "text-[var(--muted-foreground)] hover:text-foreground"
            }`}
          >
            {presence?.camera ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          </button>
          <button
            type="button"
            onClick={onCameraMenu}
            aria-label={t.callCameraDevice}
            title={t.callCameraDevice}
            aria-expanded={cameraDeviceOpen}
            className="grid h-11 w-7 cursor-pointer place-items-center text-[var(--muted-foreground)] transition-colors hover:bg-foreground hover:text-background"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={onToggleScreen}
            aria-label={presence?.screen ? t.callStopShare : t.callShareScreen}
            title={presence?.screen ? t.callStopShare : t.callShareScreen}
            aria-pressed={presence?.screen}
            aria-expanded={qualityOpen}
            className={`grid size-11 cursor-pointer place-items-center rounded-lg transition-colors ${
              presence?.screen
                ? "bg-brand text-white"
                : "bg-[var(--surface-2)] text-foreground hover:bg-[var(--surface-3)]"
            }`}
          >
            <MonitorUp className="size-5" />
          </button>
          {/* The choices the browser's own picker does not offer, on the corner of
              the button rather than in a settings panel: the resolution and the
              frame rate are settled before anybody sees a frame of the desktop. */}
          <button
            type="button"
            onClick={onQualityMenu}
            aria-label={t.callStreamQuality}
            title={t.callStreamQuality}
            className="absolute -right-1 -bottom-1 grid size-4 cursor-pointer place-items-center rounded-full border-2 border-card bg-[var(--surface-3)] text-foreground transition-colors hover:bg-brand hover:text-white"
          >
            <Settings className="size-2.5" />
          </button>
          {qualityOpen ? (
            <ScreenQualityPicker
              t={t}
              quality={quality}
              onPick={onQualityPick}
              onClose={onQualityMenu}
            />
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggleDeafen}
          aria-label={presence?.deafened ? t.callUndeafen : t.callDeafen}
          title={presence?.deafened ? t.callUndeafen : t.callDeafen}
          aria-pressed={presence?.deafened}
          className={`grid size-11 cursor-pointer place-items-center rounded-lg transition-colors ${
            presence?.deafened
              ? "bg-[var(--destructive)] text-white"
              : "bg-[var(--surface-2)] text-foreground hover:bg-[var(--surface-3)]"
          }`}
        >
          {presence?.deafened ? (
            <HeadphoneOff className="size-5" />
          ) : (
            <Headphones className="size-5" />
          )}
        </button>
        <button
          type="button"
          onClick={onMore}
          aria-label={t.callMore}
          title={t.callMore}
          className="grid size-11 cursor-pointer place-items-center rounded-lg bg-[var(--surface-2)] text-foreground transition-colors hover:bg-[var(--surface-3)]"
        >
          <MoreVertical className="size-5" />
        </button>
        <button
          type="button"
          onClick={onLeave}
          aria-label={t.leaveVoice}
          title={t.leaveVoice}
          className="grid size-11 cursor-pointer place-items-center rounded-lg bg-[var(--destructive)] text-white transition-colors hover:bg-[var(--destructive)]/85"
        >
          <PhoneOff className="size-5" />
        </button>
      </div>

      {/* Every remote stream gets an element of its own, out of sight. Without
          these a browser drops the audio of anybody it cannot see, and a channel
          of four is heard as the last person to arrive. */}
      {Object.entries(remoteStreams).map(([email, stream]) => (
        <RemoteAudio key={email} stream={stream} />
      ))}
    </div>
  );
}

/**
 * The friends, in the middle of the screen, with nothing open.
 *
 * What the design puts here when no conversation is open: the title, the three
 * tabs that are three different questions, the button that adds somebody, and
 * the list under a search of its own. A row opens the conversation, so the
 * thread still takes the same column it always has — the difference is only what
 * a person finds when they have not picked anything yet.
 *
 * The three tabs are the same data read three ways, so the numbers beside the
 * headings count what is on screen and not the whole store: a section that says
 * "Онлайн — 4" while the search shows one of them is a number that cannot be
 * checked.
 */
function FriendsView({
  t,
  friends,
  query,
  onQueryChange,
  onOpenChat,
  onRemoveFriend,
  onRespondFriend,
}: {
  t: MessagesCopy;
  friends: FriendRow[];
  query: string;
  onQueryChange: (value: string) => void;
  onOpenChat: (row: FriendRow) => void;
  onRemoveFriend: (email: string) => void;
  onRespondFriend: (id: string, accept: boolean) => void;
}) {
  const [tab, setTab] = useState<"online" | "all" | "pending">("online");
  const [addOpen, setAddOpen] = useState(false);

  /**
   * The requests, read straight off the store.
   *
   * Not a prop, because they belong to the same list as the friends and reading
   * one from the store and the other from an argument is how the two disagree:
   * accepting a request has to move the name out of "Incoming" and into "All"
   * without either half being told to.
   */
  const requests = useSyncExternalStore(
    messagesStore.subscribe,
    () => messagesStore.getState().friends,
    () => messagesStore.getState().friends,
  );

  const needle = query.trim().toLocaleLowerCase();
  const shown = useMemo(
    () =>
      needle
        ? friends.filter((person) =>
            `${person.name} ${person.email} ${person.about}`.toLocaleLowerCase().includes(needle),
          )
        : friends,
    [friends, needle],
  );

  const online = shown.filter((person) => person.online);
  const offline = shown.filter((person) => !person.online);
  const incoming = requests.incoming.filter((request) =>
    needle ? `${request.fromName} ${request.fromEmail}`.toLocaleLowerCase().includes(needle) : true,
  );
  const outgoing = requests.outgoing.filter((request) =>
    needle ? `${request.toName} ${request.toEmail}`.toLocaleLowerCase().includes(needle) : true,
  );

  const section = (label: string, rows: FriendRow[]) => (
    <section className="px-2 pt-4">
      <h3 className="mb-1 px-2 font-mono text-[0.6rem] font-bold tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
        {label} — {rows.length}
      </h3>
      <ul>
        {rows.map((person) => (
          <FriendRowItem
            key={person.email}
            t={t}
            person={person}
            onOpen={() => onOpenChat(person)}
            onRemove={() => onRemoveFriend(person.email)}
          />
        ))}
      </ul>
    </section>
  );

  const empty = (message: string) => (
    <p className="px-6 py-10 text-center text-sm text-[var(--muted-foreground)]">{message}</p>
  );

  return (
    <div data-pane="friends" className="flex min-h-0 flex-1 flex-col bg-[var(--card)]">
      {/**
       * The header: the title, the three tabs, and the one button that adds
       * somebody. On one row and wrapping rather than stacked, because the three
       * tabs and the button answer three different questions and putting them on
       * separate lines turns one glance into three.
       */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.2)]">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-base font-bold">{t.friendsTitle}</h2>
          <span aria-hidden="true" className="h-6 w-px bg-[var(--border)]" />
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {(
              [
                { id: "online" as const, label: t.friendsTabOnline, count: online.length },
                { id: "all" as const, label: t.friendsTabAll, count: shown.length },
                { id: "pending" as const, label: t.friendsTabPending, count: incoming.length },
              ] satisfies Array<{ id: "online" | "all" | "pending"; label: string; count: number }>
            ).map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={`cursor-pointer rounded px-2.5 py-1 text-[0.85rem] transition-colors ${
                  tab === id
                    ? "bg-[var(--accent)] text-foreground"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]/60 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded bg-[var(--brand)] px-3 py-1.5 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--brand-dim)]"
            >
              <UserPlus className="size-4" />
              <span className="hidden sm:inline">{t.addFriendTitle}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            collisionPadding={12}
            className="w-[min(22rem,calc(100vw-1.5rem))] border-border bg-popover p-0"
          >
            <AddFriendSheet t={t} onClose={() => setAddOpen(false)} />
          </PopoverContent>
        </Popover>
      </header>

      <div className="shrink-0 px-4 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t.friendsSearch}
            aria-label={t.friendsSearch}
            className="w-full rounded bg-[var(--background)] py-1.5 pl-8 pr-7 text-[0.8rem] text-foreground outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-brand"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label={t.cancel}
              className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-4">
        {tab === "online" ? (
          online.length ? (
            <>
              {section(t.friendsSectionOnline, online)}
              {offline.length ? section(t.friendsSectionOffline, offline) : null}
            </>
          ) : (
            empty(t.friendsEmptyOnline)
          )
        ) : tab === "all" ? (
          shown.length ? (
            <>
              {online.length ? section(t.friendsSectionOnline, online) : null}
              {offline.length ? section(t.friendsSectionOffline, offline) : null}
            </>
          ) : (
            empty(t.friendsEmptyAll)
          )
        ) : (
          <section className="px-2 pt-4">
            <RequestList
              t={t}
              label={t.friendsSectionIncoming}
              requests={incoming}
              emptyMessage={t.friendsEmptyPending}
              onAccept={(id) => onRespondFriend(id, true)}
              onDecline={(id) => onRespondFriend(id, false)}
            />
            <RequestList
              t={t}
              label={t.friendsSectionOutgoing}
              requests={outgoing}
              emptyMessage={t.friendsEmptyPending}
              onAccept={() => {}}
              onDecline={() => {}}
              waiting
            />
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * One friend, as a row: the face, the name with its badges, their own line, and
 * the two actions on the far side.
 *
 * The message button is the row itself and the dots beside it are the rest, so
 * the whole width is a target and the destructive thing is behind a click. That
 * ordering matters: removing somebody is one keystroke away from writing to them
 * if the row is the menu.
 */
function FriendRowItem({
  t,
  person,
  onOpen,
  onRemove,
}: {
  t: MessagesCopy;
  person: FriendRow;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={onOpen}
        title={t.messageThem}
        className="flex w-full cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--accent)]/60"
      >
        <span className="relative shrink-0">
          <span
            className="grid size-10 place-items-center overflow-hidden rounded-full font-display text-sm font-bold"
            style={{ backgroundColor: `${person.accent}1f`, color: person.accent }}
          >
            {person.avatar ? (
              <span
                style={{ backgroundImage: `url("${person.avatar}")` }}
                className="size-full bg-cover bg-center"
              />
            ) : (
              initialsForName(person.name)
            )}
          </span>
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[var(--card)] ${
              person.online ? "bg-[var(--discord-online)]" : "bg-[#80848e]"
            }`}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[0.9rem] font-semibold">{person.name}</span>
            {person.email.endsWith("@bot.hyttl") ? (
              <span className="shrink-0 rounded bg-[var(--brand)] px-1 py-px font-mono text-[0.5rem] font-bold tracking-[0.08em] text-white">
                {t.friendBotBadge}
              </span>
            ) : null}
          </span>
          {person.about || person.email ? (
            <span className="mt-0.5 block truncate text-[0.72rem] text-[var(--muted-foreground)]">
              {person.about || person.email}
            </span>
          ) : null}
        </span>
      </button>

      {/**
       * The two actions, revealed on hover and always on a touch screen.
       *
       * `opacity-0` rather than `hidden`, because a control that is display-none
       * is out of the tab order and out of the accessibility tree too, and the
       * only way to reach it on a keyboard would be to guess.
       */}
      <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${t.messageThem} — ${person.name}`}
          title={t.messageThem}
          className="grid size-8 cursor-pointer place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
        >
          <MessageSquarePlus className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={`${t.chatSettings} — ${person.name}`}
          aria-expanded={menuOpen}
          title={t.chatSettings}
          className="grid size-8 cursor-pointer place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
        >
          <MoreVertical className="size-4" />
        </button>
      </span>

      {menuOpen ? (
        <div className="absolute top-9 right-2 z-20 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-1 shadow-xl">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[0.8rem] text-[var(--destructive)] transition-colors hover:bg-[var(--destructive)]/10"
          >
            <Trash2 className="size-3.5" />
            {t.removeFriend}
          </button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * One bucket of pending requests.
 *
 * The outgoing bucket has no buttons on it, because there is nothing to answer:
 * the only thing to do with a request you sent is wait, and a row of disabled
 * buttons is a row that looks broken.
 */
function RequestList({
  t,
  label,
  requests,
  emptyMessage,
  onAccept,
  onDecline,
  waiting = false,
}: {
  t: MessagesCopy;
  label: string;
  requests: FriendRequest[];
  emptyMessage: string;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  waiting?: boolean;
}) {
  return (
    <div className="mb-2">
      <h3 className="mb-1 px-2 font-mono text-[0.6rem] font-bold tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
        {label} — {requests.length}
      </h3>
      {requests.length === 0 ? (
        <p className="px-2 py-1 text-[0.78rem] text-[var(--muted-foreground)]/70">{emptyMessage}</p>
      ) : (
        <ul>
          {requests.map((request) => {
            const name = waiting ? request.toName : request.fromName;
            const email = waiting ? request.toEmail : request.fromEmail;
            return (
              <li
                key={request.id}
                className="flex items-center gap-3 rounded px-2 py-1.5 transition-colors hover:bg-[var(--accent)]/60"
              >
                <span className="relative shrink-0">
                  <span
                    className="grid size-10 place-items-center overflow-hidden rounded-full font-display text-sm font-bold"
                    style={{ backgroundColor: "#5865f21f", color: "#8b93f0" }}
                  >
                    {request.fromAvatar ? (
                      <span
                        style={{ backgroundImage: `url("${request.fromAvatar}")` }}
                        className="size-full bg-cover bg-center"
                      />
                    ) : (
                      initialsForName(name)
                    )}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold">{name}</span>
                  <span className="mt-0.5 block truncate text-[0.72rem] text-[var(--muted-foreground)]">
                    {email}
                  </span>
                </span>
                {waiting ? (
                  <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[0.5rem] font-bold tracking-[0.08em] text-[var(--muted-foreground)] uppercase">
                    {t.friendPendingBadge}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAccept(request.id)}
                      aria-label={`${t.accept} — ${name}`}
                      title={t.accept}
                      className="grid size-8 cursor-pointer place-items-center rounded-full bg-[var(--discord-online)] text-white transition-colors hover:brightness-110"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecline(request.id)}
                      aria-label={`${t.decline} — ${name}`}
                      title={t.decline}
                      className="grid size-8 cursor-pointer place-items-center rounded-full bg-[var(--destructive)] text-white transition-colors hover:brightness-110"
                    >
                      <X className="size-4" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * What the add button opens: the directory search.
 *
 * It is the same search the friends panel has, lifted into the middle of the
 * screen. The button is in the header of the list it fills, so a person who
 * pressed it is looking at the list and should not have to walk over to the
 * sidebar to fill it in.
 */
function AddFriendSheet({ t, onClose }: { t: MessagesCopy; onClose: () => void }) {
  const people = useSyncExternalStore(
    messagesStore.subscribe,
    () => messagesStore.getState().people,
    () => messagesStore.getState().people,
  );
  const searching = useSyncExternalStore(
    messagesStore.subscribe,
    () => messagesStore.getState().searching,
    () => messagesStore.getState().searching,
  );

  return (
    <div className="p-3">
      <p className="mb-2 text-sm font-bold">{t.addFriendTitle}</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <input
          autoFocus
          onChange={(event) => void messagesStore.searchPeople(event.target.value)}
          placeholder={t.findPeoplePlaceholder}
          aria-label={t.findPeople}
          className="w-full rounded bg-[var(--background)] py-1.5 pl-8 pr-3 text-[0.8rem] text-foreground outline-none placeholder:text-[var(--muted-foreground)] focus:ring-1 focus:ring-brand"
        />
      </div>
      <p className="mt-2 text-[0.7rem] text-[var(--muted-foreground)]">{t.findPeopleHint}</p>

      {searching ? (
        <p className="mt-3 flex items-center justify-center gap-2 text-[0.7rem] text-[var(--muted-foreground)]">
          <Loader2 className="size-3 animate-spin" />
        </p>
      ) : null}

      {people.length > 0 ? (
        <ul className="mt-3 grid gap-1">
          {people.map((person) => {
            const relationship = messagesStore.friendshipWith(person.email);
            const already = relationship?.status === "accepted";
            const requested = relationship?.status === "pending";
            return (
              <li key={person.email} className="flex items-center gap-2.5 rounded px-1.5 py-1.5">
                <span
                  className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-[0.65rem] font-bold"
                  style={{ backgroundColor: "#5865f21f", color: "#8b93f0" }}
                >
                  {person.avatar ? (
                    <span
                      style={{ backgroundImage: `url("${person.avatar}")` }}
                      className="size-full bg-cover bg-center"
                    />
                  ) : (
                    person.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.78rem] font-semibold">{person.name}</span>
                  <span className="block truncate text-[0.65rem] text-[var(--muted-foreground)]">
                    {person.email}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={already || requested}
                  onClick={() => {
                    void messagesStore.sendFriendRequest(person);
                    onClose();
                  }}
                  className="shrink-0 cursor-pointer rounded bg-[var(--brand)] px-2.5 py-1 text-[0.7rem] font-semibold text-white transition-colors hover:bg-[var(--brand-dim)] disabled:cursor-default disabled:bg-[var(--surface-2)] disabled:text-[var(--muted-foreground)]"
                >
                  {already ? t.alreadyFriend : requested ? t.requestPending : t.addFriend}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full cursor-pointer rounded bg-[var(--surface-2)] px-3 py-1.5 text-[0.75rem] text-[var(--muted-foreground)] transition-colors hover:text-foreground"
      >
        {t.cancel}
      </button>
    </div>
  );
}

/**
 * Who is around, down the right.
 *
 * The heading says "active now", so the column answers exactly one question:
 * who could answer me at this moment. The people in the call come first,
 * because during a call that is the only list anybody reads, then the friends
 * who are here, then everyone else. An offline contact is left out — a sidebar
 * of grey names is a list of people who cannot answer.
 *
 * When nobody is here at all it says so in a card rather than in one grey line.
 * An empty column and a column that failed to load look the same otherwise, and
 * they are two very different things to be looking at.
 */
function MemberRail({
  t,
  inCall,
  friends,
  online,
}: {
  t: MessagesCopy;
  inCall: Array<{
    name: string;
    avatar: string | null;
    accent: string;
    muted: boolean;
    /** Their audio has arrived, as against their switch being on. */
    voice: boolean;
  }>;
  /** Accepted friends, in the order they were accepted, newest first. */
  friends: FriendRow[];
  /** Everybody else who is here, so an online stranger is not invisible. */
  online: FriendRow[];
}) {
  const line = (
    person: { name: string; avatar: string | null; accent: string },
    speaking: boolean,
    key?: string,
  ) => (
    <li
      key={key ?? person.name}
      className="flex items-center gap-2.5 rounded px-2 py-1.5 transition-colors hover:bg-[var(--accent)]/60"
    >
      <span
        className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full font-display text-xs font-bold"
        style={{ backgroundColor: `${person.accent}1f`, color: person.accent }}
      >
        {person.avatar ? (
          <span
            className="size-full bg-cover bg-center"
            style={{ backgroundImage: `url("${person.avatar}")` }}
          />
        ) : (
          initialsForName(person.name)
        )}
        <span
          aria-hidden="true"
          className={`absolute right-0 bottom-0 size-3 rounded-full border-2 border-[var(--surface)] ${
            speaking ? "bg-[var(--discord-online)]" : "bg-[#80848e]"
          }`}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.85rem] text-foreground">{person.name}</span>
    </li>
  );

  const heading = (label: string, count: number) => (
    <p className="mt-4 mb-1 px-2 font-mono text-[0.58rem] font-bold tracking-[0.14em] text-[var(--muted-foreground)] uppercase first:mt-0">
      {label} — {count}
    </p>
  );

  const quiet = !inCall.length && !friends.length && !online.length;

  return (
    <aside
      aria-label={t.railPeople}
      data-pane="members"
      className="hidden min-h-0 flex-1 basis-0 flex-col overflow-y-auto bg-[var(--surface)] px-1.5 py-3 xl:flex xl:min-w-[13rem]"
    >
      <h2 className="mb-2 px-2 text-base font-bold">{t.activeNowTitle}</h2>

      {inCall.length ? (
        <>
          {heading(t.railInCall, inCall.length)}
          <ul className="mb-1">
            {inCall.map((person) => (
              <li
                key={person.name}
                className="flex items-center gap-1 rounded transition-colors hover:bg-[var(--accent)]/60"
              >
                {line(person, person.muted || !person.voice, person.name)}
                {/* The device itself, beside the name, because a person whose
                    switch is on but whose audio has not arrived is the one thing
                    a list of participants cannot show on its own. */}
                <span
                  title={person.voice ? t.callVoiceConnected : t.callVoiceWaiting}
                  aria-label={person.voice ? t.callVoiceConnected : t.callVoiceWaiting}
                  className={`grid size-5 shrink-0 place-items-center rounded-full ${
                    person.voice
                      ? "bg-[var(--discord-online)] text-white"
                      : "bg-[var(--surface-2)] text-[var(--muted-foreground)]"
                  }`}
                >
                  {person.muted || !person.voice ? (
                    <MicOff className="size-2.5" />
                  ) : (
                    <Mic className="size-2.5" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {friends.length ? (
        <>
          {heading(t.railFriends, friends.length)}
          <ul className="mb-1">
            {friends.map((person) => line(person, person.online, person.email))}
          </ul>
        </>
      ) : null}

      {online.length ? (
        <>
          {heading(t.railOnline, online.length)}
          <ul>{online.map((person) => line(person, true, person.email))}</ul>
        </>
      ) : null}

      {/**
       * The card. It carries an explanation rather than an apology, because
       * "nobody here" is the correct answer most of the time and a person should
       * not have to work out whether it is a failure.
       */}
      {quiet ? (
        <div className="mt-1 rounded-lg bg-[var(--surface-2)] p-3 text-center">
          <p className="text-[0.8rem] font-bold">{t.activeNowQuietTitle}</p>
          <p className="mt-1.5 text-[0.72rem] leading-relaxed text-[var(--muted-foreground)]">
            {t.activeNowQuietBody}
          </p>
        </div>
      ) : null}
    </aside>
  );
}

/**
 * The panel in the bottom corner, where Discord keeps the three things a person
 * needs during a call without looking for them.
 *
 * Muting the microphone and deafening the speakers are separate switches on
 * purpose: a laptop picking up a room and a person unable to hear because their
 * headset is on the desk are different problems, and a single switch makes the
 * second one look like the first. Leaving is the red one and is the only
 * destructive thing here, so it is the only one that is red.
 */
function VoiceDock({
  t,
  self,
  mic,
  deafened,
  elapsed,
  onMic,
  onDeafen,
  onLeave,
}: {
  t: MessagesCopy;
  /** Whose panel this is. Its own name, so a switch means "mine". */
  self: { name: string; avatar: string | null; accent: string };
  mic: boolean;
  deafened: boolean;
  /** `mm:ss` from the moment the call connected, or empty before it has. */
  elapsed: string;
  onMic: () => void;
  onDeafen: () => void;
  onLeave: () => void;
}) {
  const sw = (
    label: string,
    on: boolean,
    danger: string | null,
    onClick: () => void,
    mark: ReactNode,
    toggles?: () => void,
  ) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      /** A right click opens the panel rather than the switch: the switch is
          what you press a hundred times a call, the settings are what you press
          once, and putting both on the same click is how a person ends a call
          by aiming for the microphone. */
      onContextMenu={
        toggles
          ? (event) => {
              event.preventDefault();
              toggles();
            }
          : undefined
      }
      className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors ${
        danger
          ? "bg-[var(--discord-leave)] text-white hover:brightness-110"
          : on
            ? "bg-[var(--surface-2)] text-[var(--discord-deafen)] hover:brightness-125"
            : "bg-[var(--discord-leave)] text-white hover:brightness-110"
      }`}
    >
      {mark}
    </button>
  );

  const [panel, setPanel] = useState(false);
  const [mics, setMics] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [micId, setMicId] = useState<string>("");
  const [volume, setVolume] = useState(1);
  const [probe, setProbe] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!panel) return;
    void messagesStore
      .callDevices()
      .then((list) => {
        setMics(list);
        if (!micId) setMicId(list[0]?.deviceId ?? "");
      })
      .catch(() => undefined);
  }, [panel, micId]);

  useEffect(() => {
    if (!panel) return;
    const away = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setPanel(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);

  /** The level meter, so a slider that does nothing is not a slider. */
  const startProbe = () => {
    const media = messagesStore.callMedia();
    if (probe !== null) {
      media.stopMeter();
      setProbe(null);
      return;
    }
    media
      .startMeter((level) => setProbe(level))
      .then((started) => {
        if (!started) setProbe(null);
      })
      .catch(() => setProbe(null));
  };

  return (
    <div className="flex w-60 flex-col overflow-hidden rounded-lg bg-[var(--surface-2)]">
      {/**
       * Who is speaking, over the switches.
       *
       * A panel of three icons with nothing saying whose they are is a control
       * panel belonging to nobody. The name and the face are what make the
       * microphone switch mean "mine" rather than "the app's", and it is the one
       * piece of this column that the calling apps all agree on.
       */}
      <div className="flex min-w-0 items-center gap-2 px-2 pt-2 pb-1.5">
        <span
          className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full font-display text-xs font-bold"
          style={{ backgroundColor: `${self.accent}1f`, color: self.accent }}
        >
          {self.avatar ? (
            <span
              className="size-full bg-cover bg-center"
              style={{ backgroundImage: `url("${self.avatar}")` }}
            />
          ) : (
            initialsForName(self.name)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{self.name}</span>
          {elapsed ? (
            <span className="block font-mono text-[0.6rem] tabular-nums text-[var(--muted-foreground)]">
              {elapsed}
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex items-center gap-1 px-2 pb-2">
        {sw(
          mic ? t.callMute : t.callUnmute,
          mic,
          null,
          onMic,
          mic ? <Mic className="size-4" /> : <MicOff className="size-4" />,
          () => setPanel((current) => !current),
        )}
        {sw(
          deafened ? t.callUndeafen : t.callDeafen,
          !deafened,
          null,
          onDeafen,
          deafened ? <VolumeX className="size-4" /> : <Headphones className="size-4" />,
        )}
        {sw(t.callLeave, false, "leave", onLeave, <PhoneOff className="size-4" />)}
      </div>

      {/**
       * The panel that opens off the microphone, as it does everywhere else.
       *
       * Two things in here can be wrong while the call is perfectly healthy —
       * the wrong microphone is picked, and the input is too quiet — and neither
       * is visible from the call screen. Found a hundred times a call, and both
       * are one click away from the switch that silences you.
       */}
      {panel ? (
        <div
          ref={panelRef}
          className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-foreground shadow-xl"
        >
          <label className="block font-mono text-[0.55rem] tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
            {t.callMicDevice}
          </label>
          <select
            value={micId}
            onChange={(event) => {
              setMicId(event.target.value);
              // A live switch: the chosen device takes the sender's place, so the
              // call never breaks for it.
              void messagesStore.callMedia().switchInput("audio", event.target.value);
            }}
            className="mt-1 w-full rounded bg-[var(--surface-2)] px-2 py-1.5 text-sm outline-none"
          >
            {mics.length === 0 ? <option value="">{t.callUnknown}</option> : null}
            {mics.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>

          <div className="mt-3 flex items-center gap-2">
            <Volume2 className="size-4 shrink-0 text-[var(--muted-foreground)]" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              aria-label={t.callInputVolume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                void messagesStore.callMedia().setInputVolume(next);
              }}
              className="min-w-0 flex-1"
            />
            <span className="w-8 shrink-0 text-right font-mono text-[0.6rem] text-[var(--muted-foreground)]">
              {Math.round(volume * 100)}
            </span>
          </div>

          <button
            type="button"
            onClick={startProbe}
            className="mt-3 flex w-full items-center gap-2 rounded bg-[var(--surface-2)] px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--accent)]"
          >
            <span
              className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--card)]"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full bg-[#23a55a] transition-[width]"
                style={{ width: `${Math.round((probe ?? 0) * 100)}%` }}
              />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {probe === null ? t.callTestStart : t.callInputVolume}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A round control on the call bar. The end call is the only red one. */
function CallControl({
  label,
  active = true,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  /** False draws the "switched off" state, which reads as a deeper well. */
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={!danger ? active : undefined}
      className={`grid size-12 max-[400px]:size-11 shrink-0 cursor-pointer place-items-center rounded-full transition-colors ${
        danger
          ? "bg-red-500 text-white hover:bg-red-500/85"
          : active
            ? "bg-surface-2 text-foreground hover:bg-brand/20 hover:text-brand"
            : "bg-foreground/10 text-foreground/70 hover:bg-foreground/20"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The bar along the bottom of a call, in the order the reference apps use:
 * microphone, devices, screen, more, and the red one that ends it.
 *
 * Five controls is all a bar can hold without crowding a phone, so the camera
 * lives in the more menu instead of taking a slot of its own. The row is a
 * centred cluster with a measured gap, the tap targets stay at 44px or more on
 * every device, and the bottom padding respects the home indicator so the red
 * button is never tucked under it.
 */
function CallControlBar({
  t,
  call,
  remoteStreams,
  onMute,
  onScreen,
  onSettings,
  onMore,
  onEnd,
}: {
  t: MessagesCopy;
  call: CallState;
  remoteStreams: Record<string, unknown>;
  onMute: () => void;
  onScreen: () => void;
  onSettings: () => void;
  onMore: () => void;
  onEnd: () => void;
}) {
  const { mic, screen } = call;
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border/60 bg-card/80 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:gap-3 sm:pt-4">
      <CallControl label={mic ? t.callMute : t.callUnmute} active={mic} onClick={onMute}>
        {mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </CallControl>

      <CallControl label={t.callSettings} onClick={onSettings}>
        <Settings className="size-5" />
      </CallControl>

      {/* Sharing sits between the device switch and the overflow, so it is
          reachable without opening a menu on a phone, and it is the last plain
          control before the red one rather than the second control in the row:
          a person reaching for "stop sharing" mid conversation goes looking for
          it beside the other view controls, not beside the microphone. */}
      <CallControl
        label={screen ? t.callStopShare : t.callShareScreen}
        active={screen}
        onClick={onScreen}
      >
        <MonitorUp className="size-5" />
      </CallControl>

      <CallControl label={t.callMore} onClick={onMore}>
        <MoreVertical className="size-5" />
      </CallControl>

      <CallControl label={t.callEnd} danger onClick={onEnd}>
        <PhoneOff className="size-5" />
      </CallControl>

      {/* One element per person, out of sight, so a browser does not drop the
          audio of anybody it cannot see. Without these a call with four people
          is heard as the last person to join. */}
      {Object.entries(remoteStreams).map(([email, stream]) => (
        <RemoteAudio key={email} stream={stream} />
      ))}
    </div>
  );
}

/**
 * Plays what the other side sends. The element carries no controls: the call bar
 * has them, and a browser will not pause an audio element for being off screen.
 *
 * The retry is the point. A phone refuses to play sound nobody asked for, so an
 * element that was filled in before the person pressed Answer stays silent for
 * the whole call, with no error anybody can see. Play is attempted again on the
 * first touch of the screen, by which time the call is something they chose.
 */
function RemoteAudio({ stream }: { stream: unknown }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const blocked = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const source = stream as { srcObject?: unknown } | null;
    if (source && typeof MediaStream !== "undefined" && source instanceof MediaStream) {
      node.srcObject = source;
      void node.play?.().catch(() => undefined);
    }
  }, [stream]);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === "undefined") return;
    const onPlaying = () => {
      blocked.current = false;
    };
    const onBlocked = () => {
      blocked.current = true;
    };
    const retry = () => {
      if (!blocked.current) return;
      void node.play?.().catch(() => undefined);
    };
    node.addEventListener("playing", onPlaying);
    node.addEventListener("error", onBlocked);
    node.addEventListener("pause", onBlocked);
    window.addEventListener("pointerdown", retry);
    return () => {
      node.removeEventListener("playing", onPlaying);
      node.removeEventListener("error", onBlocked);
      node.removeEventListener("pause", onBlocked);
      window.removeEventListener("pointerdown", retry);
    };
  }, []);

  return <audio ref={ref} autoPlay data-call-remote />;
}

/**
 * The voice channel screen.
 *
 * It fills the hub on a phone and becomes an overlay on a desktop, so a call
 * never hides the conversation it belongs to. The two participants wear the same
 * neon frames as the rest of the app, and the two buttons on the right are what
 * a voice channel is for: pulling somebody in, and picking what to play while
 * you talk.
 */
/**
 * The clock a call keeps, counted from the moment the two sides were connected.
 *
 * It starts at `answeredAt` and not at `startedAt`, because the time spent
 * ringing is not time spent talking, and a clock that started when the button was
 * pressed reads high by however long the other person took to pick up. It stops
 * by the same token: a call that has ended, or one never answered, has no clock
 * at all rather than one frozen at zero.
 *
 * Ticking from a second timer rather than from each render, so the whole call
 * screen is not re-rendered sixty times a minute to move one number, and so a
 * backgrounded tab catches up on its own when it comes back rather than
 * counting the seconds it was not looking.
 */
function useCallClock(answeredAt: number, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || answeredAt <= 0) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [answeredAt, running]);
  if (!running || answeredAt <= 0) return "";
  return callDuration(Math.max(0, now - answeredAt));
}

function CallScreen({
  t,
  call,
  remoteStreams,
  localStream,
  friends,
  inCall,
  onInvite,
  onActivity,
  onAccept,
  onDecline,
  onMute,
  onCamera,
  onScreen,
  onSettings,
  onEnd,
}: {
  t: MessagesCopy;
  call: CallState;
  /** One stream per participant, so everybody is heard and not just the last. */
  remoteStreams: Record<string, unknown>;
  localStream: unknown;
  friends: CallCandidate[];
  /** Who is already in this call, so they are not invited twice. */
  inCall: string[];
  onInvite: (email: string) => void;
  onActivity: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onMute: () => void;
  onCamera: () => void;
  onScreen: () => void;
  onSettings: (kind: "mic" | "camera", deviceId: string) => void;
  onEnd: () => void;
}) {
  const [panel, setPanel] = useState<"none" | "invite" | "settings" | "more">("none");
  const isIncoming = call.status === "incoming";
  const isOver = call.status === "ended";
  const connecting = call.status === "outgoing" || call.status === "connecting";

  // The people on the call, this account first, and nobody who has left.
  const participants = call.participants.filter((person) => person.status !== "left");
  const others = participants.filter((person) => !person.isSelf).length;
  const canAddMore = !isIncoming && !isOver;

  const headline = isIncoming
    ? call.starts === "video"
      ? t.callIncomingVideo
      : t.callIncoming
    : isOver
      ? call.reason === "busy"
        ? t.callEndedBusy
        : call.reason === "declined"
          ? t.callEndedDecline
          : call.reason === "failed" || call.reason === "disconnected"
            ? t.callEndedFailed
            : t.callEnded
      : connecting
        ? call.status === "outgoing"
          ? t.callRinging
          : t.callConnecting
        : t.callActive;

  // Only once the two sides are actually together, and still while the call is
  // on screen afterwards so the number it ended on is the number that is read.
  const elapsed = useCallClock(call.answeredAt, !isIncoming && !connecting);

  /**
   * How long this phone has been ringing somebody, counted from the button.
   *
   * A separate number from the call's own clock, on purpose: the two are answers
   * to two different questions, and running them into one figure is how a call
   * gets reported as ten minutes long when it was nine and nobody picked up for
   * the first one. It shows only while the call is unanswered, and is gone the
   * moment it is answered, so the duration clock is the only one left on screen.
   */
  const ringing = useCallClock(call.startedAt, !isIncoming && connecting && call.answeredAt <= 0);

  return (
    <section
      className="absolute inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-xl"
      aria-label={t.callActive}
    >
      {/* The header carries the state of the call and how many are in it. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        <span className="relative">
          <span
            className="absolute inset-0 animate-ping rounded-full bg-brand/30"
            aria-hidden="true"
          />
          <span className="relative size-2.5 rounded-full bg-brand" />
        </span>
        <p className="min-w-0 flex-1 truncate font-display text-sm font-bold">{headline}</p>
        {/* The clock sits beside the state rather than under it, where a person
            looking for how long they have been talking finds it without reading
            anything else. Tabular figures so it does not shuffle sideways once a
            second. */}
        {elapsed ? (
          <time
            dateTime={`PT${elapsed}`}
            aria-label={`${t.callElapsed} ${elapsed}`}
            className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground"
          >
            {elapsed}
          </time>
        ) : null}
        {ringing ? (
          <time
            dateTime={`PT${ringing}`}
            aria-label={`${t.callRingingFor} ${ringing}`}
            className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground"
          >
            {ringing}
          </time>
        ) : null}
        {others > 0 ? (
          <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 font-mono text-[0.55rem] tracking-[0.12em] text-muted-foreground uppercase">
            {t.callPeople.replace("{count}", String(others + 1))}
          </span>
        ) : null}
      </header>

      {participants.length > 0 ? (
        <CallStage
          t={t}
          participants={participants}
          streams={remoteStreams}
          localStream={localStream}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="grid size-16 place-items-center rounded-3xl border border-brand/30 bg-brand/10 text-brand">
            <Users className="size-7" />
          </span>
          <p className="font-display text-lg font-bold">{t.callRinging}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t.callRingingHint}</p>
        </div>
      )}

      {isIncoming ? (
        <div className="flex shrink-0 items-center justify-center gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <CallControl label={t.callDecline} onClick={onDecline}>
            <PhoneOff className="size-5" />
          </CallControl>
          <CallControl label={t.callAccept} onClick={onAccept}>
            <Phone className="size-5" />
          </CallControl>
        </div>
      ) : null}

      {isOver ? (
        <div className="flex shrink-0 justify-center border-t border-border/60 bg-card/60 p-4 backdrop-blur-xl">
          <CallControl label={t.callEnd} onClick={onEnd}>
            <X className="size-5" />
          </CallControl>
        </div>
      ) : (
        <CallControlBar
          t={t}
          call={call}
          remoteStreams={remoteStreams}
          onMute={onMute}
          onScreen={onScreen}
          onSettings={() => setPanel((current) => (current === "settings" ? "none" : "settings"))}
          onMore={() => setPanel((current) => (current === "more" ? "none" : "more"))}
          onEnd={onEnd}
        />
      )}

      {isOver ? null : (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 bg-card/60 p-3 backdrop-blur-xl sm:flex-row">
          <button
            type="button"
            onClick={() => setPanel((current) => (current === "invite" ? "none" : "invite"))}
            disabled={!canAddMore}
            className="flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-left transition-colors hover:bg-brand/20 disabled:cursor-default disabled:opacity-50"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/20 text-brand">
              <UserPlus className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold">{t.callInviteMore}</span>
              <span className="block truncate text-[0.6rem] font-normal text-muted-foreground">
                {t.callInviteHint}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onActivity}
            className="flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-surface/40 px-4 py-3 text-left transition-colors hover:bg-surface-2"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
              <Video className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold">{t.callActivity}</span>
              <span className="block truncate text-[0.6rem] font-normal text-muted-foreground">
                {t.callActivityHint}
              </span>
            </span>
          </button>
        </div>
      )}

      {panel === "invite" ? (
        <InviteList
          t={t}
          friends={friends}
          inCall={inCall}
          onInvite={onInvite}
          onClose={() => setPanel("none")}
        />
      ) : null}

      {panel === "settings" ? (
        <VoiceSettingsPanel
          t={t}
          call={call}
          onPick={onSettings}
          onClose={() => setPanel("none")}
        />
      ) : null}

      {panel === "more" ? (
        <MoreList
          t={t}
          call={call}
          onToggleScreen={onScreen}
          onToggleCamera={onCamera}
          onClose={() => setPanel("none")}
        />
      ) : null}
    </section>
  );
}

/** The friends who can be pulled into the call. */
/**
 * The people who can be pulled into the call.
 *
 * The list is everybody the account knows, friends and contacts alike, and the
 * ones already in the call are shown rather than hidden: a person who is dialled
 * and has not answered yet is still somebody you asked, and taking them off the
 * list is how a list starts to look broken.
 *
 * An empty list means there is genuinely nobody: no friends and no contacts, which
 * is a real state. A list of everybody already in the call is a different state
 * and says so, because "you have no friends" would be a lie in it.
 */
function InviteList({
  t,
  friends,
  inCall,
  onInvite,
  onClose,
}: {
  t: MessagesCopy;
  friends: CallCandidate[];
  /** Who is already in the call, so nobody is invited into it twice. */
  inCall: string[];
  onInvite: (email: string) => void;
  onClose: () => void;
}) {
  const waiting = inCall.filter((email) =>
    friends.some((person) => normalizeEmail(person.email) === normalizeEmail(email)),
  );

  return (
    <div className="scrollbar-thin max-h-56 shrink-0 overflow-y-auto border-t border-border/60 bg-background/80 p-3">
      <PanelHead t={t} title={t.callInviteTitle} onClose={onClose} />

      {friends.length > 0 ? (
        <p className="label-mono px-1 pb-1.5 text-[0.5rem] text-muted-foreground">
          {t.callInviteCount.replace("{count}", String(friends.length))}
        </p>
      ) : null}

      {friends.length === 0 ? (
        <div className="grid gap-1 py-2 text-center">
          <p className="text-[0.7rem] font-bold">{t.callInviteEmpty}</p>
          <p className="text-[0.6rem] text-muted-foreground">{t.callInviteEmptyHint}</p>
        </div>
      ) : (
        <ul className="grid gap-1">
          {friends.map((person) => {
            const already = inCall.some(
              (email) => normalizeEmail(email) === normalizeEmail(person.email),
            );
            // Somebody this account can see but has no address for. They are
            // listed, because a panel that says there is nobody while the chat
            // list is full is a panel that looks broken; they cannot be rung, and
            // the button says why rather than doing nothing when pressed.
            const unreachable = !person.reachable;
            const key = person.email || `name:${person.name}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={already || unreachable}
                  onClick={() => {
                    onInvite(person.email);
                    onClose();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:opacity-45"
                >
                  <ContactAvatar
                    contact={{
                      id: key,
                      peerEmail: person.email,
                      name: person.name,
                      initials: initialsForName(person.name),
                      about: "",
                      accent: "#1DB954",
                      avatar: person.avatar,
                      online: false,
                      lastSeenAt: 0,
                      lastSeenLabel: "",
                      linked: true,
                      status: "online",
                    }}
                    t={t}
                    showPresence={false}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{person.name}</span>
                    <span className="block truncate text-[0.55rem] font-normal text-muted-foreground">
                      {unreachable ? t.callInviteNoAddress : person.email}
                    </span>
                  </span>
                  {already ? (
                    <span className="shrink-0 font-mono text-[0.5rem] tracking-[0.12em] text-brand uppercase">
                      <Check className="mr-1 inline size-3" />
                      {t.callInviteWaiting}
                    </span>
                  ) : unreachable ? null : (
                    <UserPlus className="size-3.5 shrink-0 text-brand" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {waiting.length > 0 ? (
        <p className="px-1 pt-2 text-[0.6rem] text-muted-foreground">{t.callInviteWaitingHint}</p>
      ) : null}
    </div>
  );
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function PanelHead({ t, title, onClose }: { t: MessagesCopy; title: string; onClose: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <p className="label-mono flex-1 text-[0.55rem]">{title}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t.messageEditCancel}
        className="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-surface-2"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * How a call reads, as one line of words.
 *
 * The record says what happened; this says what that means from the chair the
 * reader is sitting in. A call nobody picked up is a missed call for both of
 * them, and one that was given up on is a cancellation for one and a miss for
 * the other, which is why the record keeps addresses rather than flags.
 */
function callLogText(summary: CallSummary, t: MessagesCopy) {
  switch (summary.kind) {
    case "completed":
      return t.callLogCompleted;
    case "cancelled":
      return t.callLogCancelled;
    case "busy":
      return t.callLogBusy;
    case "failed":
      return t.callLogFailed;
    default:
      return t.callLogMissed;
  }
}

/**
 * A call, in the thread.
 *
 * Two shapes. A finished call is a quiet line with the time it lasted, and a
 * call that never got off the ground keeps a red mark so a missed call can be
 * found later by looking at the day. The call in progress is the third thing: it
 * carries the buttons, because a ringing phone is the one moment the answer
 * belongs right there in the conversation.
 */
function CallEntry({
  t,
  entry,
  peerName,
  onAnswer,
  onDecline,
  onHangup,
  onCancel,
  onOpenCall,
}: {
  t: MessagesCopy;
  entry: TimelineCall;
  peerName: string;
  onAnswer: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onCancel: () => void;
  onOpenCall: (starts: "audio" | "video") => void;
}) {
  const live = entry.live;
  const ringing = live?.status === "incoming";
  const up = live?.status === "active" || live?.status === "connecting";
  const dialling = live?.status === "outgoing";
  const summary = entry.summary;

  /**
   * What the thread says about a call that has not finished.
   *
   * A call in progress says who it is on, because "Outgoing call" on its own
   * leaves a person reading a conversation unable to tell whether this is about
   * the person they are looking at. When the call has been moved to somebody
   * else it also says the first name did not answer, so the line explains itself
   * instead of changing its subject without saying why.
   */
  const liveLine = (): string => {
    // The names go in as text, so a name carrying a brace cannot rewrite the
    // sentence around it. `replace` with a function replacement, not a string.
    const say = (template: string, values: Record<string, string>) =>
      template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
    if (!live) return "";
    if (dialling) {
      return live.previousPeerName
        ? say(t.callLogRingingMoved, { was: live.previousPeerName, name: live.peerName })
        : say(t.callLogRingingTo, { name: live.peerName });
    }
    if (ringing) return say(t.callLogIncomingFrom, { name: peerName });
    return t.callLogActive;
  };

  // While the phone is ringing there is nothing to report yet, so the line says
  // what is happening instead of guessing how it will end.
  const headline = ringing
    ? peerName
    : live
      ? liveLine()
      : callLogText(
          summary ?? {
            kind: "missed",
            direction: "outgoing",
            starts: "audio",
            durationMs: 0,
            missed: true,
            endedByMe: false,
          },
          t,
        );

  const missed = Boolean(summary?.missed) && !live;
  const missedIncoming = missed && summary?.direction === "incoming";
  const video = (summary?.starts ?? live?.starts) === "video";
  const clock = formatClock(entry.at);
  const who = summary?.direction === "outgoing" ? t.callLogOutgoing : t.callLogIncoming;

  return (
    <div className="flex justify-center py-1.5">
      <div
        className={`w-full max-w-[19rem] rounded-2xl border px-3 py-2.5 ${
          ringing
            ? "border-brand/50 bg-brand/10"
            : missed
              ? missedIncoming
                ? "border-red-500/40 bg-red-500/5"
                : "border-red-500/25 bg-surface/60"
              : "border-border/70 bg-surface/40"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-full ${
              missedIncoming
                ? "bg-red-500/20 text-red-300"
                : ringing
                  ? "animate-pulse bg-brand/20 text-brand"
                  : "bg-brand/10 text-brand"
            }`}
            aria-hidden="true"
          >
            {video ? <Video className="size-4" /> : <Phone className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[0.7rem] font-bold">
              {headline}
              {missedIncoming ? <PhoneOff className="size-3 shrink-0 text-red-400" /> : null}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.6rem] text-muted-foreground">
              <span>{live ? (ringing ? who : t.callLogActive) : callLogText(summary!, t)}</span>
              {!live && summary && summary.durationMs > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{callDuration(summary.durationMs)}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{clock}</span>
            </p>
          </div>
        </div>

        {/* The buttons only exist while there is something to press. */}
        {live ? (
          <div className="mt-2.5 flex gap-2">
            {ringing ? (
              <>
                <button
                  type="button"
                  onClick={onAnswer}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[0.65rem] font-bold text-primary-foreground transition-colors hover:bg-brand/90"
                >
                  <Phone className="size-3.5" />
                  {t.callLogAnswer}
                </button>
                <button
                  type="button"
                  onClick={onDecline}
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-2 text-[0.65rem] font-bold text-red-300 transition-colors hover:bg-red-500/10"
                >
                  <PhoneOff className="size-3.5" />
                  {t.callLogDecline}
                </button>
              </>
            ) : up ? (
              <button
                type="button"
                onClick={onHangup}
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-red-500/90 px-3 py-2 text-[0.65rem] font-bold text-white transition-colors hover:bg-red-500"
              >
                <PhoneOff className="size-3.5" />
                {t.callLogHangup}
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancel}
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-[0.65rem] font-bold text-muted-foreground transition-colors hover:bg-surface-2"
              >
                <PhoneOff className="size-3.5" />
                {t.callLogCancel}
              </button>
            )}
          </div>
        ) : (
          // A call that is over can be placed again from where it is written.
          <button
            type="button"
            onClick={() => onOpenCall(video ? "video" : "audio")}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-1.5 text-[0.6rem] font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-brand"
          >
            <Phone className="size-3" />
            {t.callAudio}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A call that is ringing, wherever the user happens to be in the hub.
 *
 * The thread carries the answer too, but the thread is only in front of them if
 * they are reading that conversation. This is the one that cannot be missed.
 */
function IncomingCallBar({
  t,
  call,
  onAnswer,
  onDecline,
}: {
  t: MessagesCopy;
  call: CallState;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-brand/30 bg-brand/10 px-4 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground">
        {call.starts === "video" ? <Video className="size-4" /> : <Phone className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="label-mono text-[0.55rem] text-brand">{t.callLogInIncomingTitle}</p>
        <p className="truncate text-xs font-bold">{call.peerName || call.peerEmail}</p>
      </div>
      <button
        type="button"
        onClick={onDecline}
        aria-label={t.callLogDecline}
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-red-500/90 text-white transition-colors hover:bg-red-500"
      >
        <PhoneOff className="size-4" />
      </button>
      <button
        type="button"
        onClick={onAnswer}
        aria-label={t.callLogAnswer}
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-brand text-primary-foreground transition-colors hover:bg-brand/90"
      >
        <Phone className="size-4" />
      </button>
    </div>
  );
}

/**
 * The conversation's own menu.
 *
 * The export lives here rather than buried in a profile: a conversation belongs
 * to the two in it, and taking a copy of it should be one tap from the thread.
 * Both files are built on the device and saved straight to it, so an export
 * never travels anywhere.
 */
function ChatSettingsMenu({
  t,
  chat,
  contact,
  profile,
  chats,
  contacts,
  lang,
  themeId,
  onOpenThemes,
  onFlash,
}: {
  t: MessagesCopy;
  chat: MessageChat;
  contact: ChatContact;
  profile: MessagesProfile;
  chats: MessageChat[];
  contacts: ChatContact[];
  lang: Lang;
  /** Which theme the chat is in, so the row can show it rather than just naming it. */
  themeId: string;
  onOpenThemes: () => void;
  onFlash: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"" | "text" | "json" | "all">("");
  const peer = contact?.name?.trim() || chat.peerEmail || "chat";
  const shown = visibleMessages(chat).length;

  const save = (kind: "text" | "json" | "all") => {
    setPending(kind);
    try {
      if (kind === "text") {
        downloadText(
          exportFileName(peer, "txt"),
          exportChatAsText(chat, contact, profile, lang),
          "text/plain",
        );
      } else if (kind === "json") {
        downloadText(
          exportFileName(peer, "json"),
          JSON.stringify(exportChatAsJson(chat, contact, profile), null, 2),
          "application/json",
        );
      } else {
        downloadText(
          exportFileName(t.exportAllFile, "json"),
          JSON.stringify(exportAllAsJson(chats, contacts, profile), null, 2),
          "application/json",
        );
      }
      onFlash(t.exportDone);
    } finally {
      setPending("");
      setOpen(false);
    }
  };

  const item =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-normal transition-colors hover:bg-surface disabled:cursor-default disabled:opacity-50";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t.chatSettings}
          title={t.chatSettings}
          className="grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-brand sm:grid"
        >
          <Info className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="w-[min(17rem,calc(100vw-1.5rem))] border-border/70 bg-popover/95 p-1.5 backdrop-blur-xl"
      >
        {" "}
        <p className="label-mono px-3 pt-1.5 pb-1 text-[0.55rem] text-muted-foreground">
          {t.chatSettings}
        </p>
        <button type="button" onClick={onOpenThemes} className={item}>
          <Palette className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{t.chatThemes}</span>
            <span className="block truncate text-[0.6rem] text-muted-foreground">
              {t.chatThemesHint}
            </span>
          </span>
          {/* The theme itself rather than a chevron: the row says what picking
              one would do, which a chevron only says that there is more. */}
          <span
            className="grid size-6 shrink-0 place-items-center rounded-md border border-white/10"
            style={{
              backgroundImage: chatThemeGradient(chatThemeById(themeId), 145),
              color: chatThemeById(themeId).brand,
            }}
          >
            <ChatThemeMark className="size-4" />
          </span>
        </button>
        <div className="my-1 h-px bg-border/60" />
        <button
          type="button"
          disabled={pending !== "" || shown === 0}
          onClick={() => save("text")}
          className={item}
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{t.exportText}</span>
            <span className="block truncate text-[0.6rem] text-muted-foreground">
              {t.exportTextHint.replace("{count}", String(shown))}
            </span>
          </span>
          {pending === "text" ? <Loader2 className="size-3.5 animate-spin" /> : null}
        </button>
        <button
          type="button"
          disabled={pending !== "" || shown === 0}
          onClick={() => save("json")}
          className={item}
        >
          <Braces className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{t.exportJson}</span>
            <span className="block truncate text-[0.6rem] text-muted-foreground">
              {t.exportJsonHint}
            </span>
          </span>
          {pending === "json" ? <Loader2 className="size-3.5 animate-spin" /> : null}
        </button>
        <div className="my-1 h-px bg-border/60" />
        <button
          type="button"
          disabled={pending !== "" || chats.length === 0}
          onClick={() => save("all")}
          className={item}
        >
          <Download className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{t.exportAll}</span>
            <span className="block truncate text-[0.6rem] text-muted-foreground">
              {t.exportAllHint.replace("{count}", String(chats.length))}
            </span>
          </span>
          {pending === "all" ? <Loader2 className="size-3.5 animate-spin" /> : null}
        </button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The mark a theme swatch wears.
 *
 * A gradient on its own says which colours a theme is made of; a mark says what
 * the theme is *for*, and it is what makes a row of swatches read as twenty-two
 * choices rather than twenty-two rectangles. It is drawn in the theme's own accent
 * rather than in white, because white is unreadable on the pale half of the list.
 *
 * Built from two shapes rather than one path on purpose: a rounded rectangle and a
 * tail are both exact, and the seam where they meet cannot be got wrong. This is
 * also the one place a different glyph would go — swap this component and every
 * swatch follows.
 */
function ChatThemeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <rect x="2.75" y="4" width="18.5" height="13.25" rx="4.6" fill="currentColor" />
      {/* The tail starts inside the bubble and ends on its edge, so the join is
          covered rather than merely touching. */}
      <path d="M7.9 14.4v7.4l6.7-4.85z" fill="currentColor" />
    </svg>
  );
}

/**
 * The chat's themes.
 *
 * A grid of gradients rather than a colour wheel, because a theme here is a pair
 * of stops and the only way to judge one is to see both ends of it side by side.
 * The swatch is the theme; nothing below it is a second thing to configure.
 *
 * Each swatch carries its own accent in the mark and in the ring around it, so the
 * grid can be read twice over: as the gradient a person is choosing, and as the
 * colour the chat will be if they choose it. The pale ones are the reason that
 * matters — they are the swatches whose gradient could not carry a mark and whose
 * accent is a much darker version of the same hue.
 *
 * The picker applies as it goes rather than on a Save, which is what makes it
 * worth having at all: the only honest way to choose a colour for an interface is
 * to look at the interface while you do it.
 */
function ChatThemesDialog({
  t,
  open,
  onOpenChange,
  themeId,
  onSelect,
}: {
  t: MessagesCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themeId: string;
  onSelect: (id: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const swatch =
    "group relative aspect-square min-w-0 cursor-pointer rounded-xl border border-white/10 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card hover:scale-[1.06]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto border-border/70 bg-card p-5 sm:max-w-2xl sm:p-6">
        <div>
          <DialogTitle className="font-display text-lg font-bold">{t.chatThemes}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">
            {t.chatThemesHint}
          </DialogDescription>
        </div>

        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
          {CHAT_THEMES.map((theme) => {
            const selected = theme.id === themeId;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onSelect(theme.id)}
                aria-pressed={selected}
                aria-label={theme.id}
                title={theme.id}
                className={`${swatch} ${selected ? "ring-2 ring-offset-2 ring-offset-card" : ""}`}
                style={{
                  backgroundImage: chatThemeGradient(theme),
                  color: theme.brand,
                  // The ring is the accent rather than a fixed colour, so the mark
                  // on a selected swatch is the thing that will actually be on the
                  // buttons underneath.
                  ...(selected
                    ? ({ "--tw-ring-color": theme.brand } as Record<string, string>)
                    : {}),
                }}
              >
                <ChatThemeMark className="mx-auto size-[58%]" />
                {selected ? (
                  /**
                   * The corner badge rather than a tick over the mark: a tick on top
                   * of the mark hides the one thing the swatch is there to show.
                   */
                  <span
                    className="absolute -right-1 -top-1 grid size-4.5 place-items-center rounded-full ring-2 ring-card"
                    style={{ backgroundColor: theme.brand, color: CHAT_THEME_INK }}
                  >
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <p className="min-w-0 truncate text-[0.65rem] text-muted-foreground">
            {chatThemeById(themeId).id === DEFAULT_CHAT_THEME_ID
              ? t.chatThemeDefault
              : chatThemeById(themeId).id}
          </p>
          <button
            type="button"
            onClick={() => onSelect(DEFAULT_CHAT_THEME_ID)}
            disabled={themeId === DEFAULT_CHAT_THEME_ID}
            className="shrink-0 cursor-pointer rounded-xl border border-border/70 px-3 py-2 text-xs font-normal transition-colors hover:bg-surface disabled:cursor-default disabled:opacity-50"
          >
            {t.chatThemeReset}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The voice settings panel: which microphone and camera, how loud the input
 * goes out, and a way to hear yourself before the call.
 *
 * The level meter is animated straight on a node rather than through state: it
 * moves sixty times a second, and re-rendering the call screen that often would
 * cost more than the measurement is worth.
 */
function VoiceSettingsPanel({
  t,
  call,
  onPick,
  onClose,
}: {
  t: MessagesCopy;
  call: CallState;
  onPick: (kind: "mic" | "camera", deviceId: string) => void;
  onClose: () => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfoLike[]>([]);
  const [chosen, setChosen] = useState<{ mic: string; camera: string }>({ mic: "", camera: "" });
  const [volume, setVolume] = useState(1);
  const [recording, setRecording] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const meterRef = useRef<HTMLSpanElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingRef = useRef<{ stop: () => Promise<Blob | null> } | null>(null);

  const media = messagesStore.callMedia();

  useEffect(() => {
    // The labels only exist once the permission prompt has been answered, which
    // the call itself has already asked for by the time settings are opened.
    void media
      .devices()
      .then((list) => {
        setDevices(list);
        setChosen((current) => ({
          mic: current.mic || list.find((d) => d.kind === "audioinput")?.deviceId || "",
          camera: current.camera || list.find((d) => d.kind === "videoinput")?.deviceId || "",
        }));
      })
      .catch(() => setFailed(true));
  }, [media]);

  // The meter only runs while the panel is open, so a closed panel costs nothing.
  useEffect(() => {
    const bar = meterRef.current;
    if (!bar) return;
    let alive = true;
    void media
      .startMeter((level) => {
        if (!alive) return;
        // Written straight to the node: no state, so no re-render per frame.
        bar.style.width = `${Math.round(Math.min(1, level) * 100)}%`;
        bar.dataset["level"] = level > 0.02 ? "hot" : "quiet";
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      media.stopMeter();
    };
  }, [media]);

  // While there is a call, the slider drives the volume of the call.
  useEffect(() => {
    if (call.status === "idle" || call.status === "ended") return;
    void media.setInputVolume(volume);
  }, [call.status, media, volume]);

  const pick = (kind: "mic" | "camera", deviceId: string) => {
    setChosen((current) => ({ ...current, [kind]: deviceId }));
    onPick(kind, deviceId);
  };

  const options = (kind: string) => devices.filter((device) => device.kind === kind);

  const toggleTest = async () => {
    if (recording) {
      const handle = recordingRef.current;
      recordingRef.current = null;
      setRecording(false);
      const blob = await handle?.stop();
      if (!blob) {
        setFailed(true);
        return;
      }
      setTestUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      // Heard as soon as it is ready, so the user need not press play.
      requestAnimationFrame(() => void audioRef.current?.play?.().catch(() => undefined));
      return;
    }
    try {
      const handle = await media.recordTest();
      if (!handle) {
        setFailed(true);
        return;
      }
      recordingRef.current = handle;
      setRecording(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="shrink-0 border-t border-border/60 bg-background/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <PanelHead t={t} title={t.callSettings} onClose={onClose} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[0.6rem] text-muted-foreground">{t.callMicDevice}</span>
          <select
            value={chosen.mic}
            onChange={(event) => pick("mic", event.target.value)}
            className="w-full rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs outline-none focus:border-brand/60"
          >
            {options("audioinput").map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || device.deviceId}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.6rem] text-muted-foreground">{t.callCameraDevice}</span>
          <select
            value={chosen.camera}
            disabled={call.starts !== "video"}
            onChange={(event) => pick("camera", event.target.value)}
            className="w-full rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs outline-none focus:border-brand/60 disabled:opacity-50"
          >
            {options("videoinput").map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || device.deviceId}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Input volume: the gain the call carries, 0 to 200%. */}
      <div className="mt-3 flex items-center gap-3">
        <span className="shrink-0 text-[0.6rem] text-muted-foreground">{t.callInputVolume}</span>
        <input
          type="range"
          min={0}
          max={200}
          step={5}
          value={Math.round(volume * 100)}
          disabled={!media.canSetInputVolume}
          aria-label={t.callInputVolume}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-2 accent-brand disabled:cursor-default disabled:opacity-50"
        />
        <span className="w-10 shrink-0 text-right font-mono text-[0.6rem] tabular-nums">
          {Math.round(volume * 100)}%
        </span>
      </div>

      {/* The test: a live level, and a recording to play back. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void toggleTest()}
          aria-pressed={recording}
          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
            recording
              ? "border-red-500/50 bg-red-500/10 text-red-300"
              : "border-border/70 bg-surface/40 hover:bg-surface-2"
          }`}
        >
          {recording ? (
            <span className="size-2 animate-pulse rounded-full bg-red-500" />
          ) : (
            <Mic className="size-3.5" />
          )}
          {recording ? t.callTestStop : t.callTestStart}
        </button>

        <span className="relative h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-surface-2">
          <span
            ref={meterRef}
            data-level="quiet"
            className="absolute inset-y-0 left-0 w-0 rounded-full bg-brand transition-[width] duration-75 data-[level=hot]:bg-brand-bright"
          />
        </span>

        {testUrl ? (
          <>
            <button
              type="button"
              onClick={() => void audioRef.current?.play?.()}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border/70 bg-surface/40 px-3 py-2 text-xs transition-colors hover:bg-surface-2"
            >
              <Play className="size-3.5" />
              {t.callTestPlay}
            </button>
            <audio ref={audioRef} src={testUrl} className="hidden" />
          </>
        ) : null}
      </div>

      <p className="mt-2 text-[0.6rem] text-muted-foreground">
        {failed ? t.callUnsupported : t.callInputVolumeHint}
      </p>
    </div>
  );
}

/**
 * The overflow. The camera lives here rather than on the bar, which is what
 * keeps the bar to the five controls a phone can carry; the screen only shows up
 * while it is being shared, so the item is the way out of it.
 */
function MoreList({
  t,
  call,
  onToggleScreen,
  onToggleCamera,
  onClose,
}: {
  t: MessagesCopy;
  call: CallState;
  onToggleScreen: () => void;
  onToggleCamera: () => void;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-border/60 bg-background/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <PanelHead t={t} title={t.callMore} onClose={onClose} />
      <div className="flex flex-wrap gap-2">
        {call.starts === "video" ? (
          <button
            type="button"
            onClick={onToggleCamera}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-2.5 text-xs transition-colors hover:bg-surface-2"
          >
            {call.camera ? <Video className="size-3.5" /> : <VideoOff className="size-3.5" />}
            {call.camera ? t.callCameraOff : t.callCameraOn}
          </button>
        ) : null}
        {call.screen ? (
          <button
            type="button"
            onClick={onToggleScreen}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2.5 text-xs text-brand transition-colors hover:bg-brand/20"
          >
            <MonitorUp className="size-3.5" />
            {t.callStopShare}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The emoji the grid offers.
 *
 * Eight, chosen for the eight reactions that are actually pressed rather than the
 * eight that sort first: a face, a heart, something laughing, something celebrated,
 * something surprised, something sad, thanks, and fire. A grid of thirty is a grid
 * nobody chooses out of — they scroll past it and close the menu.
 */
const REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "🔥"];

/**
 * The handler of a row the product has not built yet.
 *
 * Named rather than inlined so the menu can tell a dead row from a live one by
 * comparing it: a row is disabled because it carries this and nothing else, which is
 * one thing to check rather than a flag threaded through every row.
 */
const NOOP = () => {};

/**
 * The three dots on a message: the rows of the reference menu, in its order.
 *
 * Edit and delete belong to the author only, which is also what the object
 * enforces, so the menu simply hides them on somebody else's message. Reacting does
 * not: it is the one thing either side may do to a message they did not send, which
 * is the whole point of a conversation.
 *
 * The trigger sits at the outer edge of the row and is revealed on hover, but stays
 * visible on a touch screen where there is no hover to reveal it.
 *
 * A right click opens the same menu, at the pointer rather than at the trigger. That
 * is the gesture every chat people already use has, and a menu that can only be
 * reached by finding a hidden button is a menu most people never find — while the
 * browser's own menu, which a right click brings up instead, is the one thing about
 * a message that is of no use to anybody.
 *
 * The menu is drawn in a portal at a fixed position of its own, measured from
 * whichever of the two opened it. That is what makes it behave the same at any scroll
 * position: it is not a child of the scrolling thread, so scrolling the conversation
 * can neither clip it nor drag it under the composer, and it is clamped into the gap
 * between the thread and the composer so every option is always on screen.
 */
function MessageMenu({
  t,
  align,
  canManage,
  onShare,
  onEdit,
  onDelete,
  onReact,
  anchorRef,
  insetRef,
  openAtRef,
}: {
  t: MessagesCopy;
  /** Which corner of the row the trigger sits in, so the menu grows inwards. */
  align: "start" | "end";
  canManage: boolean;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Adds or takes off one emoji on this message. */
  onReact: (emoji: string) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  /** The composer, so the menu never lands on top of the text field. */
  insetRef: React.RefObject<HTMLElement | null>;
  /**
   * How the row asks for this menu to open at a point.
   *
   * A ref rather than a prop because the row and the menu are separate components
   * and lifting the open state would put the positioning — which has to survive the
   * row being re-rendered by anything — into the row as well.
   */
  openAtRef: React.RefObject<((point: { x: number; y: number }) => void) | null>;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  /**
   * Where a right click put it, when it was one.
   *
   * Null for the button, and it is what tells the two apart: a right click has no
   * trigger to measure from, so the pointer is the anchor.
   */
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  /** The emoji grid, in place of the list. */
  const [picking, setPicking] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const liveRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    openAtRef.current = (where) => {
      setPoint(where);
      setPicking(false);
      setOpen(true);
    };
    return () => {
      openAtRef.current = null;
    };
  }, [openAtRef]);

  /**
   * The rows, in the order and grouping of the reference layout.
   *
   * Written as rows and gaps rather than as a flat list of buttons, because the gaps
   * are part of it: one undifferentiated column of thirteen rows tells a reader
   * nothing about why unpinning a message sits three rows away from editing it.
   *
   * The rows that do nothing are drawn and disabled rather than left out. They are on
   * the list because they are on the reference — a menu that quietly omits half of
   * what every other chat's menu has is one people keep hunting for the missing half
   * of — and a greyed row answers the question the moment it is pressed rather than
   * leaving it open. `sub` is the chevron on the right, which is what says a row opens
   * something else rather than doing anything itself.
   */
  const rows: Array<
    | { kind: "row"; id: string; label: string; Icon: typeof Pencil; run: () => void; sub?: true }
    | { kind: "gap" }
  > = [
    {
      kind: "row",
      id: "react",
      label: t.messageReact,
      Icon: SmilePlus,
      sub: true,
      run: () => setPicking(true),
    },
    { kind: "row", id: "reply", label: t.messageReply, Icon: CornerUpLeft, run: NOOP },
    { kind: "row", id: "forward", label: t.messageForward, Icon: Forward, run: NOOP },
    { kind: "row", id: "share", label: t.messageShare, Icon: Share2, run: onShare },
    { kind: "row", id: "thread", label: t.messageThread, Icon: MessageSquarePlus, run: NOOP },
    { kind: "gap" },
    { kind: "row", id: "unpin", label: t.messageUnpin, Icon: Pin, run: NOOP },
    { kind: "row", id: "apps", label: t.messageApps, Icon: Puzzle, sub: true, run: NOOP },
    { kind: "row", id: "unread", label: t.messageUnread, Icon: EyeOff, run: NOOP },
    { kind: "row", id: "link", label: t.messageCopyLink, Icon: Link2Icon, run: NOOP },
    { kind: "gap" },
    ...(canManage
      ? [
          {
            kind: "row" as const,
            id: "edit",
            label: t.messageEdit,
            Icon: Pencil,
            run: onEdit,
          },
          {
            kind: "row" as const,
            id: "delete",
            label: t.messageDelete,
            Icon: Trash2,
            run: onDelete,
          },
        ]
      : []),
  ];

  /** Only the rows that can be pressed, for the arrow keys to walk over. */
  const live = rows.filter(
    (row): row is Extract<(typeof rows)[number], { kind: "row" }> =>
      row.kind === "row" && row.run !== NOOP,
  );

  const close = useCallback(() => {
    setOpen(false);
    setPicking(false);
    setPoint(null);
  }, []);

  useEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }

    const placeMenu = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!menu) return;
      const gutter = 8;
      const gap = 6;
      const clamp = (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), Math.max(min, max));

      /**
       * What the menu is placed against: the trigger's own rect, or a point the size
       * of nothing where a right click happened.
       *
       * Both shaped like a rect so the arithmetic below does not have to know which
       * of the two it is holding — the one thing that has to differ is which edge it
       * hangs from.
       */
      const box2 = anchor?.getBoundingClientRect();
      const origin = point
        ? { left: point.x, right: point.x, top: point.y, bottom: point.y }
        : box2;
      const box = menu.getBoundingClientRect();

      // The menu would rather sit over the thread than over the field the user
      // is about to type into, but never at the cost of being cut in half: if
      // the gap above the composer is too small, the whole screen is the band.
      const viewport = { top: gutter, bottom: window.innerHeight - gutter };
      const composerTop = insetRef.current?.getBoundingClientRect().top ?? viewport.bottom + gutter;
      const aboveComposer = {
        top: viewport.top,
        bottom: Math.max(viewport.top + 1, Math.min(viewport.bottom, composerTop - gutter)),
      };
      const band =
        aboveComposer.bottom - aboveComposer.top >= box.height ? aboveComposer : viewport;

      // Open upwards when there is room above, downwards when there is not, and
      // slide into the band either way. From a pointer the menu opens downwards,
      // which is where the hand already is, and only flips when the pointer is so
      // low that downwards would run off the screen.
      const roomAbove = origin ? origin.top - gap - box.height >= band.top : false;
      const roomBelow = origin ? origin.bottom + gap + box.height <= band.bottom : false;
      const preferredTop = !origin
        ? band.top
        : roomAbove && !point
          ? origin.top - gap - box.height
          : roomBelow
            ? origin.bottom + gap
            : origin.top - gap - box.height;

      // `align` is the corner the trigger sits in, so the menu grows inwards and a
      // right hand message keeps its menu on the right. From a pointer it hangs the
      // same way, so a right click on the right hand side does not throw the menu
      // across the thread.
      const preferredLeft = !origin
        ? gutter
        : align === "end"
          ? origin.right - box.width
          : origin.left;

      setPlace({
        left: Math.round(clamp(preferredLeft, gutter, window.innerWidth - gutter - box.width)),
        top: Math.round(clamp(preferredTop, band.top, band.bottom - box.height)),
      });
    };

    // Measure first, then place: the menu is rendered at the origin for one
    // frame so its size is known before it is positioned.
    placeMenu();
    const frame = requestAnimationFrame(placeMenu);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        anchorRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      // Over the live rows only: walking onto a greyed one would move the focus
      // somewhere pressing a key does nothing, which reads as the menu being stuck.
      if (live.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const from = liveRefs.current.findIndex((item) => item === document.activeElement);
      const next = (from + step + live.length) % live.length;
      liveRefs.current[next]?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    // A rotation or a resized window moves the trigger, so the menu follows it.
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [align, anchorRef, close, insetRef, live.length, open, point, picking]);

  useEffect(() => {
    if (open) liveRefs.current[0]?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={t.messageMenu}
        title={t.messageMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground/70 opacity-70 transition-all hover:bg-surface-2 hover:text-foreground focus-visible:opacity-100 sm:size-7 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <MoreHorizontal className="size-4" />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={t.messageMenu}
              style={{
                position: "fixed",
                zIndex: 60,
                left: place?.left ?? 0,
                top: place?.top ?? 0,
                // Hidden for the measuring frame only, so the menu never appears
                // in the corner before it knows where it belongs.
                visibility: place ? "visible" : "hidden",
              }}
              className="w-[min(16rem,calc(100vw-1rem))] rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl"
            >
              {/**
               * The emoji grid, in place of the list.
               *
               * In the same panel rather than beside it, so a reaction is one click
               * from the menu instead of two, and so the panel cannot end up half on
               * screen. Eight is what a hand covers comfortably on a phone, which is
               * where reactions are pressed most.
               */}
              {picking ? (
                <div
                  role="menu"
                  aria-label={t.messageReactPick}
                  className="grid grid-cols-4 justify-items-center gap-1 p-1.5"
                >
                  {REACTION_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitem"
                      aria-label={emoji}
                      onClick={() => {
                        close();
                        onReact(emoji);
                      }}
                      className="grid size-9 cursor-pointer place-items-center rounded-lg text-xl leading-none transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                rows.map((row, index) => {
                  if (row.kind === "gap") {
                    return (
                      <div
                        key={`gap-${index}`}
                        role="separator"
                        className="mx-2 my-1 h-px bg-border/60"
                      />
                    );
                  }
                  const dead = row.run === NOOP;
                  const seat = dead ? -1 : live.indexOf(row);
                  return (
                    <button
                      key={row.id}
                      ref={
                        seat < 0
                          ? undefined
                          : (node) => {
                              liveRefs.current[seat] = node;
                            }
                      }
                      type="button"
                      role="menuitem"
                      disabled={dead}
                      // Why it cannot be pressed, for the reader who asks: the row is
                      // there precisely because it is wanted, so it should not be a
                      // mystery that pressing it does nothing.
                      title={dead ? t.messageNotYet : undefined}
                      aria-disabled={dead || undefined}
                      onClick={() => {
                        if (row.id === "react") {
                          // The only row that does not close: it swaps itself for the
                          // grid, and a menu that vanished under the pointer is a menu
                          // that has to be found again.
                          setPicking(true);
                          return;
                        }
                        close();
                        row.run();
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-normal transition-colors focus-visible:outline-none ${
                        dead
                          ? "cursor-default text-muted-foreground/40"
                          : row.id === "delete"
                            ? "cursor-pointer text-red-300 hover:bg-red-500/10 focus-visible:bg-red-500/10"
                            : "cursor-pointer hover:bg-surface focus-visible:bg-surface"
                      }`}
                    >
                      <row.Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      {row.sub ? (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MessageBubble({
  message,
  profile,
  peer,
  grouped,
  upload,
  t,
  composerRef,
  email,
  onSaveEdit,
  onDelete,
  onShare,
  onReact,
}: {
  message: ChatMessage;
  profile: { name: string; avatar: string | null };
  /** Who the other side is, so their picture can sit on the left of the row. */
  peer: { name: string; avatar: string | null; accent: string };
  /**
   * Whether this message continues the one above it from the same person.
   *
   * A run of messages from one person is one block in the reference layout: the
   * picture and the name are drawn once at the top of it, and the rest are
   * lines under it. Drawing them all out turns a paragraph into a wall of
   * repeated headers.
   */
  grouped: boolean;
  /**
   * How far this message's file has got, while it is on its way up.
   *
   * Drawn on the bubble rather than beside the send button because that is where
   * the wait is: the bubble is already on screen, and a four-gigabyte file is
   * long enough that somebody will want to see it is still moving.
   */
  upload?: UploadProgressRow | undefined;
  t: MessagesCopy;
  /** The composer, so the menu can keep clear of the text field. */
  composerRef: React.RefObject<HTMLElement | null>;
  /**
   * This account's own address, which is what a reaction is recorded against.
   *
   * A name would not do: the reaction is stored as an address so it survives
   * somebody changing their name, and the row of buttons has to ask the same
   * question the store asks when it writes one.
   */
  email: string;
  onSaveEdit: (text: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onShare: (text: string) => void;
  /** Adds or takes off one emoji on this message. */
  onReact: (emoji: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [busy, setBusy] = useState(false);
  /**
   * The picture open on top of everything, if one is.
   *
   * A preview in the thread is sized for the thread, so whatever it is showing
   * is smaller than the picture and often cropped to fit the shape of a bubble.
   * That is the right size for deciding what was sent and the wrong one for
   * reading a screenshot of a table or a document, which is most of what gets
   * sent here. So the picture opens at its own size on top, and closes on the
   * backdrop, on Escape, or on the picture itself.
   */
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  /**
   * How the row opens its menu at a point, for a right click.
   *
   * Held by the row rather than passed down: the menu is the thing that positions
   * itself, and this is only the door into it.
   */
  const menuOpenAtRef = useRef<((point: { x: number; y: number }) => void) | null>(null);

  /**
   * A right click opens this message's menu instead of the browser's.
   *
   * The default here is a menu of things Chromium thinks a message might be — copy,
   * search, inspect — none of which is anything anybody wanted from a message in a
   * chat. Refused on the row rather than on the page, so a right click anywhere
   * else, a blank gap or the text field, still gets the menu it should.
   */
  const openMenuAt = (event: React.MouseEvent) => {
    event.preventDefault();
    menuOpenAtRef.current?.({ x: event.clientX, y: event.clientY });
  };

  // Escape closes the picture from the keyboard, wherever the focus happens to
  // be. A key handler on the backdrop alone would need the backdrop focused
  // first, and a dialog nobody can leave with the keyboard is a dialog that
  // traps.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const images = (message.attachments ?? []).filter((item) => item.kind === "image");
  const files = (message.attachments ?? []).filter((item) => item.kind === "file");
  const source = (attachment: MessageAttachment) =>
    attachment.dataUrl ?? (attachment.stored ? attachmentUrl(attachment.id) : "");
  // Only the author manages a message, and only a text one can be rewritten.
  const canManage = canManageMessage(message) && images.length === 0 && files.length === 0;

  useEffect(() => {
    if (!editing) setDraft(message.text);
  }, [editing, message.text]);

  useEffect(() => {
    if (!editing) return;
    const field = editRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [editing]);

  const startEditing = () => {
    setDraft(message.text);
    setEditing(true);
  };

  const commitEdit = async () => {
    const text = draft.trim();
    if (!text || text === message.text) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const saved = await onSaveEdit(text);
    setBusy(false);
    // A refused change keeps the editor open with the text, so nothing is lost.
    if (saved) setEditing(false);
  };

  const stamp = (
    <span
      className={`flex items-center gap-1 font-mono text-[0.6rem] text-muted-foreground ${
        message.fromMe ? "text-brand-bright" : ""
      }`}
    >
      {formatClock(message.at)}
      {message.fromMe ? (
        message.status === "sending" ? (
          <Check className="size-3" aria-hidden="true" />
        ) : message.status === "sent" ? (
          <CheckCheck className="size-3" aria-hidden="true" />
        ) : (
          <CheckCheck className="size-3 text-brand-bright" aria-hidden="true" />
        )
      ) : null}
    </span>
  );

  /**
   * That the text was changed afterwards, kept out of the timestamp.
   *
   * Only the first message of a run carries the head, so an edited one further
   * down would lose the note entirely and a rewritten message would look
   * untouched. It belongs to the message, not to the run, so it goes with the
   * text it describes.
   */
  const editedNote = message.editedAt ? (
    <span className="ml-1 align-baseline font-mono text-[0.6rem] text-muted-foreground/70">
      {t.messageEdited}
    </span>
  ) : null;

  /**
   * The picture on the left of the row, or the space one would take.
   *
   * Both sides of the conversation are drawn the same way, with the picture on
   * the left, because a thread reads down the page rather than zigzagging across
   * it. The space is kept for the messages that continue a run so their lines
   * start under the first one instead of jumping left.
   */
  const rowAvatar = () =>
    grouped ? (
      <span className="w-9 shrink-0" aria-hidden="true" />
    ) : (
      <span
        className="mt-0.5 grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border text-[0.7rem] font-bold"
        style={{
          backgroundColor: message.fromMe ? "var(--brand)" : `${peer.accent}26`,
          color: message.fromMe ? "var(--primary-foreground)" : peer.accent,
        }}
      >
        {message.fromMe ? (
          profile.avatar ? (
            <span
              style={{ backgroundImage: `url("${profile.avatar}")` }}
              className="size-full bg-cover bg-center"
            />
          ) : (
            (profile.name || t.you).slice(0, 2).toUpperCase()
          )
        ) : peer.avatar ? (
          <span
            style={{ backgroundImage: `url("${peer.avatar}")` }}
            className="size-full bg-cover bg-center"
          />
        ) : (
          initialsForName(peer.name)
        )}
      </span>
    );

  /** Who wrote it and when, once at the top of a run rather than on every line. */
  const rowHead = () =>
    grouped ? null : (
      <div className="flex items-baseline gap-2">
        <span className="text-[0.85rem] font-semibold text-foreground">
          {message.fromMe ? profile.name || t.you : peer.name}
        </span>
        {stamp}
      </div>
    );

  /** The reactions already on it, and whether this account is one of them. */
  const reactions = reactionSummary(message, email);

  /**
   * The row of buttons under the message.
   *
   * A button per emoji, with the count on it, because the count is the answer to
   * the question somebody presses it again to ask: who is reacting. One's own is
   * filled in, so taking it back is a press of the same button and not a hunt for a
   * different one.
   */
  const reactionRow =
    reactions.length > 0 ? (
      <div className="mt-1 flex flex-wrap gap-1">
        {reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => onReact(reaction.emoji)}
            aria-pressed={reaction.mine}
            title={`${reaction.emoji} ${reaction.count}`}
            className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2 text-[0.7rem] leading-none transition-colors ${
              reaction.mine
                ? "border-brand/60 bg-brand/15 text-foreground"
                : "border-border/60 bg-background/40 text-muted-foreground hover:bg-surface"
            }`}
          >
            <span className="text-[0.85rem]">{reaction.emoji}</span>
            <span className="font-mono tabular-nums">{reaction.count}</span>
          </button>
        ))}
      </div>
    ) : null;

  const menu = (edge: "start" | "end") => (
    <MessageMenu
      key={edge}
      t={t}
      align={edge}
      canManage={canManage}
      anchorRef={menuAnchorRef}
      insetRef={composerRef}
      openAtRef={menuOpenAtRef}
      onReact={onReact}
      onShare={() => onShare(message.text)}
      onEdit={startEditing}
      onDelete={async () => {
        setBusy(true);
        const done = await onDelete();
        setBusy(false);
        if (done) setEditing(false);
      }}
    />
  );

  /** The editor replaces the message in place, the way the reference apps do. */
  if (editing) {
    return (
      <div className="group flex gap-3 px-3 py-1">
        {rowAvatar()}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <textarea
            ref={editRef}
            value={draft}
            rows={1}
            disabled={busy}
            aria-label={t.messageEdit}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void commitEdit();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setEditing(false);
              }
            }}
            className="max-h-40 min-h-[42px] w-full resize-none rounded-2xl border border-brand/60 bg-surface px-3 py-2.5 text-sm text-foreground outline-none"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="cursor-pointer rounded-full border border-border/70 px-3 py-1 font-mono text-[0.58rem] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-foreground disabled:opacity-50"
            >
              {t.messageEditCancel}
            </button>
            <button
              type="button"
              onClick={() => void commitEdit()}
              disabled={busy || !draft.trim()}
              className="cursor-pointer rounded-full bg-brand px-3 py-1 font-mono text-[0.58rem] tracking-[0.1em] text-primary-foreground uppercase transition-colors hover:bg-brand/85 disabled:opacity-50"
            >
              {t.messageEditSave}
            </button>
          </div>
          <p className="font-mono text-[0.52rem] text-muted-foreground">{t.messageEditHint}</p>
        </div>
        {menu(message.fromMe ? "end" : "start")}
      </div>
    );
  }

  // A deleted message keeps its place in the thread but gives up its content, so
  // neither side can still read what was said.
  if (message.deletedAt) {
    return (
      <div className="group flex gap-3 px-3 py-0.5">
        {rowAvatar()}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="w-fit rounded-md border border-dashed border-border/70 px-2 py-1 text-[0.75rem] text-muted-foreground italic">
            {t.messageDeleted}
          </span>
        </div>
      </div>
    );
  }

  // A sticker is drawn large and without bubble chrome, the way Viber and
  // WhatsApp show them, so it reads as artwork rather than as a short message.
  const giphyUrl = giphyStickerUrlFromText(message.text);
  if (images.length === 0 && files.length === 0 && (giphyUrl || stickerIdFromText(message.text))) {
    // A Giphy sticker is fetched from Giphy, a bundled one from our own public
    // folder, so only the source and the label differ between the two.
    const source = giphyUrl ?? stickerFromText(message.text)?.url;
    const label = giphyUrl
      ? t.stickerLabel
      : (stickerFromText(message.text)?.name ?? t.stickerMissing);
    return (
      <div className="group flex gap-3 px-3 py-0.5" onContextMenu={openMenuAt}>
        {rowAvatar()}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {source ? (
            <img
              src={source}
              alt={label}
              width={208}
              height={208}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="w-full max-w-[13rem] rounded-2xl object-contain drop-shadow-sm"
            />
          ) : (
            <span className="rounded-xl border border-border/60 bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              {t.stickerMissing}
            </span>
          )}
          {reactionRow}
          {stamp}
        </div>
        {menu(message.fromMe ? "end" : "start")}
      </div>
    );
  }

  if (images.length === 0 && files.length === 0 && isStickerText(message.text)) {
    return (
      <div className="group flex gap-3 px-3 py-0.5" onContextMenu={openMenuAt}>
        {rowAvatar()}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {rowHead()}
          <span className="text-[4.5rem] leading-[1.05] drop-shadow-sm sm:text-6xl">
            {message.text}
          </span>
          {reactionRow}
        </div>
        {menu("end")}
      </div>
    );
  }

  const links = splitMessageLinks(message.text).filter((part) => part.kind === "link");
  const firstLink = links[0]?.value;

  return (
    <div
      onContextMenu={openMenuAt}
      className={`group flex gap-3 px-3 transition-colors hover:bg-[var(--surface-2)]/40 ${
        grouped ? "py-0.5" : "pt-3 pb-0.5"
      }`}
    >
      {rowAvatar()}
      {/**
       * The body of the message, filling what the row has left.
       *
       * This used to be a bubble: a box capped at a share of the column, with
       * its own colour, pushed to one side of the row. The cap is what turned
       * text into a column two or three characters wide, and `break-words` on
       * top of it broke every word across lines — "зд" and "р" on separate
       * lines — because there was barely room for a letter. A conversation is a
       * page of text, not a heap of boxes, so the row is the layout now: the
       * picture on the left, the text taking the rest of the width, and the
       * timestamp once at the top of a run.
       */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {rowHead()}

        {images.length > 0 ? (
          <div
            className={`grid max-w-[400px] gap-1.5 ${
              images.length > 1 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {images.map((attachment) => {
              const src = source(attachment);
              if (!src) {
                return (
                  <span
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-xl border border-current/20 px-3 py-2 text-[0.7rem] opacity-70"
                  >
                    <ImageIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{attachment.name}</span>
                  </span>
                );
              }
              return (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => setLightbox({ src, name: attachment.name })}
                  aria-label={attachment.name}
                  className="group/img block overflow-hidden rounded-lg"
                >
                  <img
                    src={src}
                    alt={attachment.name}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    // No height and no fixed width: the browser lays the picture
                    // out at the shape it was sent at, and the caps only stop it
                    // from being wider than the column or taller than the screen.
                    // Nothing here crops, so a tall screenshot is tall and a wide
                    // one is wide.
                    className="block max-h-[320px] w-auto max-w-full rounded-lg object-contain transition-opacity group-hover/img:opacity-80"
                  />
                </button>
              );
            })}
          </div>
        ) : null}

        {files.length > 0 ? (
          <div className="grid max-w-[400px] gap-1.5">
            {files.map((attachment) => {
              const href = source(attachment);
              /**
               * A file whose bytes are not behind it.
               *
               * It reaches here when the two ends disagree about how large a file
               * may be — a cap moved between them, or a build that offered more
               * than the storage could take. The name is kept so the message still
               * says what it meant to carry, and the row says the rest: an anchor
               * with no href is a file that looks attached and does nothing when
               * pressed, which is the one outcome worse than not having sent it.
               */
              if (!href) {
                return (
                  <span
                    key={attachment.id}
                    className="flex items-center gap-2.5 rounded-lg border border-dashed border-border/70 px-3 py-2"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5">
                      <FileText className="size-4 opacity-50" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.72rem]">{attachment.name}</span>
                      <span className="block text-[0.6rem] text-muted-foreground">
                        {t.attachmentMissing}
                      </span>
                    </span>
                  </span>
                );
              }
              return (
                <a
                  key={attachment.id}
                  href={href}
                  download={attachment.name}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/40 px-3 py-2 transition-opacity hover:opacity-80"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/20">
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.72rem]">{attachment.name}</span>
                    <span className="block font-mono text-[0.55rem] opacity-70">
                      {formatSize(attachment.size)}
                    </span>
                  </span>
                  <Download className="size-3.5 shrink-0 opacity-70" />
                </a>
              );
            })}
          </div>
        ) : null}

        {upload ? (
          <div className="max-w-[400px]">
            <div className="flex items-baseline justify-between gap-2 text-[0.6rem] opacity-70">
              <span className="truncate">
                {t.uploadLabel(formatSize(upload.sent), formatSize(upload.total))}
              </span>
              <span className="shrink-0 font-mono">
                {upload.total ? Math.round((upload.sent / upload.total) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-current/15">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-200"
                style={{
                  width: `${upload.total ? Math.min(100, (upload.sent / upload.total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <span className="whitespace-pre-wrap break-words text-[0.9rem] leading-[1.375] text-foreground/90">
          {splitMessageLinks(message.text).map((part, index) =>
            part.kind === "link" ? (
              <a
                key={`${part.value}-${index}`}
                href={part.value}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-brand underline underline-offset-2 hover:opacity-80"
              >
                {part.value}
              </a>
            ) : (
              <span key={`t-${index}`}>{part.value}</span>
            ),
          )}
          {editedNote}
        </span>
        {reactionRow}

        {/* One compact card for the first link, so the reader sees where it
            goes without leaving the conversation. */}
        {firstLink ? (
          <a
            href={firstLink}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-0.5 flex max-w-[400px] items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 transition-colors hover:bg-background/70"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
              <Link2Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.7rem] font-medium">
                {linkHost(firstLink)}
              </span>
              <span className="block truncate font-mono text-[0.55rem] opacity-70">
                {firstLink}
              </span>
            </span>
            <ExternalLink className="size-3 shrink-0 opacity-60" />
          </a>
        ) : null}
      </div>
      {menu("end")}

      {/**
       * The picture on top, at the size it was sent.
       *
       * Fixed to the window and above everything, because the point of opening
       * it is to stop looking at the thread. The image is capped to the window
       * rather than scaled, so a large picture comes down to fit instead of
       * being stretched, and the backdrop and Escape both close it, so it can
       * never end up open with no way out of it.
       */}
      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <img
            src={lightbox.src}
            alt={lightbox.name}
            onClick={(event) => {
              // The backdrop closes, the picture does not: a click on the
              // picture is how somebody checks they meant to open it.
              event.stopPropagation();
            }}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </div>
  );
}
