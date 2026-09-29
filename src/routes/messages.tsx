import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  BellOff,
  Braces,
  Check,
  CheckCheck,
  Cloud,
  CloudOff,
  Download,
  FileText,
  ImageIcon,
  Info,
  Loader2,
  LogOut,
  MessageSquarePlus,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  PhoneOff,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Smile,
  Sticker,
  UserPlus,
  Users,
  Video,
  VideoOff,
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
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useSiteSettings } from "../components/site/theme";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
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
  callDuration,
  callCandidates,
  canManageMessage,
  createMessageId,
  initialsForName,
  isOnlineAt,
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
  type IncomingAttachment,
  type MessageAttachment,
  type MessageChat,
  type MessagesProfile,
  type PresenceStatus,
} from "../lib/messages-protocol";
import { attachmentUrl, messagesStore } from "../lib/messages-store";
import { timelineFor, timelineLast, type TimelineCall } from "../lib/messages-timeline";
import { isStickerText, linkHost, messageLinks, splitMessageLinks } from "../lib/messages-richtext";
import { seoHead } from "../lib/seo";
import {
  STICKER_ASSETS,
  stickerById,
  stickerFromText,
  stickerIdFromText,
  stickerText,
  type StickerAsset,
} from "../lib/stickers";

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
  imageTooBig: string;
  fileTooBig: string;
  fileUnreadable: string;
  storageFull: string;
  emojiCategories: Record<string, string>;
  unlockTitle: string;
  unlockBody: string;
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
  stickerAnimated: string;
  stickerEmoticons: string;
  stickerTapToSend: string;
  stickerLabel: string;
  stickerMissing: string;
  messageMenu: string;
  messageEdit: string;
  messageEditSave: string;
  messageEditCancel: string;
  messageEditHint: string;
  messageDelete: string;
  messageDeleteConfirm: string;
  messageShare: string;
  messageShared: string;
  messageShareFailed: string;
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
  callActivity: string;
  callActivityHint: string;
  callMicDevice: string;
  callCameraDevice: string;
  callUnsupported: string;
  callUnknown: string;
  callMicOn: string;
  callMicMuted: string;
  callPeople: string;
  callScreenLabel: string;
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
    imageTooBig: "Снимката е твърде голяма (макс. 8 MB).",
    fileTooBig: "Файлът е твърде голям (макс. 2 MB).",
    fileUnreadable: "Файлът не можа да бъде прочетен.",
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
    stickerAnimated: "Анимирани",
    stickerEmoticons: "Емотикони",
    stickerTapToSend: "Докосни, за да изпратиш",
    stickerLabel: "Стикер",
    stickerMissing: "Стикерът липсва",
    messageMenu: "Опции за съобщението",
    messageEdit: "Редактирай",
    messageEditSave: "Запази",
    messageEditCancel: "Отказ",
    messageEditHint: "Enter за запис, Escape за отказ",
    messageDelete: "Изтрий",
    messageDeleteConfirm: "Изтриване на съобщението",
    messageShare: "Сподели текста",
    messageShared: "Текстът е копиран",
    messageShareFailed: "Копирането не е възможно",
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
    callActivity: "Избери активност",
    callActivityHint: "Играй заедно, докато разговаряте",
    callMicDevice: "Микрофон",
    callCameraDevice: "Камера",
    callUnsupported: "Браузърът не поддържа разговори",
    callUnknown: "Непознат",
    callMicOn: "Микрофонът е включен",
    callMicMuted: "Микрофонът е заглушен",
    callPeople: "В разговора: {count}",
    callScreenLabel: "Споделен екран",
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
    imageTooBig: "Image is too large (max 8 MB).",
    fileTooBig: "File is too large (max 2 MB).",
    fileUnreadable: "The file could not be read.",
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
    stickerAnimated: "Animated",
    stickerEmoticons: "Emojis",
    stickerTapToSend: "Tap to send",
    stickerLabel: "Sticker",
    stickerMissing: "Sticker unavailable",
    messageMenu: "Message options",
    messageEdit: "Edit",
    messageEditSave: "Save",
    messageEditCancel: "Cancel",
    messageEditHint: "Enter to save, Escape to cancel",
    messageDelete: "Delete",
    messageDeleteConfirm: "Delete the message",
    messageShare: "Share the text",
    messageShared: "Text copied",
    messageShareFailed: "Could not copy",
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
    callActivity: "Choose an activity",
    callActivityHint: "Play together while you talk",
    callMicDevice: "Microphone",
    callCameraDevice: "Camera",
    callUnsupported: "This browser cannot do calls",
    callUnknown: "Unknown",
    callMicOn: "Microphone is on",
    callMicMuted: "Microphone is muted",
    callPeople: "In call: {count}",
    callScreenLabel: "Shared screen",
    callScreenLabelWindow: "Shared window",
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
    imageTooBig: "图片太大（最大 8 MB）。",
    fileTooBig: "文件太大（最大 2 MB）。",
    fileUnreadable: "无法读取文件。",
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
    stickerAnimated: "动图",
    stickerEmoticons: "表情",
    stickerTapToSend: "点击即可发送",
    stickerLabel: "贴纸",
    stickerMissing: "贴纸不可用",
    messageMenu: "消息选项",
    messageEdit: "编辑",
    messageEditSave: "保存",
    messageEditCancel: "取消",
    messageEditHint: "回车保存，Esc 取消",
    messageDelete: "删除",
    messageDeleteConfirm: "删除这条消息",
    messageShare: "分享文字",
    messageShared: "文字已复制",
    messageShareFailed: "无法复制",
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
    callActivity: "选择活动",
    callActivityHint: "一边聊天一边玩",
    callMicDevice: "麦克风",
    callCameraDevice: "摄像头",
    callUnsupported: "此浏览器不支持通话",
    callUnknown: "未知",
    callMicOn: "麦克风已开启",
    callMicMuted: "麦克风已静音",
    callPeople: "通话中：{count}",
    callScreenLabel: "共享屏幕",
    callScreenLabelWindow: "共享窗口",
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

const formatClock = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The one line the chat list shows under a name. A sticker travels as a token,
 * so the raw text would leak `[sticker:…]` into the preview; it reads as the
 * sticker name instead.
 */
function messagePreview(text: string, t: MessagesCopy) {
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

/**
 * The emoticon tiles of the sticker tray, grouped the way Viber groups them.
 * The animated pack next to them lives in `src/lib/stickers.ts`.
 */
const STICKER_GROUPS: Array<{ id: string; emoji: string[] }> = [
  {
    id: "faces",
    emoji: [
      "😀",
      "😂",
      "🥹",
      "😍",
      "🤩",
      "😎",
      "🤔",
      "😴",
      "🥳",
      "🤗",
      "😇",
      "🙃",
      "😜",
      "🤪",
      "😤",
      "🥺",
      "😱",
      "🤯",
      "🫠",
      "🤓",
    ],
  },
  {
    id: "gestures",
    emoji: [
      "👍",
      "👎",
      "👌",
      "✌️",
      "🤞",
      "🤟",
      "🤙",
      "👋",
      "🙏",
      "💪",
      "👏",
      "🙌",
      "🫶",
      "🤝",
      "✍️",
      "🫡",
      "🤌",
      "👊",
      "✊",
      "🖐️",
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
      "💔",
      "💕",
      "💖",
      "💘",
      "💝",
      "💗",
      "💓",
      "💞",
      "💌",
      "❣️",
      "💟",
      "💯",
    ],
  },
  {
    id: "objects",
    emoji: [
      "🔥",
      "✨",
      "⭐",
      "🌟",
      "💫",
      "💥",
      "💯",
      "🎉",
      "🎊",
      "🎈",
      "🎁",
      "🏆",
      "🥇",
      "⚡",
      "☀️",
      "🌙",
      "☁️",
      "🌈",
      "❄️",
      "🎵",
    ],
  },
  {
    id: "food",
    emoji: [
      "🍎",
      "🍕",
      "🍔",
      "🍟",
      "🌮",
      "🍣",
      "🍜",
      "🍩",
      "🍪",
      "🍰",
      "☕",
      "🍺",
      "🥂",
      "🍻",
      "🥑",
      "🍿",
      "🧁",
      "🍇",
      "🍓",
      "🥧",
    ],
  },
  {
    id: "animals",
    emoji: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🐔",
      "🐧",
      "🐦",
      "🦄",
      "🐝",
      "🦋",
    ],
  },
];

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
  const dataUrl = await readFileAsDataUrl(file);
  return {
    id: createMessageId(),
    kind: "file",
    name: file.name || "file",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
  };
}

async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) {
    throw new Error("image-too-big");
  }
  return compressImageFile(file, { maxWidth: 320, maxHeight: 320, maxBytes: 60_000, quality: 0.7 });
}

export function MessagesPage() {
  const { lang } = useSiteSettings();
  const t = messagesCopy[lang];

  const store = useSyncExternalStore(
    messagesStore.subscribe,
    messagesStore.getState,
    messagesStore.getState,
  );

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showList, setShowList] = useState(true);
  const [sidebarView, setSidebarView] = useState<"chats" | "contacts" | "friends">("chats");
  const [pending, setPending] = useState<IncomingAttachment[]>([]);
  const [stickerTrayOpen, setStickerTrayOpen] = useState(false);
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

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? "" : current)), 4200);
  }, []);

  const data = store.data;
  const contacts = useMemo(() => data?.contacts ?? [], [data]);
  const chats = useMemo(() => data?.chats ?? [], [data]);

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

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeChatId, activeChat?.messages.length, thread.length, scrollToBottom]);

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
    void messagesStore.markRead(chatId);
  }, []);

  const openChatWithContact = useCallback((contact: ChatContact) => {
    const chatId = messagesStore.openChatWithContact(contact);
    setActiveChatId(chatId);
    setShowList(false);
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
          if (!result.ok) flash(t.storageFull);
        });
    },
    [activeChat, draft, flash, pending, t.storageFull],
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
          if (reason === "image-too-big") flash(t.imageTooBig);
          else if (reason === "file-too-big") flash(t.fileTooBig);
          else flash(t.fileUnreadable);
        }
      }
      if (accepted.length > 0) setPending((current) => [...current, ...accepted]);
    },
    [flash, pending.length, t.fileTooBig, t.fileUnreadable, t.imageTooBig],
  );

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
  const sendSticker = useCallback(
    (sticker: StickerAsset) => {
      if (!activeChat) return;
      // A sticker is a message too, so it leaves with the same sound.
      playSendSound();
      void messagesStore
        .sendMessage({
          chatId: activeChat.id,
          peerEmail: activeChat.peerEmail,
          text: stickerText(sticker.id),
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
        flash(t.imageTooBig);
      }
    },
    [flash, t.imageTooBig, t.storageFull],
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
    // Phones get an edge to edge thread; from `sm` up the hub is a framed
    // window, and from `lg` up it splits into the two pane layout.
    <main className="grid-bg relative min-h-[calc(100dvh-68px)] px-2 py-2 sm:px-5 sm:pb-6 sm:pt-5">
      {store.mode === "local" ? (
        <div className="mx-auto mb-3 max-w-[1500px] overflow-hidden rounded-2xl">
          <OfflineBanner t={t} onTryCloud={() => void messagesStore.promoteToCloud()} />
        </div>
      ) : null}
      <section className="mx-auto flex h-[calc(100dvh-68px-1rem)] max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-glow backdrop-blur-xl sm:h-[calc(100dvh-68px-1.5rem)] sm:rounded-3xl lg:flex-row">
        <ChatSidebar
          t={t}
          lang={lang}
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
          onSignOut={() => void messagesStore.signOut()}
          onSetStatus={(status) => {
            void messagesStore.setStatus(status).then((result) => {
              if (!result.ok) flash(t.statusSaveFailed);
            });
          }}
          onSwitchAccount={() => {
            // The messages session is one HttpOnly cookie per origin, so a
            // second account needs a fresh sign-in on this device.
            void messagesStore.signOut().then(() => {
              window.location.href = "/login";
            });
          }}
          profile={data.profile}
          onPickAvatar={() => avatarInputRef.current?.click()}
          confirmDeleteId={confirmDeleteId}
          onRequestDelete={setConfirmDeleteId}
          onConfirmDelete={(contactId) => {
            setConfirmDeleteId(null);
            void messagesStore.removeContact(contactId);
          }}
          className={showList ? "flex" : "hidden lg:flex"}
        />

        <div
          className={`min-h-0 min-w-0 flex-1 flex-col border-border bg-background/40 lg:flex lg:border-l ${
            showList ? "hidden lg:flex" : "flex"
          }`}
        >
          {activeChat && activeContact ? (
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
                    onFlash={flash}
                  />
                </div>
              </header>

              <div
                ref={scrollRef}
                className="scrollbar-thin flex-1 space-y-1 overflow-y-auto overscroll-contain overflow-x-hidden bg-background/60 px-2 py-4 sm:px-6 sm:py-5"
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
                            t={t}
                            composerRef={composerRef}
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
                className="flex shrink-0 items-end gap-1.5 border-t border-border/60 bg-card/60 px-2 py-2.5 backdrop-blur-xl sm:gap-2 sm:px-5 sm:py-3"
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
                      className="border-border/70 bg-popover/95 p-3 backdrop-blur-xl"
                    >
                      <StickerPicker
                        t={t}
                        onPickEmoji={insertEmoji}
                        onSendSticker={(sticker) => {
                          sendSticker(sticker);
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
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background/60 px-6 text-center">
              <span className="grid size-16 place-items-center rounded-3xl border border-brand/30 bg-brand/10 text-brand">
                <MessageSquarePlus className="size-7" />
              </span>
              <p className="font-display text-lg font-bold">{t.noChats}</p>
              <p className="max-w-xs text-xs text-muted-foreground">{t.noChatsHint}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {contacts[0] ? (
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-mono text-[0.65rem] font-bold tracking-[0.18em] text-primary-foreground transition-transform hover:-translate-y-0.5"
                  >
                    {t.newChat}
                    <Send className="size-3" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setShowList(true);
                    setSidebarView("contacts");
                    setContactDialogOpen(true);
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-5 py-2.5 font-mono text-[0.65rem] font-bold tracking-[0.18em] text-brand transition-colors hover:bg-brand/20"
                >
                  <UserPlus className="size-3" />
                  {t.newContact}
                </button>
              </div>
            </div>
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

        {/* The call rides over the hub, so the conversation stays where it
              was: the user can go back to reading without hanging up. */}
        {callUp ? (
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
      </form>
    </main>
  );
}

type ChatSidebarProps = {
  t: MessagesCopy;
  lang: Lang;
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
  onSignOut: () => void;
  onSwitchAccount: () => void;
  onSetStatus: (status: PresenceStatus) => void;
  profile: MessagesProfile;
  onPickAvatar: () => void;
  confirmDeleteId: string | null;
  onRequestDelete: (contactId: string) => void;
  onConfirmDelete: (contactId: string) => void;
  className?: string;
};

function ChatSidebar({
  t,
  lang,
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
  onSignOut,
  onSwitchAccount,
  onSetStatus,
  profile,
  onPickAvatar,
  confirmDeleteId,
  onRequestDelete,
  onConfirmDelete,
  className,
}: ChatSidebarProps) {
  return (
    <aside
      className={`w-full shrink-0 flex-col border-border bg-surface/40 lg:w-[380px] lg:border-r lg:shadow-[1px_0_0_rgba(255,255,255,0.04)] ${className ?? "flex"}`}
    >
      {/* Account header: who is signed in, on which transport. */}
      <div className="shrink-0 border-b border-border/60 bg-background/40 px-3 pb-3 pt-4 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="flex gap-2" aria-hidden="true">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </span>
          <h1 className="ml-2 font-display text-sm font-bold tracking-tight">{t.title}</h1>
          <span className="ml-auto flex items-center gap-1">
            <SidebarIcon
              label={t.newContact}
              onClick={() => {
                onViewChange("contacts");
                onAddContact();
              }}
              active={view === "contacts"}
            >
              <UserPlus className="size-4" />
            </SidebarIcon>
            <SidebarIcon label={t.newChat} onClick={onNewChat} active={view === "chats"}>
              <MessageSquarePlus className="size-4" />
            </SidebarIcon>
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60 p-2.5">
          <button
            type="button"
            onClick={onPickAvatar}
            aria-label={t.changePhoto}
            title={t.changePhoto}
            // The same neon frame the contact avatars wear, so the account at the
            // top of the list reads as the same object as everybody else's.
            style={{
              backgroundColor: `${profile.accent}1f`,
              color: profile.accent,
              boxShadow: `0 0 0 2px ${profile.accent}, 0 0 14px ${profile.accent}4d`,
            }}
            className="group/avatar relative grid size-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full font-display text-sm font-bold"
          >
            {profile.avatar ? (
              <span
                style={{ backgroundImage: `url("${profile.avatar}")` }}
                className="size-full bg-cover bg-center"
              />
            ) : (
              <span>{(profile.name || t.you).slice(0, 2).toUpperCase()}</span>
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity group-hover/avatar:opacity-100">
              <ImageIcon className="size-3.5 text-white" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{profile.name || t.you}</p>
            {/* Clicking the status opens the presence menu, as in the reference. */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mt-0.5 flex max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-2"
                  aria-label={t.statusOnline}
                >
                  <PresenceDot status={profile.status} online={online} t={t} />
                  <span className="truncate font-mono text-[0.55rem] tracking-[0.15em] text-brand uppercase">
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
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={6}
                className="border-0 bg-transparent p-0 shadow-none"
              >
                <PresenceMenu
                  t={t}
                  current={profile.status}
                  onPick={(status) => void onSetStatus(status)}
                />
              </PopoverContent>
            </Popover>
            <p className="truncate text-[0.6rem] font-normal text-muted-foreground">
              {profile.email}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={onSwitchAccount}
              aria-label={t.switchAccount}
              title={t.switchAccount}
              className="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
            >
              <Repeat className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onSignOut}
              aria-label={t.signOut}
              title={t.signOut}
              className="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex rounded-full border border-border/70 bg-background/70 p-1">
          {[
            { id: "chats" as const, label: t.chatsTab, Icon: MessageSquarePlus, badge: 0 },
            { id: "contacts" as const, label: t.contactsTab, Icon: Users, badge: 0 },
            {
              id: "friends" as const,
              label: t.friendsTab,
              Icon: UserPlus,
              badge: friends.incoming.length,
            },
          ].map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onViewChange(id);
                if (id === "friends") onClearPeople();
              }}
              className={`relative flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-full px-1 py-1.5 font-mono text-[0.5rem] tracking-[0.05em] uppercase transition-colors sm:gap-1.5 sm:px-2 sm:text-[0.55rem] sm:tracking-[0.12em] ${
                view === id
                  ? "bg-brand text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3 shrink-0" />
              <span className="truncate">{label}</span>
              {badge > 0 ? (
                <span className="grid size-4 shrink-0 place-items-center rounded-full bg-red-500 text-[0.55rem] font-bold text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {friends.incoming.length > 0 && view !== "friends" ? (
          <button
            type="button"
            onClick={() => onViewChange("friends")}
            className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-left transition-colors hover:bg-red-500/20"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-500 text-[0.6rem] font-bold text-white">
              {friends.incoming.length}
            </span>
            <span className="min-w-0 flex-1 text-[0.7rem] text-red-200">
              {friends.incoming[0]?.fromName} — {t.incomingRequests.toLocaleLowerCase(lang)}
            </span>
            <span className="shrink-0 font-mono text-[0.55rem] text-red-300">›</span>
          </button>
        ) : null}

        {view === "friends" ? null : (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t.search}
              aria-label={t.search}
              className="w-full rounded-full border border-border/70 bg-background/70 py-2 pl-9 pr-9 text-xs font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="clear"
                className="absolute right-2.5 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                      onClick={() => onSelectChat(chat.id)}
                      className={`group relative flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors active:bg-surface-2 sm:px-4 ${
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
            friends={friends}
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

      <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5">
        <span className="label-mono text-[0.55rem]">{profile.email}</span>
        <button
          type="button"
          onClick={() => void messagesStore.sync()}
          className="label-mono flex cursor-pointer items-center gap-1 text-[0.58rem] transition-colors hover:text-brand"
        >
          <RefreshCw className="size-2.5" />
          {t.syncing}
        </button>
      </div>
    </aside>
  );
}

function SidebarIcon({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-8 cursor-pointer place-items-center rounded-full transition-colors ${
        active ? "bg-brand/15 text-brand" : "bg-brand/10 text-brand/70 hover:bg-brand/20"
      }`}
    >
      {children}
    </button>
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
      setError(t.imageTooBig);
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
 * The tray behind the sticker button: the animated pack that ships with the
 * site on one tab, the emoticon tiles on the other. Tapping an asset sends it
 * right away the way the tray looks, while a tile is still inserted into the
 * draft so emoticons can be written inside a sentence.
 */
function StickerPicker({
  t,
  onPickEmoji,
  onSendSticker,
}: {
  t: MessagesCopy;
  onPickEmoji: (emoji: string) => void;
  onSendSticker: (sticker: StickerAsset) => void;
}) {
  const [tab, setTab] = useState<"animated" | "emoticons">("animated");

  return (
    // The tray is sized against the viewport so it never runs off a phone.
    <div className="flex w-[min(23rem,calc(100vw-1.5rem))] flex-col">
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-surface-2/70 p-1">
        {(
          [
            ["animated", t.stickerAnimated],
            ["emoticons", t.stickerEmoticons],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`cursor-pointer rounded-lg py-1.5 font-mono text-[0.55rem] tracking-[0.12em] uppercase transition-colors ${
              tab === id
                ? "bg-brand text-primary-foreground"
                : "text-muted-foreground hover:text-brand"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "animated" ? (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {STICKER_ASSETS.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSendSticker(asset)}
                title={asset.name}
                aria-label={asset.name}
                className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl bg-surface-2/60 transition-transform hover:scale-105"
              >
                <img
                  src={asset.url}
                  alt={asset.name}
                  width={96}
                  height={96}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="size-full object-contain"
                />
              </button>
            ))}
          </div>
          <p className="mt-2 text-[0.6rem] text-muted-foreground">{t.stickerTapToSend}</p>
        </>
      ) : (
        <div className="max-h-[min(16rem,40dvh)] overflow-y-auto pr-1">
          {STICKER_GROUPS.map((group) => (
            <div key={group.id} className="mb-2 last:mb-0">
              <div className="grid grid-cols-5 gap-1.5">
                {group.emoji.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onPickEmoji(emoji)}
                    aria-label={emoji}
                    className="grid aspect-square cursor-pointer place-items-center rounded-xl text-2xl transition-transform hover:scale-110 hover:bg-surface-2"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
}: {
  status: PresenceStatus;
  online: boolean;
  t: MessagesCopy;
  size?: "md" | "lg";
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
      className={`absolute -bottom-0.5 -right-0.5 z-10 grid place-items-center rounded-full border-2 border-card ${dot} ${tone}`}
      aria-label={label}
      title={label}
    >
      {status === "away" && online ? (
        <span className={`absolute right-[-1px] rounded-full bg-card ${ring}`} />
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
/**
 * One person in the call, as a tile.
 *
 * With four people there are four of these, and each is fed by that person's own
 * connection, so nobody's voice is played over somebody else's and nobody's
 * picture is left over from the last person to speak. A tile is a camera when
 * there is a camera, and a face when there is not, which is the state most of a
 * voice call is in.
 */
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
  /** True for the person whose screen is being shown to everybody. */
  sharing = false,
  /** What they chose to share, so the label can say which. */
  surface,
  grow = false,
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
  /** True for the person whose screen is being shown to everybody. */
  sharing?: boolean;
  surface?: ScreenSurface;
  /** Fills the space it is given, which is what a shared screen wants. */
  grow?: boolean;
  t: MessagesCopy;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
  const face = grow
    ? "aspect-video w-full rounded-2xl text-4xl sm:text-5xl"
    : "aspect-square w-full max-w-[13rem] rounded-2xl text-2xl sm:max-w-[15rem]";
  const fit = sharing ? "object-contain" : "object-cover";

  return (
    <div className={`flex min-w-0 flex-col items-center gap-1.5 ${grow ? "w-full" : ""}`}>
      <span
        className={`relative grid shrink-0 place-items-center overflow-hidden font-display font-bold ${face}`}
        style={{
          backgroundColor: `${accent}1f`,
          color: accent,
          boxShadow: grow ? `0 0 0 1px ${accent}66` : `0 0 0 2px ${accent}, 0 0 18px ${accent}4d`,
        }}
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
          <>
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
                <span className="relative">{initialsForName(name)}</span>
              </>
            )}
          </>
        )}

        {/* Two marks at most: a microphone, and a hand while they are dialling. */}
        <span className="absolute right-1 bottom-1 flex items-center gap-1">
          {joining ? (
            <span
              className="grid size-5 place-items-center rounded-full border-2 border-card bg-background/85 text-brand"
              aria-label={t.callLogConnecting}
            >
              <Loader2 className="size-2.5 animate-spin" />
            </span>
          ) : null}
          <span
            className="grid size-6 place-items-center rounded-full border-2 border-card bg-background/80 text-foreground"
            aria-label={muted ? t.callMicMuted : t.callMicOn}
          >
            {muted ? <MicOff className="size-3" /> : <Mic className="size-3" />}
          </span>
        </span>

        {sharing ? (
          <span className="absolute top-1 left-1 rounded-full bg-brand px-2 py-0.5 font-mono text-[0.5rem] tracking-[0.14em] text-primary-foreground uppercase">
            {/* What is being shared, because "why is my whole desktop on their
                phone" is a question a label can answer. */}
            {surface === "browser"
              ? t.callScreenLabelTab
              : surface === "window"
                ? t.callScreenLabelWindow
                : t.callScreenLabel}
          </span>
        ) : null}
      </span>
      {/*
       * The name, once, under its own tile.
       *
       * A "you" badge beside it repeated what the tile already says: this frame
       * is tinted differently from everybody else's, so nothing needs to say whose
       * it is twice. Wrapped rather than cut short, so a three part Bulgarian name
       * is read whole and tiles of uneven name length still sit side by side.
       */}
      <p
        className="w-full max-w-[14rem] break-words px-1 text-center text-xs font-bold"
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
 * microphone, screen, devices, more, and the red one that ends it.
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
    <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border/60 bg-card/80 px-3 pt-3 pb-3 backdrop-blur-xl sm:gap-3 sm:pt-4 sm:sm:pb-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <CallControl label={mic ? t.callMute : t.callUnmute} active={mic} onClick={onMute}>
        {mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </CallControl>

      <CallControl
        label={screen ? t.callStopShare : t.callShareScreen}
        active={!screen}
        onClick={onScreen}
      >
        <MonitorUp className="size-5" />
      </CallControl>

      <CallControl label={t.callSettings} onClick={onSettings}>
        <Settings className="size-5" />
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

  return <audio ref={ref} autoPlay />;
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
  const summary = entry.summary;

  // While the phone is ringing there is nothing to report yet, so the line says
  // what is happening instead of guessing how it will end.
  const headline = ringing
    ? peerName
    : live
      ? live.status === "outgoing" || live.status === "connecting"
        ? t.callLogRinging
        : t.callLogActive
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
  onFlash,
}: {
  t: MessagesCopy;
  chat: MessageChat;
  contact: ChatContact;
  profile: MessagesProfile;
  chats: MessageChat[];
  contacts: ChatContact[];
  lang: Lang;
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
        <p className="label-mono px-3 pt-1.5 pb-1 text-[0.55rem] text-muted-foreground">
          {t.chatSettings}
        </p>
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
 * The three dots on a message: share the text, edit it or delete it.
 *
 * Edit and delete belong to the author only, which is also what the object
 * enforces, so the menu simply hides them on somebody else's message. The
 * trigger sits at the outer edge of the row and is revealed on hover, but stays
 * visible on a touch screen where there is no hover to reveal it.
 *
 * The menu is drawn in a portal at a fixed position of its own, measured from
 * the trigger. That is what makes it behave the same at any scroll position: it
 * is not a child of the scrolling thread, so scrolling the conversation can
 * neither clip it nor drag it under the composer, and it is clamped into the gap
 * between the thread and the composer so all three options are always on screen.
 */
function MessageMenu({
  t,
  align,
  canManage,
  onShare,
  onEdit,
  onDelete,
  anchorRef,
  insetRef,
}: {
  t: MessagesCopy;
  /** Which corner of the row the trigger sits in, so the menu grows inwards. */
  align: "start" | "end";
  canManage: boolean;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  /** The composer, so the menu never lands on top of the text field. */
  insetRef: React.RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const options: Array<{ id: string; label: string; Icon: typeof Pencil; run: () => void }> = [
    { id: "share", label: t.messageShare, Icon: Share2, run: onShare },
    ...(canManage
      ? [
          { id: "edit", label: t.messageEdit, Icon: Pencil, run: onEdit },
          { id: "delete", label: t.messageDelete, Icon: Trash2, run: onDelete },
        ]
      : []),
  ];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }

    const placeMenu = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const trigger = anchor.getBoundingClientRect();
      const box = menu.getBoundingClientRect();
      const gutter = 8;
      const gap = 6;
      const clamp = (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), Math.max(min, max));

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

      // Open upwards when the trigger has the room, downwards when it does not,
      // and slide into the band either way.
      const roomAbove = trigger.top - gap - box.height >= band.top;
      const roomBelow = trigger.bottom + gap + box.height <= band.bottom;
      const preferredTop = roomAbove
        ? trigger.top - gap - box.height
        : roomBelow
          ? trigger.bottom + gap
          : trigger.top - gap - box.height;

      // `align` is the corner the trigger sits in, so the menu grows inwards and
      // a right hand message keeps its menu on the right.
      const preferredLeft = align === "end" ? trigger.right - box.width : trigger.left;

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
      const step = event.key === "ArrowDown" ? 1 : -1;
      const from = itemRefs.current.findIndex((item) => item === document.activeElement);
      const next = (from + step + options.length) % options.length;
      itemRefs.current[next]?.focus();
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
  }, [align, anchorRef, close, insetRef, open, options.length]);

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
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
              className="w-[min(13rem,calc(100vw-1rem))] rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl"
            >
              {options.map((option, index) => (
                <button
                  key={option.id}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    option.run();
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-normal transition-colors focus-visible:bg-surface focus-visible:outline-none ${
                    option.id === "delete"
                      ? "text-red-300 hover:bg-red-500/10 focus-visible:bg-red-500/10"
                      : "hover:bg-surface"
                  }`}
                >
                  <option.Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </button>
              ))}
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
  t,
  composerRef,
  onSaveEdit,
  onDelete,
  onShare,
}: {
  message: ChatMessage;
  profile: { name: string; avatar: string | null };
  t: MessagesCopy;
  /** The composer, so the menu can keep clear of the text field. */
  composerRef: React.RefObject<HTMLElement | null>;
  onSaveEdit: (text: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onShare: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [busy, setBusy] = useState(false);
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);

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

  /** Sent messages carry the account avatar, the way the inbox apps do. */
  const selfAvatar = message.fromMe ? (
    <span className="size-6 shrink-0 overflow-hidden rounded-full border border-border bg-brand/10 text-[0.55rem] font-bold text-brand">
      {profile.avatar ? (
        <span
          style={{ backgroundImage: `url("${profile.avatar}")` }}
          className="size-full bg-cover bg-center"
        />
      ) : (
        <span className="grid size-full place-items-center">
          {(profile.name || t.you).slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  ) : null;

  const stamp = (
    <span
      className={`mt-1 flex items-center justify-end gap-1 font-mono text-[0.58rem] ${
        message.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"
      }`}
    >
      {message.editedAt ? <span className="italic">{t.messageEdited}</span> : null}
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

  const menu = (edge: "start" | "end") => (
    <MessageMenu
      key={edge}
      t={t}
      align={edge}
      canManage={canManage}
      anchorRef={menuAnchorRef}
      insetRef={composerRef}
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

  /** The editor replaces the bubble in place, the way the reference apps do. */
  if (editing) {
    return (
      <div className={`flex items-end gap-2 ${message.fromMe ? "justify-end" : "justify-start"}`}>
        {selfAvatar}
        <div className="flex min-w-0 max-w-[80%] flex-col items-end gap-1.5 sm:max-w-[65%]">
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
      <div className={`flex items-end gap-2 ${message.fromMe ? "justify-end" : "justify-start"}`}>
        {selfAvatar}
        <div className="flex max-w-[70%] flex-col items-center">
          <span className="rounded-2xl border border-dashed border-border/70 px-4 py-2 text-center text-[0.75rem] text-muted-foreground italic">
            {t.messageDeleted}
          </span>
        </div>
      </div>
    );
  }

  // A sticker is drawn large and without bubble chrome, the way Viber and
  // WhatsApp show them, so it reads as artwork rather than as a short message.
  const stickerId = stickerIdFromText(message.text);
  if (images.length === 0 && files.length === 0 && stickerId) {
    const asset = stickerFromText(message.text);
    return (
      <div
        className={`group flex items-end gap-2 ${message.fromMe ? "justify-end" : "justify-start"}`}
      >
        {selfAvatar}
        <div className="flex max-w-[55%] flex-col items-center">
          {asset ? (
            <img
              src={asset.url}
              alt={asset.name}
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
          {stamp}
        </div>
        {menu(message.fromMe ? "end" : "start")}
      </div>
    );
  }

  if (images.length === 0 && files.length === 0 && isStickerText(message.text)) {
    return (
      <div
        className={`group flex items-end gap-2 ${message.fromMe ? "justify-end" : "justify-start"}`}
      >
        {selfAvatar}
        <div className="flex max-w-[55%] flex-col items-center">
          <span className="text-[4.5rem] leading-[1.05] drop-shadow-sm sm:text-6xl">
            {message.text}
          </span>
          {stamp}
        </div>
        {menu(message.fromMe ? "end" : "start")}
      </div>
    );
  }

  const links = splitMessageLinks(message.text).filter((part) => part.kind === "link");
  const firstLink = links[0]?.value;

  return (
    <div
      className={`group flex items-end gap-1 ${message.fromMe ? "justify-end" : "justify-start"}`}
    >
      {message.fromMe ? menu("end") : selfAvatar}
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[0.88rem] leading-relaxed font-normal sm:max-w-[65%] ${
          message.fromMe
            ? "rounded-br-md bg-brand text-primary-foreground"
            : "rounded-bl-md border border-border/60 bg-surface-2 text-foreground"
        }`}
      >
        {images.length > 0 ? (
          <div className="mb-1.5 grid grid-cols-2 gap-1.5">
            {images.map((attachment) => {
              const src = source(attachment);
              if (!src) {
                return (
                  <span
                    key={attachment.id}
                    className="col-span-2 flex items-center gap-2 rounded-xl border border-current/20 px-3 py-2 text-[0.7rem] opacity-70"
                  >
                    <ImageIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{attachment.name}</span>
                  </span>
                );
              }
              return (
                <a
                  key={attachment.id}
                  href={src}
                  download={attachment.name}
                  target="_blank"
                  rel="noreferrer"
                  className="group block overflow-hidden rounded-xl"
                >
                  <span
                    style={{ backgroundImage: `url("${src}")` }}
                    className="block h-28 w-full bg-cover bg-center transition-opacity group-hover:opacity-80"
                  />
                </a>
              );
            })}
          </div>
        ) : null}

        {files.length > 0 ? (
          <div className="mb-1.5 grid gap-1.5">
            {files.map((attachment) => {
              const href = source(attachment);
              return (
                <a
                  key={attachment.id}
                  href={href || undefined}
                  download={attachment.name}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 transition-opacity ${
                    href ? "hover:opacity-80" : "opacity-70"
                  } ${message.fromMe ? "bg-black/15" : "border border-border/60 bg-background/40"}`}
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
                  {href ? <Download className="size-3.5 shrink-0 opacity-70" /> : null}
                </a>
              );
            })}
          </div>
        ) : null}

        <span className="whitespace-pre-wrap break-words">
          {splitMessageLinks(message.text).map((part, index) =>
            part.kind === "link" ? (
              <a
                key={`${part.value}-${index}`}
                href={part.value}
                target="_blank"
                rel="noreferrer noopener"
                className={`font-medium underline underline-offset-2 hover:opacity-80 ${
                  message.fromMe ? "text-primary-foreground" : "text-brand"
                }`}
              >
                {part.value}
              </a>
            ) : (
              <span key={`t-${index}`}>{part.value}</span>
            ),
          )}
        </span>

        {/* One compact card for the first link, so the reader sees where it
            goes without leaving the conversation. */}
        {firstLink && !message.fromMe ? (
          <a
            href={firstLink}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1.5 flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 transition-colors hover:bg-background/70"
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

        {stamp}
      </div>
      {message.fromMe ? selfAvatar : menu("start")}
    </div>
  );
}
