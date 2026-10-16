import { useSiteSettings } from "./theme";
import { DinoGame } from "../games/DinoGame";

type ChromeOfflineProps = {
  title?: string;
  subtitle?: string;
  code?: string;
};

export function ChromeOffline({ title, subtitle, code }: ChromeOfflineProps) {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const t = isBg
    ? {
        hint: "Натиснете интервал, за да играете",
        title: "Няма интернет",
        subtitle: "Няма достъп до интернет за тази страница.",
        tryTitle: "Опитайте да я презаредите:",
        tryList: [
          "Проверете мрежовите кабели, модема или рутера.",
          "Свържете се отново с Wi-Fi.",
          "Пуснете отново или включете рутера и модема си.",
        ],
        probeTitle: "Проучваме проблема:",
        probeList: ["Проверете DNS настройките си."],
        code: "DNS_PROBE_FINISHED_NO_INTERNET",
      }
    : isZh
      ? {
          hint: "按空格键开始游戏",
          title: "无法访问互联网",
          subtitle: "此页面无法访问互联网。",
          tryTitle: "尝试重新加载：",
          tryList: [
            "检查网络电缆、调制解调器和路由器。",
            "重新连接到 Wi-Fi。",
            "重新打开或开启路由器和调制解调器。",
          ],
          probeTitle: "进一步排查问题：",
          probeList: ["检查 DNS 设置。"],
          code: "DNS_PROBE_FINISHED_NO_INTERNET",
        }
      : {
          hint: "Press space to play",
          title: "No internet",
          subtitle: "There is no internet connection for this page.",
          tryTitle: "Try reloading:",
          tryList: [
            "Check network cables, modem, and router.",
            "Reconnect to Wi-Fi.",
            "Turn router or modem back on.",
          ],
          probeTitle: "Still not connected? Let's take a closer look:",
          probeList: ["Check your DNS settings."],
          code: "DNS_PROBE_FINISHED_NO_INTERNET",
        };

  return (
    <div className="min-h-screen bg-white px-6 py-20 text-[#202124]">
      <div
        className="mx-auto max-w-[560px]"
        style={{ fontFamily: '-apple-system, "Segoe UI", Roboto, Arial, system-ui, sans-serif' }}
      >
        <div className="mb-8 flex items-center gap-5">
          <svg
            viewBox="0 0 104 62"
            width="104"
            height="57"
            aria-hidden="true"
            shapeRendering="crispEdges"
          >
            <g fill="#5f6368">
              <rect x="6" y="40" width="26" height="22" />
              <rect x="22" y="20" width="24" height="24" />
              <rect x="0" y="52" width="12" height="14" />
              <rect x="10" y="52" width="6" height="16" />
              <rect x="20" y="58" width="6" height="18" />
            </g>
            <rect x="36" y="26" width="8" height="8" fill="#ffffff" />
            <rect x="40" y="28" width="4" height="4" fill="#202124" />
            <line x1="0" y1="58" x2="104" y2="58" stroke="#c6c6c6" strokeWidth="2" />
          </svg>
          <p className="text-sm text-[#5f6368]">{t.hint}</p>
        </div>

        <h1 className="text-[22px] font-medium">{title ?? t.title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[#5f6368]">{subtitle ?? t.subtitle}</p>

        <div className="mt-7">
          <h2 className="text-sm font-medium text-[#3c4043]">{t.tryTitle}</h2>
          <ul className="mt-1.5 list-none p-0">
            {t.tryList.map((item) => (
              <li key={item} className="mt-2 text-sm leading-snug text-[#5f6368]">
                <span className="mr-1.5 text-[#5f6368]">—</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-medium text-[#3c4043]">{t.probeTitle}</h2>
          <ul className="mt-1.5 list-none p-0">
            {t.probeList.map((item) => (
              <li key={item} className="mt-2 text-sm leading-snug text-[#5f6368]">
                <span className="mr-1.5 text-[#5f6368]">—</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-7 inline-block rounded-md bg-[#f1f3f4] px-3.5 py-2.5 font-mono text-[13px] text-[#202124]">
          {code ?? t.code}
        </p>

        <div className="mt-10">
          <DinoGame variant="chrome" />
        </div>
      </div>
    </div>
  );
}
