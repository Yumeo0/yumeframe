import { useStore } from "@tanstack/react-store";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import nodeData from "@/data/nodeData.json";
import { calculateMasterySummary } from "@/lib/mastery.utils";
import { appStore } from "@/store/appStore";

interface NodeXpData {
	nodeXP?: Record<string, number>;
}

function formatNumber(value: number): string {
	return value.toLocaleString();
}

interface LevelableMasteryItem {
	key: string;
	name: string;
	imageUrl: string;
	category: "Warframe" | "Weapon" | "Companion";
	currentLevel: number;
	maxLevel: number;
	remainingMasteryXp: number;
}

function getMaxAffinityForLevel(level: number, isWeapon: boolean): number {
	const frameOrCompanionAffinity = 1000 * level ** 2;
	return isWeapon ? frameOrCompanionAffinity / 2 : frameOrCompanionAffinity;
}

function getRankFromAffinity(xp: number, isWeapon: boolean): number {
	const normalizedXp = Math.max(0, xp);
	return isWeapon
		? Math.floor(Math.sqrt((2 * normalizedXp) / 1000))
		: Math.floor(Math.sqrt(normalizedXp / 1000));
}

function getRemainingMasteryXp(
	xp: number,
	maxLevel: number,
	isWeapon: boolean,
): number {
	const masteryPerRank = isWeapon ? 100 : 200;
	const maxAffinity = getMaxAffinityForLevel(maxLevel, isWeapon);
	const clampedXp = Math.min(Math.max(0, xp), maxAffinity);
	const currentRank = Math.min(
		maxLevel,
		getRankFromAffinity(clampedXp, isWeapon),
	);
	return Math.max(0, (maxLevel - currentRank) * masteryPerRank);
}

export function MasteryHelperPage() {
	const inventory = useStore(appStore, (state) => state.inventory);
	const warframes = useStore(appStore, (state) => state.warframes);
	const weapons = useStore(appStore, (state) => state.weapons);
	const companions = useStore(appStore, (state) => state.companions);
	const [open, setOpen] = useState(false);

	const nodeXpByTag = useMemo(() => {
		const data = nodeData as NodeXpData;
		return data.nodeXP ?? {};
	}, []);

	const summary = useMemo(
		() =>
			calculateMasterySummary({
				warframes,
				weapons,
				companions,
				inventoryRaw: inventory,
				nodeXpByTag,
			}),
		[warframes, weapons, companions, inventory, nodeXpByTag],
	);

	const masteryIconSrc =
		summary.masteryRank <= 0
			? "/mastery/Unranked.png"
			: summary.masteryRank <= 51
				? `/mastery/IconRank${summary.masteryRank}.png`
				: "/mastery/LegendaryIcon.png";

	const nextRankProgress =
		summary.pointsRequiredForNextRank > 0
			? Math.min(
					100,
					Math.max(
						0,
						(summary.pointsIntoCurrentRank /
							summary.pointsRequiredForNextRank) *
							100,
					),
				)
			: 100;

	const levelableItems = useMemo<LevelableMasteryItem[]>(() => {
		const warframeItems: LevelableMasteryItem[] = warframes
			.filter((item) => item.owned)
			.map((item) => {
				const maxLevel = item.maxLevel;
				const currentLevel = Math.min(
					maxLevel,
					getRankFromAffinity(item.xp, false),
				);
				const remainingMasteryXp = getRemainingMasteryXp(
					item.xp,
					maxLevel,
					false,
				);

				return {
					key: `warframe:${item.type}`,
					name: item.displayName.replace("<ARCHWING> ", ""),
					imageUrl: item.imageUrl,
					category: "Warframe" as const,
					currentLevel,
					maxLevel,
					remainingMasteryXp,
				};
			})
			.filter((item) => item.remainingMasteryXp > 0);

		const weaponItems: LevelableMasteryItem[] = weapons
			.filter((item) => item.owned)
			.map((item) => {
				const maxLevel =
					(item as { maxLevel?: number }).maxLevel ?? item.maxLevelCap ?? 30;
				const currentLevel = Math.min(
					maxLevel,
					getRankFromAffinity(item.xp, true),
				);
				const remainingMasteryXp = getRemainingMasteryXp(
					item.xp,
					maxLevel,
					true,
				);

				return {
					key: `weapon:${item.type}`,
					name: item.displayName.replace("<ARCHWING> ", ""),
					imageUrl: item.imageUrl,
					category: "Weapon" as const,
					currentLevel,
					maxLevel,
					remainingMasteryXp,
				};
			})
			.filter((item) => item.remainingMasteryXp > 0);

		const companionItems: LevelableMasteryItem[] = companions
			.filter((item) => item.owned)
			.map((item) => {
				const maxLevel = 30;
				const currentLevel = Math.min(
					maxLevel,
					getRankFromAffinity(item.xp, false),
				);
				const remainingMasteryXp = getRemainingMasteryXp(
					item.xp,
					maxLevel,
					false,
				);

				return {
					key: `companion:${item.type}`,
					name: item.displayName,
					imageUrl: item.imageUrl,
					category: "Companion" as const,
					currentLevel,
					maxLevel,
					remainingMasteryXp,
				};
			})
			.filter((item) => item.remainingMasteryXp > 0);

		return [...warframeItems, ...weaponItems, ...companionItems].sort(
			(a, b) =>
				b.remainingMasteryXp - a.remainingMasteryXp ||
				a.name.localeCompare(b.name),
		);
	}, [warframes, weapons, companions]);

	const totalLevelableMasteryXp = useMemo(
		() =>
			levelableItems.reduce(
				(total, item) => total + item.remainingMasteryXp,
				0,
			),
		[levelableItems],
	);

	if (!inventory) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Mastery Helper</CardTitle>
					<CardDescription>
						Load your inventory first from the Foundry tab.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0 gap-2 pb-2">
			<Card>
				<CardContent>
					<div className="flex items-center gap-3">
						<div className="relative w-fit shrink-0">
							<img
								src={masteryIconSrc}
								alt={`Mastery rank ${summary.masteryRank}`}
								className="object-contain w-20 h-20"
							/>
							<div className="absolute inset-0 flex items-end justify-center pb-1 -bottom-2">
								<span className="rounded bg-background/80 px-1.5 text-sm font-semibold">
									MR {summary.masteryRank}
								</span>
							</div>
						</div>

						<div className="flex-1 min-w-0">
							<p className="mt-2 text-sm text-muted-foreground">
								Next Rank Progress
							</p>
							<Progress value={nextRankProgress} className="mt-2" />
							<p className="mt-1 text-lg font-semibold">
								{formatNumber(summary.pointsIntoCurrentRank)} /{" "}
								{formatNumber(summary.pointsRequiredForNextRank)}
							</p>
							<p className="text-xs text-muted-foreground">
								{nextRankProgress.toFixed(1)}% •{" "}
								{formatNumber(summary.pointsRemainingForNextRank)} points
								remaining
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
			<Card className={`pt-3 ${open ? "pb-6" : "pb-2"}`}>
				<Collapsible onOpenChange={setOpen} defaultOpen={false}>
					<CardHeader className="pb-0">
						<CollapsibleTrigger
							className={`group flex w-full items-center justify-between text-left py-3`}
						>
							<CardTitle>Mastery XP by Category</CardTitle>
							<ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
						</CollapsibleTrigger>
					</CardHeader>
					<CollapsibleContent>
						<CardContent className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Warframes</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.warframes)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Primary Weapons</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.primaryWeapons)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">
									Secondary Weapons
								</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.secondaryWeapons)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Melee Weapons</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.meleeWeapons)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Missions</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.missions)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">
									Steel Path Missions
								</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.steelPathMissions)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">
									Railjack Intrinsics
								</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.railjackIntrinsics)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">
									Drifter Intrinsics
								</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.drifterIntrinsics)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Sentinels</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.sentinels)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">
									Sentinel Weapons
								</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.sentinelWeapons)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Companions</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.companions)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Archwing</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.archwing)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Archgun</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.archgun)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Archmelee</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.archmelee)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Amps</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.amps)}
								</p>
							</div>
							<div className="p-3 border rounded">
								<p className="text-sm text-muted-foreground">Necramechs</p>
								<p className="text-lg font-semibold">
									{formatNumber(summary.categoryXp.necramechs)}
								</p>
							</div>
						</CardContent>
					</CollapsibleContent>
				</Collapsible>
			</Card>

			<Card className="flex flex-col flex-1 min-h-0">
				<CardHeader>
					<CardTitle>Owned Items You Can Still Level</CardTitle>
					<CardDescription>
						{formatNumber(levelableItems.length)} items •{" "}
						{formatNumber(totalLevelableMasteryXp)} potential mastery XP
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col flex-1 min-h-0">
					{levelableItems.length > 0 ? (
						<ScrollArea className="w-full h-full rounded-md">
							<div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
								{levelableItems.map((item) => (
									<Card key={item.key} className="py-3 bg-muted/70">
										<CardContent>
											<div className="flex items-center justify-between gap-3">
												<img
													src={item.imageUrl}
													alt={item.name}
													className="object-cover w-16 h-16 rounded-md"
												/>
												<div className="flex-1 min-w-0">
													<p className="font-semibold truncate">{item.name}</p>
													<p className="mt-1 text-sm text-muted-foreground">
														Level {item.currentLevel} / {item.maxLevel}
													</p>
													<p className="text-sm font-semibold">
														+{formatNumber(item.remainingMasteryXp)} mastery XP
													</p>
												</div>
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						</ScrollArea>
					) : (
						<p className="text-sm text-muted-foreground">
							No owned items with remaining mastery XP found.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
