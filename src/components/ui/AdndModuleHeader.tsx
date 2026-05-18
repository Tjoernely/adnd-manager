/**
 * AdndModuleHeader — the campaign dashboard's signature top banner, reusable
 * across modules: the small "AD&D 2nd Edition ✦ Skills & Powers" edition
 * label, a centered gold title with optional icon, an optional subtitle, and
 * the ornate diamond divider (reuses the global `.adnd-divider` class).
 */

interface AdndModuleHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
}

export function AdndModuleHeader({ title, subtitle, icon }: AdndModuleHeaderProps) {
  return (
    <div className="adnd-module-header">
      <div className="adnd-module-header__edition">
        AD&amp;D 2nd Edition ✦ Skills &amp; Powers
      </div>
      <h1 className="adnd-module-header__title">
        {icon && <span className="adnd-module-header__icon" aria-hidden="true">{icon}</span>}
        {title}
      </h1>
      {subtitle && <div className="adnd-module-header__subtitle">{subtitle}</div>}
      <div className="adnd-divider" aria-hidden="true">
        <span /><span>◆</span><span />
      </div>
    </div>
  );
}

export default AdndModuleHeader;
