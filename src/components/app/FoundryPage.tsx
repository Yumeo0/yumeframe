import { useStore } from "@tanstack/react-store";
import { useEffect, useMemo, useState } from "react";
import { CraftingTreeModal } from "@/components/app/CraftingTreeModal";
import type {
	CollectionItem,
	CollectionPart,
} from "@/components/app/foundry.types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime } from "@/lib/datetime.utils";
import { appStore, setAppFoundryFilter } from "@/store/appStore";

export type FoundryFilter =
	| "warframes"
	| "archwings"
	| "primary"
	| "secondary"
	| "melee"
	| "modular"
	| "companions"
	| "pending";

interface FoundryPageProps {
	error: string;
}

interface PendingRecipeItem {
	itemType: string;
	resultType: string;
	name: string;
	imageUrl: string;
	completionTimestamp: number;
	buildTime?: number;
}

function getTotalAffinityForLevel(level: number, isWeapon: boolean): number {
	const frameOrSentinelAffinity = 1000 * level ** 2;
	return isWeapon ? frameOrSentinelAffinity / 2 : frameOrSentinelAffinity;
}

function isItemMastered(item: CollectionItem): boolean {
	return item.xp >= getTotalAffinityForLevel(item.maxLevel, item.isWeapon);
}

interface CollectionSectionProps {
	items: CollectionItem[];
	loading: boolean;
	emptyLoadingText: string;
	emptyIdleText: string;
	onOpenCraftingTree: (item: CollectionItem) => void;
}

function CollectionSection({
	items,
	loading,
	emptyLoadingText,
	emptyIdleText,
	onOpenCraftingTree,
}: CollectionSectionProps) {
	return (
		<div>
			{items.length > 0 ? (
				<div className="grid grid-cols-1 gap-2 p-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
					{items.map((item) =>
						(() => {
							const mastered = isItemMastered(item);
							const requiredAffinity = getTotalAffinityForLevel(
								item.maxLevel,
								item.isWeapon,
							);

							return (
								<Card
									key={item.key}
									className={`group/card relative overflow-hidden transition-all hover:shadow-lg ${item.owned ? "ring-2 ring-green-500/50 bg-green-500/20" : item.isCraftingRecipe ? "ring-2 ring-amber-500/60 bg-amber-500/15" : ""} py-3 gap-0`}
								>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										onClick={() => onOpenCraftingTree(item)}
										className="absolute z-20 transition-opacity opacity-0 right-2 bottom-2 group-hover/card:opacity-100"
									>
										Crafting Tree
									</Button>
									<CardHeader>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<CardTitle className="text-lg">
													{item.displayName}
												</CardTitle>
											</div>
											<div className="inline-flex items-center gap-1.5 mb-2 text-sm text-muted-foreground">
												{item.isSubsumed !== undefined ? (
													<span
														title={item.isSubsumed ? "Already subsumed" : "Not subsumed yet"}
														className="inline-flex"
													>
														<span
															aria-hidden="true"
															className="relative inline-block w-6 h-6 shrink-0"
														>
															{item.isSubsumed ? (
																<span className="absolute inset-0 rounded-full bg-red-500/60 blur-sm" />
															) : null}
															<span
																className={`relative inline-block h-6 w-6 ${item.isSubsumed ? "bg-primary" : "bg-muted"}`}
																style={{
																	maskImage: 'url("/icons/helminth/icon_empower.svg")',
																	WebkitMaskImage: 'url("/icons/helminth/icon_empower.svg")',
																	maskRepeat: "no-repeat",
																	WebkitMaskRepeat: "no-repeat",
																	maskPosition: "center",
																	WebkitMaskPosition: "center",
																	maskSize: "contain",
																	WebkitMaskSize: "contain",
																}}
															/>
														</span>
													</span>
												) : null}
												<span
													title={`${mastered ? "Mastered" : "Not mastered"} (${item.xp}/${requiredAffinity} Affinity, max level ${item.maxLevel})`}
													className="inline-flex"
												>
													<span
														aria-hidden="true"
														className="relative inline-block w-6 h-6 shrink-0"
													>
														{mastered ? (
															<span className="absolute inset-0 rounded-full bg-green-500/60 blur-sm" />
														) : null}
														<span
															className={`relative inline-block h-6 w-6 ${mastered ? "bg-primary" : "bg-muted"}`}
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
													</span>
												</span>
											</div>
										</div>
									</CardHeader>
									<CardContent>
										<div className="flex items-start justify-between gap-2">
											<div className="shrink-0">
												<img
													src={item.imageUrl}
													alt={item.name}
													className="object-cover w-24 h-24 rounded-md"
												/>
											</div>

											<div className="flex-1">
												{item.parts.length > 0 ? (
													<div className="grid grid-cols-3 gap-2">
														{item.parts.map((part, index) => (
															<div
																key={`${item.key}-${part.name}-${index}`}
																className="relative flex justify-center group"
																title={`${part.name}${part.count ? ` x${part.count}` : ""}${part.owned === undefined ? "" : `: ${part.hasRecipe ? "Recipe owned" : part.owned ? "Owned" : "Missing"}`}`}
															>
																<img
																	src={part.imageUrl}
																	alt={part.name}
																	className={`w-12 aspect-square rounded object-cover ${part.owned === undefined ? "border" : part.isCraftingRecipe ? "border-2 border-amber-500/70 bg-amber-500/10" : part.hasRecipe ? "border-2 border-primary/60" : part.owned ? "border-2 border-green-500/50" : "border-2 border-muted opacity-50"}`}
																/>
																{part.count ? (
																	<span className="absolute -bottom-1 left-1/2 min-w-5 h-5 px-1 rounded bg-secondary text-secondary-foreground text-[10px] flex items-center justify-center">
																		x{part.count}
																	</span>
																) : null}
																<span className="absolute px-2 py-1 mb-2 text-xs transition-opacity transform -translate-x-1/2 rounded opacity-0 pointer-events-none bottom-full left-1/2 bg-popover text-popover-foreground whitespace-nowrap group-hover:opacity-100">
																	{part.name}
																</span>
															</div>
														))}
													</div>
												) : null}
											</div>
										</div>
									</CardContent>
								</Card>
							);
						})(),
					)}
				</div>
			) : (
				<Card>
					<CardContent className="pt-6 text-center text-muted-foreground">
						{loading ? emptyLoadingText : emptyIdleText}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function formatRemainingTime(msRemaining: number): string {
	if (msRemaining <= 0) {
		return "Ready";
	}

	const totalSeconds = Math.floor(msRemaining / 1000);
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (days > 0) {
		return `${days}d ${hours}h ${minutes}m`;
	}

	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	}

	return `${minutes}m ${seconds}s`;
}

interface PendingRecipesSectionProps {
	pendingRecipes: PendingRecipeItem[];
	now: number;
	loading: boolean;
	use24HourClock: boolean;
}

function PendingRecipesSection({
	pendingRecipes,
	now,
	loading,
	use24HourClock,
}: PendingRecipesSectionProps) {
	return (
		<div>
			{pendingRecipes.length > 0 ? (
				<div className="grid grid-cols-1 gap-2 p-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{pendingRecipes.map((recipe) => {
						const recipeKey = `${recipe.itemType}-${recipe.completionTimestamp}`;
						const remaining = recipe.completionTimestamp - now;
						const isReady = remaining <= 0;
						const totalBuildTimeMs =
							typeof recipe.buildTime === "number" && recipe.buildTime > 0
								? recipe.buildTime * 1000
								: 0;
						const progressValue =
							isReady || totalBuildTimeMs <= 0
								? 100
								: Math.min(
										100,
										Math.max(
											0,
											((totalBuildTimeMs - Math.max(remaining, 0)) /
												totalBuildTimeMs) *
												100,
										),
								  );

						return (
							<Card
								key={recipeKey}
								className={`overflow-hidden py-3 gap-0 ${isReady ? "ring-2 ring-green-500/50 bg-green-500/20" : "ring-2 ring-amber-500/60 bg-amber-500/15"}`}
							>
								<CardHeader>
									<CardTitle className="text-base">{recipe.name}</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex items-center gap-3">
										<img
											src={recipe.imageUrl}
											alt={recipe.name}
											className="object-cover w-16 h-16 rounded-md"
										/>
										<div className="text-sm">
											<p className="font-medium">
												{isReady ? "Ready to claim" : "Crafting"}
											</p>
											<p className="text-muted-foreground">
												{formatRemainingTime(remaining)}
											</p>
											<p className="text-xs text-muted-foreground">
												Done: {formatDateTime(recipe.completionTimestamp, use24HourClock)}
											</p>
											<Progress value={progressValue} className="h-2 mt-2" />
										</div>
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			) : (
				<Card>
					<CardContent className="pt-6 text-center text-muted-foreground">
						{loading
							? "Loading pending recipes..."
							: "No pending recipes found"}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

export function FoundryPage({ error }: FoundryPageProps) {
	const foundryFilter = useStore(appStore, (state) => state.foundryFilter);
	const warframes = useStore(appStore, (state) => state.warframes);
	const weapons = useStore(appStore, (state) => state.weapons);
	const companions = useStore(appStore, (state) => state.companions);
	const pendingRecipes = useStore(appStore, (state) => state.pendingRecipes);
	const use24HourClock = useStore(appStore, (state) => state.use24HourClock);
	const loading = useStore(appStore, (state) => state.inventoryLoading);
	const [now, setNow] = useState(() => Date.now());
	const [craftingTreeItem, setCraftingTreeItem] = useState<CollectionItem | null>(
		null,
	);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setNow(Date.now());
		}, 1000);

		return () => {
			window.clearInterval(timer);
		};
	}, []);

	const pendingRecipeResultTypes = useMemo(
		() => new Set(pendingRecipes.map((recipe) => recipe.resultType)),
		[pendingRecipes],
	);
	const regularWarframes = warframes.filter(
		(wf) => !wf.displayName.startsWith("<ARCHWING>"),
	);
	const archwings = warframes.filter((wf) =>
		wf.displayName.startsWith("<ARCHWING>"),
	);

	const filteredWeapons = weapons.filter(
		(weapon) => weapon.excludeFromCodex !== true,
	);

	const archwingWeapons = filteredWeapons.filter(
		(weapon) =>
			weapon.displayName.startsWith("<ARCHWING>") ||
			weapon.productCategory === "SpaceMelee" ||
			weapon.productCategory === "SpaceGuns",
	);
	const regularWeapons = filteredWeapons.filter(
		(weapon) =>
			!weapon.displayName.startsWith("<ARCHWING>") &&
			weapon.productCategory !== "SpaceMelee" &&
			weapon.productCategory !== "SpaceGuns" &&
			weapon.uniqueName.includes("Modular") === false,
	);

	const mapRequirementToPart = (requirement: CollectionPart): CollectionPart => ({
		name: requirement.name,
		itemType: requirement.itemType,
		count: requirement.count,
		imageUrl: requirement.imageUrl,
		owned: requirement.owned,
		hasRecipe: requirement.hasRecipe,
		isCraftingRecipe: requirement.isCraftingRecipe,
		requirements: requirement.requirements?.map((nestedRequirement) =>
			mapRequirementToPart(nestedRequirement),
		),
	});

	const warframeItems: CollectionItem[] = regularWarframes.map((wf) => ({
		key: wf.type,
		name: wf.name,
		displayName: wf.displayName,
		xp: wf.xp,
		isWeapon: false,
		isSubsumed: wf.isSubsumed,
		maxLevel: wf.maxLevel,
		imageUrl: wf.imageUrl,
		favorite: wf.favorite,
		owned: wf.owned,
		isCraftingRecipe: pendingRecipeResultTypes.has(wf.type),
		parts: wf.parts.map(mapRequirementToPart),
	}));

	const archwingItems: CollectionItem[] = archwings.map((wf) => ({
		key: wf.type,
		name: wf.name,
		displayName: wf.displayName.replace("<ARCHWING> ", ""),
		xp: wf.xp,
		isWeapon: false,
		maxLevel: wf.maxLevel,
		imageUrl: wf.imageUrl,
		favorite: wf.favorite,
		owned: wf.owned,
		isCraftingRecipe: pendingRecipeResultTypes.has(wf.type),
		parts: wf.parts.map(mapRequirementToPart),
	}));

	const archwingWeaponItems: CollectionItem[] = archwingWeapons.map(
		(weapon) => ({
			key: weapon.type,
			name: weapon.name,
			displayName: weapon.displayName.replace("<ARCHWING> ", ""),
			xp: weapon.xp,
			isWeapon: true,
			maxLevel:
				(weapon as { maxLevel?: number }).maxLevel ?? weapon.maxLevelCap ?? 30,
			imageUrl: weapon.imageUrl,
			favorite: weapon.favorite,
			owned: weapon.owned,
			isCraftingRecipe: pendingRecipeResultTypes.has(weapon.type),
			parts: weapon.requirements.map(mapRequirementToPart),
		}),
	);

	const allArchwingItems = [...archwingItems, ...archwingWeaponItems].sort(
		(a, b) => a.displayName.localeCompare(b.displayName),
	);

	const primaryWeapons = regularWeapons.filter(
		(weapon) => weapon.productCategory === "LongGuns",
	);
	const secondaryWeapons = regularWeapons.filter(
		(weapon) => weapon.productCategory === "Pistols",
	);
	const meleeWeapons = regularWeapons.filter(
		(weapon) => weapon.productCategory === "Melee",
	);
	const modularWeapons = filteredWeapons.filter((weapon) =>
		weapon.uniqueName.includes("Modular"),
	);
	const sentinelWeapons = filteredWeapons.filter(
		(weapon) => weapon.productCategory === "SentinelWeapons",
	);

	const primaryItems: CollectionItem[] = primaryWeapons.map((weapon) => ({
		key: weapon.type,
		name: weapon.name,
		displayName: weapon.displayName,
		xp: weapon.xp,
		isWeapon: true,
		maxLevel:
			(weapon as { maxLevel?: number }).maxLevel ?? weapon.maxLevelCap ?? 30,
		imageUrl: weapon.imageUrl,
		favorite: weapon.favorite,
		owned: weapon.owned,
		isCraftingRecipe: pendingRecipeResultTypes.has(weapon.type),
		parts: weapon.requirements.map(mapRequirementToPart),
	}));

	const secondaryItems: CollectionItem[] = secondaryWeapons.map((weapon) => ({
		key: weapon.type,
		name: weapon.name,
		displayName: weapon.displayName,
		xp: weapon.xp,
		isWeapon: true,
		maxLevel:
			(weapon as { maxLevel?: number }).maxLevel ?? weapon.maxLevelCap ?? 30,
		imageUrl: weapon.imageUrl,
		favorite: weapon.favorite,
		owned: weapon.owned,
		isCraftingRecipe: pendingRecipeResultTypes.has(weapon.type),
		parts: weapon.requirements.map(mapRequirementToPart),
	}));

	const meleeItems: CollectionItem[] = meleeWeapons.map((weapon) => ({
		key: weapon.type,
		name: weapon.name,
		displayName: weapon.displayName,
		xp: weapon.xp,
		isWeapon: true,
		maxLevel:
			(weapon as { maxLevel?: number }).maxLevel ?? weapon.maxLevelCap ?? 30,
		imageUrl: weapon.imageUrl,
		favorite: weapon.favorite,
		owned: weapon.owned,
		isCraftingRecipe: pendingRecipeResultTypes.has(weapon.type),
		parts: weapon.requirements.map(mapRequirementToPart),
	}));

	const modularWeaponItems: CollectionItem[] = modularWeapons.map((weapon) => ({
		key: weapon.type,
		name: weapon.name,
		displayName: weapon.displayName,
		xp: weapon.xp,
		isWeapon: true,
		maxLevel:
			(weapon as { maxLevel?: number }).maxLevel ?? weapon.maxLevelCap ?? 30,
		imageUrl: weapon.imageUrl,
		favorite: weapon.favorite,
		owned: weapon.owned,
		isCraftingRecipe: pendingRecipeResultTypes.has(weapon.type),
		parts: weapon.requirements.map(mapRequirementToPart),
	}));

	const companionCompanionItems: CollectionItem[] = companions.map(
		(companion) => ({
			key: companion.type,
			name: companion.name,
			displayName: companion.displayName,
			xp: companion.xp,
			isWeapon: false,
			maxLevel: 30,
			imageUrl: companion.imageUrl,
			favorite: companion.favorite,
			owned: companion.owned,
			isCraftingRecipe: pendingRecipeResultTypes.has(companion.type),
			parts: companion.requirements.map(mapRequirementToPart),
		}),
	);

	const companionWeaponItems: CollectionItem[] = sentinelWeapons.map(
		(weapon) => ({
			key: weapon.type,
			name: weapon.name,
			displayName: weapon.displayName,
			xp: weapon.xp,
			isWeapon: true,
			maxLevel:
				(weapon as { maxLevel?: number }).maxLevel ?? weapon.maxLevelCap ?? 30,
			imageUrl: weapon.imageUrl,
			favorite: weapon.favorite,
			owned: weapon.owned,
			isCraftingRecipe: pendingRecipeResultTypes.has(weapon.type),
			parts: weapon.requirements.map(mapRequirementToPart),
		}),
	);

	const pendingRecipeItems: PendingRecipeItem[] = pendingRecipes.map((recipe) => ({
		itemType: recipe.itemType,
		resultType: recipe.resultType,
		name: recipe.name,
		imageUrl: recipe.imageUrl,
		completionTimestamp: recipe.completionTimestamp,
		buildTime: recipe.buildTime,
	}));

	const companionItems = [
		...companionCompanionItems,
		...companionWeaponItems,
	].sort((a, b) => a.displayName.localeCompare(b.displayName));

	const allCollectionItems = useMemo(
		() => [
			...warframeItems,
			...allArchwingItems,
			...primaryItems,
			...secondaryItems,
			...meleeItems,
			...modularWeaponItems,
			...companionItems,
		],
		[
			warframeItems,
			allArchwingItems,
			primaryItems,
			secondaryItems,
			meleeItems,
			modularWeaponItems,
			companionItems,
		],
	);

	const getFilterButtonClasses = (active: boolean) =>
		`group transition-all duration-200 ${active ? "gap-2 px-3" : "gap-0 px-2 hover:gap-2 hover:px-3"}`;

	const getFilterLabelClasses = (active: boolean) =>
		`whitespace-nowrap overflow-hidden transition-all duration-200 ${active ? "max-w-24 opacity-100" : "max-w-0 opacity-0 group-hover:max-w-24 group-hover:opacity-100"}`;

	const isCraftingTreeOpen = craftingTreeItem !== null;

	return (
		<div className="flex flex-col h-full min-h-0">
			<div
				className={isCraftingTreeOpen ? "pointer-events-none" : undefined}
				aria-hidden={isCraftingTreeOpen}
			>
				<div className="sticky top-0 z-10 bg-background">
					<div className="flex flex-wrap gap-2 mb-2">
					<Button
						variant={foundryFilter === "warframes" ? "default" : "outline"}
						onClick={() => setAppFoundryFilter("warframes")}
						className={getFilterButtonClasses(foundryFilter === "warframes")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${foundryFilter === "warframes" ? "bg-primary-foreground" : "bg-foreground"}`}
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
						<span
							className={getFilterLabelClasses(foundryFilter === "warframes")}
						>
							Warframes
						</span>
					</Button>
					<Button
						variant={foundryFilter === "archwings" ? "default" : "outline"}
						onClick={() => setAppFoundryFilter("archwings")}
						className={getFilterButtonClasses(foundryFilter === "archwings")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${foundryFilter === "archwings" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_archwing.svg")',
								WebkitMaskImage: 'url("/icons/icon_archwing.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span
							className={getFilterLabelClasses(foundryFilter === "archwings")}
						>
							Archwings
						</span>
					</Button>
					<Button
						variant={foundryFilter === "primary" ? "default" : "outline"}
						onClick={() => setAppFoundryFilter("primary")}
						className={getFilterButtonClasses(foundryFilter === "primary")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${foundryFilter === "primary" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_rifle.svg")',
								WebkitMaskImage: 'url("/icons/icon_rifle.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span
							className={getFilterLabelClasses(foundryFilter === "primary")}
						>
							Primary
						</span>
					</Button>
					<Button
						variant={foundryFilter === "secondary" ? "default" : "outline"}
						onClick={() => setAppFoundryFilter("secondary")}
						className={getFilterButtonClasses(foundryFilter === "secondary")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${foundryFilter === "secondary" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_pistol.svg")',
								WebkitMaskImage: 'url("/icons/icon_pistol.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span
							className={getFilterLabelClasses(foundryFilter === "secondary")}
						>
							Secondary
						</span>
					</Button>
					<Button
						variant={foundryFilter === "melee" ? "default" : "outline"}
						onClick={() => setAppFoundryFilter("melee")}
						className={getFilterButtonClasses(foundryFilter === "melee")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${foundryFilter === "melee" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_melee.svg")',
								WebkitMaskImage: 'url("/icons/icon_melee.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span className={getFilterLabelClasses(foundryFilter === "melee")}>
							Melee
						</span>
					</Button>
					<Button
						variant={foundryFilter === "modular" ? "default" : "outline"}
						onClick={() => setAppFoundryFilter("modular")}
						className={getFilterButtonClasses(foundryFilter === "modular")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${foundryFilter === "modular" ? "bg-primary-foreground" : "bg-foreground"}`}
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
						<span
							className={getFilterLabelClasses(foundryFilter === "modular")}
						>
							Modular
						</span>
					</Button>
					<Button
						variant={foundryFilter === "companions" ? "default" : "outline"}
						onClick={() => setAppFoundryFilter("companions")}
						className={getFilterButtonClasses(foundryFilter === "companions")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${foundryFilter === "companions" ? "bg-primary-foreground" : "bg-foreground"}`}
							style={{
								maskImage: 'url("/icons/icon_sentinel.svg")',
								WebkitMaskImage: 'url("/icons/icon_sentinel.svg")',
								maskRepeat: "no-repeat",
								WebkitMaskRepeat: "no-repeat",
								maskPosition: "center",
								WebkitMaskPosition: "center",
								maskSize: "contain",
								WebkitMaskSize: "contain",
							}}
						/>
						<span
							className={getFilterLabelClasses(foundryFilter === "companions")}
						>
							Companions
						</span>
					</Button>
					<Button
						variant={foundryFilter === "pending" ? "default" : "outline"}
						onClick={() => setAppFoundryFilter("pending")}
						className={getFilterButtonClasses(foundryFilter === "pending")}
					>
						<span
							aria-hidden="true"
							className={`h-6 w-6 shrink-0 ${foundryFilter === "pending" ? "bg-primary-foreground" : "bg-foreground"}`}
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
						<span className={getFilterLabelClasses(foundryFilter === "pending")}>
							Pending
						</span>
					</Button>
				</div>

					{error && (
						<Alert variant="destructive" className="mb-2">
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>

				<ScrollArea className="flex-1 min-h-0">
					<div className="space-y-2">
					{foundryFilter === "warframes" && (
						<CollectionSection
							items={warframeItems}
							loading={loading}
							emptyLoadingText="Loading warframe data..."
							emptyIdleText="Click Refresh Inventory in the sidebar to load warframe data"
							onOpenCraftingTree={setCraftingTreeItem}
						/>
					)}

					{foundryFilter === "archwings" && (
						<CollectionSection
							items={allArchwingItems}
							loading={loading}
							emptyLoadingText="Loading archwing data..."
							emptyIdleText="Click Refresh Inventory in the sidebar to load archwing data"
							onOpenCraftingTree={setCraftingTreeItem}
						/>
					)}

					{foundryFilter === "primary" && (
						<CollectionSection
							items={primaryItems}
							loading={loading}
							emptyLoadingText="Loading primary weapon data..."
							emptyIdleText="Click Refresh Inventory in the sidebar to load primary weapon data"
							onOpenCraftingTree={setCraftingTreeItem}
						/>
					)}

					{foundryFilter === "secondary" && (
						<CollectionSection
							items={secondaryItems}
							loading={loading}
							emptyLoadingText="Loading secondary weapon data..."
							emptyIdleText="Click Refresh Inventory in the sidebar to load secondary weapon data"
							onOpenCraftingTree={setCraftingTreeItem}
						/>
					)}

					{foundryFilter === "melee" && (
						<CollectionSection
							items={meleeItems}
							loading={loading}
							emptyLoadingText="Loading melee weapon data..."
							emptyIdleText="Click Refresh Inventory in the sidebar to load melee weapon data"
							onOpenCraftingTree={setCraftingTreeItem}
						/>
					)}

					{foundryFilter === "modular" && (
						<CollectionSection
							items={modularWeaponItems}
							loading={loading}
							emptyLoadingText="Loading modular weapon data..."
							emptyIdleText="Click Refresh Inventory in the sidebar to load modular weapon data"
							onOpenCraftingTree={setCraftingTreeItem}
						/>
					)}

					{foundryFilter === "companions" && (
						<CollectionSection
							items={companionItems}
							loading={loading}
							emptyLoadingText="Loading companion data..."
							emptyIdleText="Click Refresh Inventory in the sidebar to load companion data"
							onOpenCraftingTree={setCraftingTreeItem}
						/>
					)}

					{foundryFilter === "pending" && (
						<PendingRecipesSection
							pendingRecipes={pendingRecipeItems}
							now={now}
							loading={loading}
							use24HourClock={use24HourClock}
						/>
					)}
					</div>
				</ScrollArea>
			</div>

			{craftingTreeItem ? (
				<CraftingTreeModal
					key={craftingTreeItem.key}
					item={craftingTreeItem}
					allItems={allCollectionItems}
					onClose={() => setCraftingTreeItem(null)}
				/>
			) : null}
		</div>
	);
}
