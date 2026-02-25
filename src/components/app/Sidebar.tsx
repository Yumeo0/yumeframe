import { Button } from "@/components/ui/button";

type Tab = "foundry" | "mastery-helper" | "relic-planner" | "settings";

interface SidebarProps {
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
	return (
		<aside className="w-56 border-r bg-card p-2 flex flex-col">
			<div className="flex items-center gap-3 px-2 py-3 mb-4 justify-center">
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
				<h1 className="text-2xl font-bold">YumeFrame</h1>
			</div>

			<nav className="flex flex-col justify-between h-full">
				<div className="space-y-2">
					
				<Button
					variant={activeTab === "foundry" ? "default" : "ghost"}
					className="w-full justify-start gap-2"
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
					Foundry
				</Button>
				<Button
					variant={activeTab === "mastery-helper" ? "default" : "ghost"}
					className="w-full justify-start gap-2"
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
					Mastery Helper
				</Button>
				<Button
					variant={activeTab === "relic-planner" ? "default" : "ghost"}
					className="w-full justify-start gap-2"
					onClick={() => onTabChange("relic-planner")}
				>
					<span
						aria-hidden="true"
						className={`h-6 w-6 shrink-0 ${activeTab === "relic-planner" ? "bg-primary-foreground" : "bg-foreground"}`}
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
					Relic Planner
				</Button>
				</div>
				<Button
					variant={activeTab === "settings" ? "default" : "ghost"}
					className="w-full justify-start gap-2"
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
					Settings
				</Button>
			</nav>
		</aside>
	);
}
