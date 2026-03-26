import { Button } from "@/components/ui/button";

export type SettingsSection =
	| "general"
	| "relic-scanner"
	| "inventory-sync"
	| "ee-log-path"
	| "debug-tools"
	| "data-inspector";

interface SettingsSidebarProps {
	activeSection: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
	onExitSettings: () => void;
}

const GENERAL_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
	{ id: "general", label: "General" },
	{ id: "relic-scanner", label: "Relic Scanner" },
	{ id: "inventory-sync", label: "Inventory" },
	{ id: "ee-log-path", label: "EE.log Path" },
];

const ADVANCED_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
	{ id: "debug-tools", label: "Debug Tools" },
	{ id: "data-inspector", label: "Data Inspector" },
];

function SectionButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			variant={active ? "default" : "ghost"}
			className="justify-center w-full px-2 md:justify-start md:px-3"
			onClick={onClick}
		>
			<span className="hidden md:inline">{label}</span>
			<span className="md:hidden">{label.slice(0, 1)}</span>
		</Button>
	);
}

export function SettingsSidebar({
	activeSection,
	onSectionChange,
	onExitSettings,
}: SettingsSidebarProps) {
	return (
		<aside className="flex w-14 shrink-0 flex-col border-r bg-card p-2 transition-[width] duration-150 md:w-56">
			<div className="flex items-center justify-center gap-3 px-2 py-3 mb-4 md:justify-start">
				<span
					aria-hidden="true"
					className="size-8 shrink-0 bg-foreground"
					style={{
						maskImage: 'url("/icons/icon_settings.svg")',
						WebkitMaskImage: 'url("/icons/icon_settings.svg")',
						maskRepeat: "no-repeat",
						WebkitMaskRepeat: "no-repeat",
						maskPosition: "center",
						WebkitMaskPosition: "center",
						maskSize: "contain",
						WebkitMaskSize: "contain",
					}}
				/>
				<h1 className="hidden text-2xl font-bold md:block">Settings</h1>
			</div>

			<nav className="flex flex-col justify-between h-full gap-4">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<p className="hidden px-3 text-xs font-medium tracking-wide uppercase text-muted-foreground md:block">
							General
						</p>
						{GENERAL_SECTIONS.map((section) => (
							<SectionButton
								key={section.id}
								active={activeSection === section.id}
								label={section.label}
								onClick={() => onSectionChange(section.id)}
							/>
						))}
					</div>
					<div className="flex flex-col gap-2">
						<p className="hidden px-3 text-xs font-medium tracking-wide uppercase text-muted-foreground md:block">
							Advanced
						</p>
						{ADVANCED_SECTIONS.map((section) => (
							<SectionButton
								key={section.id}
								active={activeSection === section.id}
								label={section.label}
								onClick={() => onSectionChange(section.id)}
							/>
						))}
					</div>
				</div>

				<Button
					variant="outline"
					className="justify-center w-full px-2 md:justify-start md:px-3"
					onClick={onExitSettings}
				>
					<span className="hidden md:inline">Back to App</span>
					<span className="md:hidden">Back</span>
				</Button>
			</nav>
		</aside>
	);
}