export interface TabOption {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: TabOption[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function TabBar({ tabs, activeKey, onChange }: TabBarProps) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const className = [
          "tab-pill",
          isActive ? "tab-pill-active" : "tab-pill-inactive"
        ].join(" ");
        return (
          <button
            type="button"
            key={tab.key}
            className={className}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

