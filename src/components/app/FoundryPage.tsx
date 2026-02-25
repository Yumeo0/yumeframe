import { Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OwnedCompanion, OwnedWeapon, Warframe } from "@/types";

export type FoundryFilter =
	| "warframes"
	| "archwings"
	| "primary"
	| "secondary"
	| "melee"
	| "modular"
	| "companions";

interface FoundryPageProps {
	foundryFilter: FoundryFilter;
	onFilterChange: (filter: FoundryFilter) => void;
	loading: boolean;
	error: string;
	warframes: Warframe[];
	weapons: OwnedWeapon[];
	companions: OwnedCompanion[];
	onRefresh: () => void;
}

interface CollectionPart {
	name: string;
	imageUrl: string;
	owned?: boolean;
	count?: number;
	hasRecipe?: boolean;
}

interface CollectionItem {
	key: string;
	name: string;
	displayName: string;
	xp: number;
	isWeapon: boolean;
	maxLevel: number;
	imageUrl: string;
	favorite: boolean;
	owned: boolean;
	parts: CollectionPart[];
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
}

function CollectionSection({
	items,
	loading,
	emptyLoadingText,
	emptyIdleText,
}: CollectionSectionProps) {
	return (
		<div>
			{items.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 pt-1">
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
									className={`overflow-hidden transition-all hover:shadow-lg ${item.owned ? "ring-2 ring-green-500/50 bg-green-500/20" : ""} py-3 gap-0`}
								>
									<CardHeader>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<CardTitle className="text-lg">
													{item.displayName}
												</CardTitle>
											</div>
											<span
												title={`${mastered ? "Mastered" : "Not mastered"} (${item.xp}/${requiredAffinity} Affinity, max level ${item.maxLevel})`}
												className="inline-flex text-sm text-muted-foreground mb-2"
											>
												<span
													aria-hidden="true"
													className="relative inline-block h-6 w-6 shrink-0"
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
									</CardHeader>
									<CardContent>
										<div className="flex gap-2 items-start justify-between">
											<div className="shrink-0">
												<img
													src={item.imageUrl}
													alt={item.name}
													className="h-24 w-24 object-cover rounded-md"
												/>
											</div>

											<div className="flex-1">
												{item.parts.length > 0 ? (
													<div className="grid grid-cols-3 gap-2">
														{item.parts.map((part, index) => (
															<div
																key={`${item.key}-${part.name}-${index}`}
																className="relative group flex justify-center"
																title={`${part.name}${part.count ? ` x${part.count}` : ""}${part.owned === undefined ? "" : `: ${part.hasRecipe ? "Recipe owned" : part.owned ? "Owned" : "Missing"}`}`}
															>
																<img
																	src={part.imageUrl}
																	alt={part.name}
																	className={`w-12 aspect-square rounded object-cover ${part.owned === undefined ? "border" : part.hasRecipe ? "border-2 border-primary/60" : part.owned ? "border-2 border-green-500/50" : "border-2 border-muted opacity-50"}`}
																/>
																{part.count ? (
																	<span className="absolute -bottom-1 left-1/2 min-w-5 h-5 px-1 rounded bg-secondary text-secondary-foreground text-[10px] flex items-center justify-center">
																		x{part.count}
																	</span>
																) : null}
																<span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
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

export function FoundryPage({
	foundryFilter,
	onFilterChange,
	loading,
	error,
	warframes,
	weapons,
	companions,
	onRefresh,
}: FoundryPageProps) {
	const regularWarframes = warframes.filter(
		(wf) => !wf.displayName.startsWith("<ARCHWING>"),
	);
	const archwings = warframes.filter((wf) =>
		wf.displayName.startsWith("<ARCHWING>"),
	);

	weapons = weapons.filter((weapon) => weapon.excludeFromCodex !== true);

	const archwingWeapons = weapons.filter(
		(weapon) =>
			weapon.displayName.startsWith("<ARCHWING>") ||
			weapon.productCategory === "SpaceMelee" ||
			weapon.productCategory === "SpaceGuns",
	);
	const regularWeapons = weapons.filter(
		(weapon) =>
			!weapon.displayName.startsWith("<ARCHWING>") &&
			weapon.productCategory !== "SpaceMelee" &&
			weapon.productCategory !== "SpaceGuns" &&
			weapon.uniqueName.includes("Modular") === false,
	);

	const warframeItems: CollectionItem[] = regularWarframes.map((wf) => ({
		key: wf.type,
		name: wf.name,
		displayName: wf.displayName,
		xp: wf.xp,
		isWeapon: false,
		maxLevel: wf.maxLevel,
		imageUrl: wf.imageUrl,
		favorite: wf.favorite,
		owned: wf.owned,
		parts: wf.parts.map((part) => ({
			name: part.name,
			count: part.count,
			imageUrl: part.imageUrl,
			owned: part.owned,
			hasRecipe: part.hasRecipe,
		})),
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
		parts: wf.parts.map((part) => ({
			name: part.name,
			count: part.count,
			imageUrl: part.imageUrl,
			owned: part.owned,
			hasRecipe: part.hasRecipe,
		})),
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
			parts: weapon.requirements.map((requirement) => ({
				name: requirement.name,
				count: requirement.count,
				imageUrl: requirement.imageUrl,
				owned: requirement.owned,
				hasRecipe: requirement.hasRecipe,
			})),
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
	const modularWeapons = weapons.filter((weapon) =>
		weapon.uniqueName.includes("Modular"),
	);
	const sentinelWeapons = weapons.filter(
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
		parts: weapon.requirements.map((requirement) => ({
			name: requirement.name,
			count: requirement.count,
			imageUrl: requirement.imageUrl,
			owned: requirement.owned,
			hasRecipe: requirement.hasRecipe,
		})),
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
		parts: weapon.requirements.map((requirement) => ({
			name: requirement.name,
			count: requirement.count,
			imageUrl: requirement.imageUrl,
			owned: requirement.owned,
			hasRecipe: requirement.hasRecipe,
		})),
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
		parts: weapon.requirements.map((requirement) => ({
			name: requirement.name,
			count: requirement.count,
			imageUrl: requirement.imageUrl,
			owned: requirement.owned,
			hasRecipe: requirement.hasRecipe,
		})),
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
		parts: weapon.requirements.map((requirement) => ({
			name: requirement.name,
			count: requirement.count,
			imageUrl: requirement.imageUrl,
			owned: requirement.owned,
			hasRecipe: requirement.hasRecipe,
		})),
	}));

	const companionCompanionItems: CollectionItem[] = companions.map((companion) => ({
		key: companion.type,
		name: companion.name,
		displayName: companion.displayName,
		xp: companion.xp,
		isWeapon: false,
		maxLevel: 30,
		imageUrl: companion.imageUrl,
		favorite: companion.favorite,
		owned: companion.owned,
		parts: companion.requirements.map((requirement) => ({
			name: requirement.name,
			count: requirement.count,
			imageUrl: requirement.imageUrl,
			owned: requirement.owned,
			hasRecipe: requirement.hasRecipe,
		})),
	}));

	const companionWeaponItems: CollectionItem[] = sentinelWeapons.map((weapon) => ({
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
		parts: weapon.requirements.map((requirement) => ({
			name: requirement.name,
			count: requirement.count,
			imageUrl: requirement.imageUrl,
			owned: requirement.owned,
			hasRecipe: requirement.hasRecipe,
		})),
	}));

	const companionItems = [...companionCompanionItems, ...companionWeaponItems].sort(
		(a, b) => a.displayName.localeCompare(b.displayName),
	);

	const getFilterButtonClasses = (active: boolean) =>
		`group transition-all duration-200 ${active ? "gap-2 px-3" : "gap-0 px-2 hover:gap-2 hover:px-3"}`;

	const getFilterLabelClasses = (active: boolean) =>
		`whitespace-nowrap overflow-hidden transition-all duration-200 ${active ? "max-w-24 opacity-100" : "max-w-0 opacity-0 group-hover:max-w-24 group-hover:opacity-100"}`;

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="sticky top-0 z-10 bg-background">
				<div className="flex flex-wrap gap-2 mb-2">
				<Button
					variant={foundryFilter === "warframes" ? "default" : "outline"}
					onClick={() => onFilterChange("warframes")}
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
					<span className={getFilterLabelClasses(foundryFilter === "warframes")}>Warframes</span>
				</Button>
				<Button
					variant={foundryFilter === "archwings" ? "default" : "outline"}
					onClick={() => onFilterChange("archwings")}
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
					<span className={getFilterLabelClasses(foundryFilter === "archwings")}>Archwings</span>
				</Button>
				<Button
					variant={foundryFilter === "primary" ? "default" : "outline"}
					onClick={() => onFilterChange("primary")}
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
					<span className={getFilterLabelClasses(foundryFilter === "primary")}>Primary</span>
				</Button>
				<Button
					variant={foundryFilter === "secondary" ? "default" : "outline"}
					onClick={() => onFilterChange("secondary")}
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
					<span className={getFilterLabelClasses(foundryFilter === "secondary")}>Secondary</span>
				</Button>
				<Button
					variant={foundryFilter === "melee" ? "default" : "outline"}
					onClick={() => onFilterChange("melee")}
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
					<span className={getFilterLabelClasses(foundryFilter === "melee")}>Melee</span>
				</Button>
				<Button
					variant={foundryFilter === "modular" ? "default" : "outline"}
					onClick={() => onFilterChange("modular")}
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
					<span className={getFilterLabelClasses(foundryFilter === "modular")}>Modular</span>
				</Button>
				<Button
					variant={foundryFilter === "companions" ? "default" : "outline"}
					onClick={() => onFilterChange("companions")}
					className={getFilterButtonClasses(foundryFilter === "companions")}
				>
					<span
						aria-hidden="true"
						className={`h-6 w-6 shrink-0 ${foundryFilter === "companions" ? "bg-primary-foreground" : "bg-foreground"}`}
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
					<span className={getFilterLabelClasses(foundryFilter === "companions")}>Companions</span>
				</Button>
				<Button
					onClick={onRefresh}
					disabled={loading}
					variant="secondary"
					className="ml-auto gap-2"
				>
					{loading ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading...
						</>
					) : (
						<>
							<RefreshCw className="h-4 w-4" />
							Refresh
						</>
					)}
				</Button>
				</div>

				{error && (
					<Alert variant="destructive" className="mb-2">
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-2">
					{foundryFilter === "warframes" && (
						<CollectionSection
							items={warframeItems}
							loading={loading}
							emptyLoadingText="Loading warframe data..."
							emptyIdleText="Click refresh to load warframe data"
						/>
					)}

					{foundryFilter === "archwings" && (
						<CollectionSection
							items={allArchwingItems}
							loading={loading}
							emptyLoadingText="Loading archwing data..."
							emptyIdleText="Click refresh to load archwing data"
						/>
					)}

					{foundryFilter === "primary" && (
						<CollectionSection
							items={primaryItems}
							loading={loading}
							emptyLoadingText="Loading primary weapon data..."
							emptyIdleText="Click refresh to load primary weapon data"
						/>
					)}

					{foundryFilter === "secondary" && (
						<CollectionSection
							items={secondaryItems}
							loading={loading}
							emptyLoadingText="Loading secondary weapon data..."
							emptyIdleText="Click refresh to load secondary weapon data"
						/>
					)}

					{foundryFilter === "melee" && (
						<CollectionSection
							items={meleeItems}
							loading={loading}
							emptyLoadingText="Loading melee weapon data..."
							emptyIdleText="Click refresh to load melee weapon data"
						/>
					)}

					{foundryFilter === "modular" && (
						<CollectionSection
							items={modularWeaponItems}
							loading={loading}
							emptyLoadingText="Loading modular weapon data..."
							emptyIdleText="Click refresh to load modular weapon data"
						/>
					)}

					{foundryFilter === "companions" && (
						<CollectionSection
							items={companionItems}
							loading={loading}
							emptyLoadingText="Loading companion data..."
							emptyIdleText="Click refresh to load companion data"
						/>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
