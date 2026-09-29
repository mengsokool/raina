import { Globe2, LockKeyhole, Pause } from "lucide-react";
import {
  SHARE_ACCESS_OPTIONS,
  type ShareAccessOption,
} from "../../../web/src/routes/dashboards/components/share-access-options";

const icons = {
  public: Globe2,
  users_only: LockKeyhole,
  disabled: Pause,
} satisfies Record<ShareAccessOption, typeof Globe2>;

const explanations = {
  public: "Anyone with the link can view.",
  users_only: "Only signed-in people you allow can view.",
  disabled: "The link stops opening until you resume it.",
} satisfies Record<ShareAccessOption, string>;

export function ShareAccessSection() {
  return (
    <section id="sharing" className="site-sharing border-b border-border">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-24">
        <div className="site-share-intro">
          <h2 className="site-section-heading max-w-[12ch] font-display font-bold text-foreground">
            Share a live view.
          </h2>
          <p className="mt-6 max-w-[37ch] text-lg leading-relaxed text-[#365314]">
            Send a dashboard link to anyone. Choose who can open it. Device controls stay separate.
          </p>
        </div>

        <ul className="site-share-list">
          {SHARE_ACCESS_OPTIONS.map((option) => {
            const Icon = icons[option.id];
            return (
              <li key={option.id} className="site-share-row">
                <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                <div>
                  <h3>{option.title}</h3>
                  <p>{explanations[option.id]}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
