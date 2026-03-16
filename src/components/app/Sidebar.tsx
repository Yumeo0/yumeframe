import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClockTime } from "@/lib/datetime.utils";

type Tab =
	| "foundry"
	| "mastery-helper"
	| "relic-planner"
	| "relic-scanner"
	| "worldstate"
	| "settings";

interface SidebarProps {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
	onRefresh: () => void;
	refreshLoading: boolean;
	lastRefreshAt: number | null;
	use24HourClock: boolean;
	inventoryError?: string;
}

export function Sidebar({
	activeTab,
	onTabChange,
	onRefresh,
	refreshLoading,
	lastRefreshAt,
	use24HourClock,
	inventoryError,
}: SidebarProps) {
	const lastRefreshLabel = lastRefreshAt
		? formatClockTime(lastRefreshAt, use24HourClock)
		: "Never";

	return (
		<aside className="flex w-14 shrink-0 flex-col border-r bg-card p-2 transition-[width] duration-150 md:w-56">
			<div className="flex items-center justify-center gap-3 px-2 py-3 mb-4 md:justify-start">
				<span
					aria-hidden="true"
					className={`h-8 w-8 shrink-0 bg-foreground`}
					style={{
						maskImage: 'url("/icons/icon_warframe.svg")',
						WebkitMaskImage: 'url("/icons/icon_warframe.svg")',
						maskRepeat: "no-repeat",
						WebkitMaskRepeat: "no-repeat",
						maskPosition: "center",
						WebkitMaskPosition: "center",
						maskSize: "contain",
						WebkitMaskSize: "contain",
					}}
				/>
				<h1 className="hidden text-2xl font-bold md:block">YumeFrame</h1>
			</div>

			<nav className="flex flex-col justify-between h-full gap-4">
				<div className="space-y-2">
					<Button
						variant={activeTab === "foundry" ? "default" : "ghost"}
						className="justify-center w-full gap-2 px-2 md:justify-start md:px-3"
						aria-label="Foundry"
						onClick={() => onTabChange("foundry")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${activeTab === "foundry" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_foundry.svg")',
								WebkitMaskImage: 'url("/icons/icon_foundry.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span className="hidden md:inline">Foundry</span>
					</Button>
					<Button
						variant={activeTab === "mastery-helper" ? "default" : "ghost"}
						className="justify-center w-full gap-2 px-2 md:justify-start md:px-3"
						aria-label="Mastery Helper"
						onClick={() => onTabChange("mastery-helper")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${activeTab === "mastery-helper" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_mastery.svg")',
								WebkitMaskImage: 'url("/icons/icon_mastery.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span className="hidden md:inline">Mastery Helper</span>
					</Button>
					<Button
						variant={activeTab === "relic-planner" ? "default" : "ghost"}
						className="justify-center w-full gap-2 px-2 md:justify-start md:px-3"
						aria-label="Relic Planner"
						onClick={() => onTabChange("relic-planner")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${activeTab === "relic-planner" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_relic.svg")',
								WebkitMaskImage: 'url("/icons/icon_relic.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span className="hidden md:inline">Relic Planner</span>
					</Button>
					<Button
						variant={activeTab === "relic-scanner" ? "default" : "ghost"}
						className="justify-center w-full gap-2 px-2 md:justify-start md:px-3"
						aria-label="Relic Scanner"
						onClick={() => onTabChange("relic-scanner")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${activeTab === "relic-scanner" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_reactant.svg")',
								WebkitMaskImage: 'url("/icons/icon_reactant.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span className="hidden md:inline">Relic Scanner</span>
					</Button>
					<Button
						variant={activeTab === "worldstate" ? "default" : "ghost"}
						className="justify-center w-full gap-2 px-2 md:justify-start md:px-3"
						aria-label="Worldstate"
						onClick={() => onTabChange("worldstate")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${activeTab === "worldstate" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_appearance.svg")',
								WebkitMaskImage: 'url("/icons/icon_appearance.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span className="hidden md:inline">Worldstate</span>
					</Button>
				</div>
				<div className="space-y-2">
					<p className="hidden px-3 text-xs text-muted-foreground md:block">
						Last refresh: {lastRefreshLabel}
					</p>
					{inventoryError ? (
						<p className="hidden px-3 text-xs text-destructive md:block">
							{inventoryError}
						</p>
					) : null}
					<Button
						variant="secondary"
						onClick={onRefresh}
						disabled={refreshLoading}
						className="justify-center w-full gap-2 px-2 md:justify-start md:px-3"
					>
						{refreshLoading ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<RefreshCw className="w-4 h-4" />
						)}
						<span className="hidden md:inline">
							{refreshLoading ? "Loading..." : "Refresh Inventory"}
						</span>
					</Button>
					<Button
						variant={activeTab === "settings" ? "default" : "ghost"}
						className="justify-center w-full gap-2 px-2 md:justify-start md:px-3"
						aria-label="Settings"
						onClick={() => onTabChange("settings")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${activeTab === "settings" ? "bg-primary-foreground" : "bg-foreground"}`}
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
						<span className="hidden md:inline">Settings</span>
					</Button>
				</div>
			</nav>
		</aside>
	);
}
