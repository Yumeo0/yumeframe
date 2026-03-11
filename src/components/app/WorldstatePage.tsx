import { useStore } from "@tanstack/react-store";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
	fetchAndParseWorldstate,
	type ParsedWorldstate,
	resolveMissionType,
	resolveNode,
	WarframePlatform,
} from "@yumeo0/warframe-worldstate";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime } from "@/lib/datetime.utils";
import { appStore, setAppPrimeResurgenceItemTypes } from "@/store/appStore";

const POLL_INTERVAL_MS = 2 * 60 * 1000;

interface WorldstatePageProps {
	use24HourClock: boolean;
}

interface TimerEntry {
	label: string;
	target: Date | null;
	details?: string;
}

interface CycleEntry {
	label: string;
	state: string;
	expiry: Date | null;
}

function capitalize(value: string): string {
	if (!value) {
		return "Unknown";
	}

	return value
		.split(/[_\s]+/)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

function formatCountdown(target: Date | null, nowMs: number): string {
	if (!target) {
		return "N/A";
	}

	const delta = target.getTime() - nowMs;
	if (delta <= 0) {
		return "Expired";
	}

	const totalSeconds = Math.floor(delta / 1000);
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

function getNextDailyReset(now: Date): Date {
	const next = new Date(now);
	next.setUTCHours(24, 0, 0, 0);
	return next;
}

function getNextWeeklyReset(now: Date): Date {
	const next = new Date(now);
	const day = next.getUTCDay();
	const deltaDays = (8 - day) % 7 || 7;
	next.setUTCDate(next.getUTCDate() + deltaDays);
	next.setUTCHours(0, 0, 0, 0);
	return next;
}

function getTierGroupLabel(tier: string): string {
	const normalized = tier.trim().toLowerCase();
	if (normalized.includes("lith")) {
		return "Lith";
	}
	if (normalized.includes("meso")) {
		return "Meso";
	}
	if (normalized.includes("neo")) {
		return "Neo";
	}
	if (normalized.includes("axi")) {
		return "Axi";
	}
	if (normalized.includes("requiem")) {
		return "Requiem";
	}
	return capitalize(tier);
}

function getTierSortValue(label: string): number {
	const rank: Record<string, number> = {
		Lith: 0,
		Meso: 1,
		Neo: 2,
		Axi: 3,
		Requiem: 4,
	};
	return rank[label] ?? 99;
}

function normalizeLookupName(value: string): string {
	return value
		.toLowerCase()
		.replace(/<archwing>\s*/g, "")
		.replace(/["'`’]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function normalizeStoreItemPath(value: string): string {
	return value.replace("/StoreItems", "");
}

function getCircuitCategoryLabel(category: string): string {
	const normalized = category.toUpperCase();
	if (normalized === "EXC_NORMAL") {
		return "Normal Circuit";
	}
	if (normalized === "EXC_HARD") {
		return "Steel Path Circuit";
	}

	return capitalize(category);
}

function getCyclePlanetIcon(label: string): string {
	const normalized = label.trim().toLowerCase();
	if (normalized === "earth" || normalized === "cetus") {
		return "/planets/earth.png";
	}
	if (normalized === "orb vallis") {
		return "/planets/venus.png";
	}
	if (normalized === "cambion drift") {
		return "/planets/deimos.png";
	}

	return "/icons/icon_warframe.svg";
}

function resolveNodeLabel(rawValue: string, resolvedValue: string, regionName?: string): string {
	if (!rawValue) {
		return resolvedValue || "Unknown";
	}

	const compact = rawValue.replace(/\s+/g, "");
	if (!/^solnode\d+$/i.test(compact)) {
		return resolvedValue || rawValue;
	}

	const mappedValue = resolveNode(rawValue);
	if (mappedValue && !/^solnode\d+$/i.test(mappedValue)) {
		return mappedValue;
	}

	if (resolvedValue && !/^solnode\d+$/i.test(resolvedValue)) {
		return resolvedValue;
	}

	if (regionName) {
		return `${compact.replace(/^solnode/i, "Node ")} (${regionName})`;
	}

	return rawValue;
}

export function WorldstatePage({ use24HourClock }: WorldstatePageProps) {
	const warframes = useStore(appStore, (state) => state.warframes);
	const weapons = useStore(appStore, (state) => state.weapons);
	const companions = useStore(appStore, (state) => state.companions);
	const [worldstate, setWorldstate] = useState<ParsedWorldstate | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
	const [nowMs, setNowMs] = useState(Date.now());

	const loadWorldstate = useCallback(async (isBackgroundRefresh = false) => {
		if (isBackgroundRefresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}

		try {
			const parsed = await fetchAndParseWorldstate({
				platform: WarframePlatform.PC,
				fetchImpl: tauriFetch,
			});
			setWorldstate(parsed);
			setLastUpdatedAt(Date.now());
			setError(null);
			setAppPrimeResurgenceItemTypes(
				parsed.vaultTrader.inventory.map((item) =>
					item.uniqueName.replace("/StoreItems", ""),
				),
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(`Failed to load worldstate: ${message}`);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void loadWorldstate(false);

		const poll = window.setInterval(() => {
			void loadWorldstate(true);
		}, POLL_INTERVAL_MS);

		return () => {
			window.clearInterval(poll);
		};
	}, [loadWorldstate]);

	useEffect(() => {
		const tick = window.setInterval(() => {
			setNowMs(Date.now());
		}, 1000);

		return () => {
			window.clearInterval(tick);
		};
	}, []);

	const cycles = useMemo<CycleEntry[]>(() => {
		if (!worldstate) {
			return [];
		}

		return [
			{
				label: "Earth",
				state: worldstate.earthCycle.state,
				expiry: worldstate.earthCycle.expiry ?? null,
			},
			{
				label: "Cetus",
				state: worldstate.cetusCycle.isDay ? "Day" : "Night",
				expiry: worldstate.cetusCycle.expiry ?? null,
			},
			{
				label: "Orb Vallis",
				state: worldstate.vallisCycle.state,
				expiry: worldstate.vallisCycle.expiry ?? null,
			},
			{
				label: "Cambion Drift",
				state: worldstate.cambionCycle.state,
				expiry: worldstate.cambionCycle.expiry ?? null,
			},
		];
	}, [worldstate]);

	const fissuresByRelicType = useMemo(() => {
		if (!worldstate) {
			return [] as Array<{
				tier: string;
				fissures: ParsedWorldstate["fissures"];
			}>;
		}

		const byTier = new Map<string, ParsedWorldstate["fissures"]>();
		for (const fissure of worldstate.fissures) {
			const tier = getTierGroupLabel(fissure.tier);
			const current = byTier.get(tier) ?? [];
			current.push(fissure);
			byTier.set(tier, current);
		}

		for (const [tier, fissures] of byTier.entries()) {
			fissures.sort((a, b) => {
				const aExpiry = a.expiry?.getTime() ?? Number.MAX_SAFE_INTEGER;
				const bExpiry = b.expiry?.getTime() ?? Number.MAX_SAFE_INTEGER;
				return aExpiry - bExpiry || a.node.localeCompare(b.node);
			});
			byTier.set(tier, fissures);
		}

		return [...byTier.entries()]
			.map(([tier, fissures]) => ({ tier, fissures }))
			.sort((a, b) => getTierSortValue(a.tier) - getTierSortValue(b.tier));
	}, [worldstate]);

	const baroTrader = useMemo(() => {
		if (!worldstate) {
			return null;
		}

		return (
			worldstate.voidTraders.find((trader) =>
				trader.character.toLowerCase().includes("baro"),
			) ?? worldstate.voidTrader
		);
	}, [worldstate]);

	const weeklyTimers = useMemo<TimerEntry[]>(() => {
		const now = new Date(nowMs);
		if (!worldstate) {
			return [{ label: "Weekly reset / Archon Hunt", target: getNextWeeklyReset(now) }];
		}

		const weeklyReset = getNextWeeklyReset(now);
		const archonHunt = worldstate.archonHunt.expiry ?? null;
		const mergedWeeklyTarget =
			archonHunt && archonHunt.getTime() > weeklyReset.getTime()
				? archonHunt
				: weeklyReset;

		return [
			{ label: "Weekly reset / Archon Hunt", target: mergedWeeklyTarget },
		];
	}, [nowMs, worldstate]);

	const dailyTimers = useMemo<TimerEntry[]>(() => {
		const now = new Date(nowMs);
		if (!worldstate) {
			const dailyReset = getNextDailyReset(now);
			return [
				{ label: "Daily reset / Standing cap / SP alerts", target: dailyReset },
			];
		}

		const dailyReset = getNextDailyReset(now);
		return [
			{ label: "Daily reset / Standing cap / SP alerts", target: dailyReset },
			{ label: "Sortie reset", target: worldstate.sortie.expiry ?? null },
		];
	}, [nowMs, worldstate]);

	const primeResurgenceTimer = useMemo<TimerEntry>(() => {
		return {
			label: "Prime Resurgence",
			target: worldstate?.vaultTrader.expiry ?? null,
		};
	}, [worldstate]);

	const circuitChoices = useMemo(() => {
		if (!worldstate) {
			return [] as Array<{ category: string; choices: string[] }>;
		}

		return worldstate.duviriCycle.choices.map((choice) => ({
			category: choice.category,
			choices: choice.choices,
		}));
	}, [worldstate]);

	const circuitChoiceIconByName = useMemo(() => {
		const iconByName = new Map<string, string>();

		for (const warframe of warframes) {
			if (!warframe.imageUrl) {
				continue;
			}

			iconByName.set(normalizeLookupName(warframe.displayName), warframe.imageUrl);
			iconByName.set(normalizeLookupName(warframe.name), warframe.imageUrl);
		}

		for (const weapon of weapons) {
			if (!weapon.imageUrl) {
				continue;
			}

			iconByName.set(normalizeLookupName(weapon.displayName), weapon.imageUrl);
			iconByName.set(normalizeLookupName(weapon.name), weapon.imageUrl);
		}

		for (const companion of companions) {
			if (!companion.imageUrl) {
				continue;
			}

			iconByName.set(normalizeLookupName(companion.displayName), companion.imageUrl);
			iconByName.set(normalizeLookupName(companion.name), companion.imageUrl);
		}

		return iconByName;
	}, [companions, warframes, weapons]);

	const primeResurgenceIconByName = useMemo(() => {
		const iconByName = new Map<string, string>();
		const iconByItemType = new Map<string, string>();

		for (const warframe of warframes) {
			if (warframe.imageUrl) {
				iconByName.set(normalizeLookupName(warframe.displayName), warframe.imageUrl);
				iconByName.set(normalizeLookupName(warframe.name), warframe.imageUrl);
				iconByItemType.set(normalizeStoreItemPath(warframe.type), warframe.imageUrl);
			}
		}

		for (const weapon of weapons) {
			if (weapon.imageUrl) {
				iconByName.set(normalizeLookupName(weapon.displayName), weapon.imageUrl);
				iconByName.set(normalizeLookupName(weapon.name), weapon.imageUrl);
				iconByItemType.set(normalizeStoreItemPath(weapon.type), weapon.imageUrl);
			}
		}

		for (const companion of companions) {
			if (companion.imageUrl) {
				iconByName.set(normalizeLookupName(companion.displayName), companion.imageUrl);
				iconByName.set(normalizeLookupName(companion.name), companion.imageUrl);
				iconByItemType.set(normalizeStoreItemPath(companion.type), companion.imageUrl);
			}
		}

		return { iconByName, iconByItemType };
	}, [companions, warframes, weapons]);

	const primeResurgenceClassifiers = useMemo(() => {
		const warframeNames = new Set<string>();
		const warframeTypes = new Set<string>();
		const weaponNames = new Set<string>();
		const weaponTypes = new Set<string>();

		for (const warframe of warframes) {
			warframeNames.add(normalizeLookupName(warframe.displayName));
			warframeNames.add(normalizeLookupName(warframe.name));
			warframeTypes.add(normalizeStoreItemPath(warframe.type));
		}

		for (const weapon of weapons) {
			weaponNames.add(normalizeLookupName(weapon.displayName));
			weaponNames.add(normalizeLookupName(weapon.name));
			weaponTypes.add(normalizeStoreItemPath(weapon.type));
		}

		return { warframeNames, warframeTypes, weaponNames, weaponTypes };
	}, [warframes, weapons]);

	const primeResurgenceDisplayNameByType = useMemo(() => {
		const byType = new Map<string, string>();

		for (const warframe of warframes) {
			const normalizedType = normalizeStoreItemPath(warframe.type);
			if (normalizedType) {
				byType.set(normalizedType, warframe.displayName || warframe.name);
			}
		}

		for (const weapon of weapons) {
			const normalizedType = normalizeStoreItemPath(weapon.type);
			if (normalizedType) {
				byType.set(normalizedType, weapon.displayName || weapon.name);
			}
		}

		return byType;
	}, [warframes, weapons]);

	const resolvePrimeResurgenceItemName = useCallback(
		(itemName: string, itemType: string) => {
			const normalizedType = normalizeStoreItemPath(itemType || "");
			const mapped = normalizedType
				? primeResurgenceDisplayNameByType.get(normalizedType)
				: undefined;
			if (mapped) {
				return mapped;
			}

			return itemName;
		},
		[primeResurgenceDisplayNameByType],
	);

	const getPrimeResurgenceIcon = useCallback(
		(itemName: string, itemType: string) => {
			const normalizedItemType = normalizeStoreItemPath(itemType || "");
			const byType = normalizedItemType
				? primeResurgenceIconByName.iconByItemType.get(normalizedItemType)
				: undefined;
			if (byType) {
				return byType;
			}

			const exact = primeResurgenceIconByName.iconByName.get(normalizeLookupName(itemName));
			if (exact) {
				return exact;
			}

			const normalized = normalizeLookupName(itemName);
			if (normalized.includes("prime") && normalized.includes("relic")) {
				return "/icons/icon_relic.svg";
			}
			if (
				normalized.includes("armor") ||
				normalized.includes("syandana") ||
				normalized.includes("sigil") ||
				normalized.includes("skin") ||
				normalized.includes("glyph") ||
				normalized.includes("bobble")
			) {
				return "/icons/icon_appearance.svg";
			}

			return "/icons/icon_foundry.svg";
		},
		[primeResurgenceIconByName],
	);

	const getFissureTierIcon = useCallback((tier: string) => {
		const normalized = tier.toLowerCase();
		if (normalized.includes("lith")) {
			return "/relics/LithRelicRadiant.png";
		}
		if (normalized.includes("meso")) {
			return "/relics/MesoRelicRadiant.png";
		}
		if (normalized.includes("neo")) {
			return "/relics/NeoRelicRadiant.png";
		}
		if (normalized.includes("axi")) {
			return "/relics/AxiRelicRadiant.png";
		}
		if (normalized.includes("requiem")) {
			return "/relics/RequiemRelicRadiant.png";
		}
		if (normalized.includes("omnia") || normalized.includes("omni")) {
			return "/relics/OmniRelicRadiant.png";
		}
		return "/icons/icon_relic.svg";
	}, []);

	const primeResurgenceSections = useMemo(() => {
		if (!worldstate) {
			return {
				warframes: [] as Array<ParsedWorldstate["vaultTrader"]["inventory"][number] & { displayItem: string }>,
				weapons: [] as Array<ParsedWorldstate["vaultTrader"]["inventory"][number] & { displayItem: string }>,
			};
		}

		const warframesSection: Array<ParsedWorldstate["vaultTrader"]["inventory"][number] & { displayItem: string }> = [];
		const weaponsSection: Array<ParsedWorldstate["vaultTrader"]["inventory"][number] & { displayItem: string }> = [];

		for (const item of worldstate.vaultTrader.inventory) {
			const displayItem = resolvePrimeResurgenceItemName(item.item, item.uniqueName);
			const normalizedName = normalizeLookupName(displayItem);
			const normalizedType = normalizeStoreItemPath(item.uniqueName);

			const isWarframe =
				primeResurgenceClassifiers.warframeNames.has(normalizedName) ||
				(normalizedType.length > 0 && primeResurgenceClassifiers.warframeTypes.has(normalizedType));
			const isWeapon =
				primeResurgenceClassifiers.weaponNames.has(normalizedName) ||
				(normalizedType.length > 0 && primeResurgenceClassifiers.weaponTypes.has(normalizedType));

			if (!isWarframe && !isWeapon) {
				continue;
			}

			const mappedItem = {
				...item,
				displayItem,
			};

			if (isWarframe) {
				warframesSection.push(mappedItem);
				continue;
			}

			weaponsSection.push(mappedItem);
		}

		warframesSection.sort((a, b) => a.displayItem.localeCompare(b.displayItem));
		weaponsSection.sort((a, b) => a.displayItem.localeCompare(b.displayItem));

		return {
			warframes: warframesSection,
			weapons: weaponsSection,
		};
	}, [primeResurgenceClassifiers, resolvePrimeResurgenceItemName, worldstate]);

	if (loading) {
		return (
			<div className="h-full p-2">
				<Card className="gap-2 py-3">
					<CardHeader className="px-4">
						<CardTitle>Worldstate</CardTitle>
						<CardDescription>Loading worldstate data...</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	return (
		<ScrollArea className="h-full min-w-0">
			<div className="p-2 pb-4 space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-2 px-1">
					<div className="flex items-center gap-3">
						<h2 className="text-lg font-semibold">Worldstate</h2>
						{lastUpdatedAt ? (
							<span className="text-xs text-muted-foreground">
								Updated {formatDateTime(lastUpdatedAt, use24HourClock)}
							</span>
						) : null}
					</div>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => void loadWorldstate(true)}
						disabled={refreshing}
					>
						{refreshing ? "Refreshing..." : "Refresh"}
					</Button>
				</div>
				{error ? (
					<p className="px-1 text-sm text-destructive">{error}</p>
				) : null}

				<div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
					{cycles.map((cycle) => (
						<Card key={cycle.label} className="py-2.5 gap-0">
							<CardContent className="flex items-center gap-2 px-3">
								<img
									alt={`${cycle.label} icon`}
									className="object-contain size-8 shrink-0"
									src={getCyclePlanetIcon(cycle.label)}
								/>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-1.5 text-sm">
										<span className="font-medium">{cycle.label}</span>
										<Badge variant="outline" className="px-1.5 py-0">{capitalize(cycle.state)}</Badge>
									</div>
									<p className="text-sm text-muted-foreground">{formatCountdown(cycle.expiry, nowMs)}</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>

				<Card className="gap-2 py-3">
					<CardHeader className="px-4 py-0">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<CardTitle className="text-sm">Baro Ki&apos;Teer</CardTitle>
								{baroTrader ? (
									<>
										<Badge variant={baroTrader.active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
											{baroTrader.active ? "Active" : "Away"}
										</Badge>
										<span className="text-xs text-muted-foreground">
											{baroTrader.location || "Unknown location"}
										</span>
									</>
								) : null}
							</div>
							{baroTrader ? (
								<span className="text-xs text-muted-foreground">
									{baroTrader.active
										? `Leaves in ${formatCountdown(baroTrader.expiry ?? null, nowMs)}`
										: `Arrives in ${formatCountdown(baroTrader.activation ?? null, nowMs)}`}
								</span>
							) : null}
						</div>
					</CardHeader>
					{baroTrader ? (
						<CardContent className="px-4">
							<div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
								{baroTrader.inventory.map((item) => (
									<div
										key={item.uniqueName}
										className="flex items-center justify-between gap-1.5 px-2 py-1 border rounded-md"
									>
										<p className="text-xs font-medium truncate">{item.item}</p>
										<div className="flex items-center gap-1 shrink-0">
											<Badge variant="outline" className="text-[10px] px-1 py-0">{item.ducats}d</Badge>
											<Badge variant="outline" className="text-[10px] px-1 py-0">{item.credits}cr</Badge>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					) : null}
				</Card>

				<Card className="gap-2 py-3">
					<CardHeader className="px-4 py-0">
						<CardTitle className="text-sm">Void Fissures</CardTitle>
					</CardHeader>
					<CardContent className="px-4">
						{fissuresByRelicType.length === 0 ? (
							<p className="text-xs text-muted-foreground">
								No active fissures found.
							</p>
						) : (
							<div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
								{fissuresByRelicType.map((group) => (
									<div key={group.tier} className="p-2 border rounded-md">
										<div className="flex items-center justify-between mb-1.5">
											<div className="flex items-center gap-1.5">
												<img
													alt={`${group.tier} relic`}
													className="object-contain size-7"
													src={getFissureTierIcon(group.tier)}
												/>
												<p className="text-sm font-medium">{group.tier}</p>
											</div>
											<Badge variant="outline" className="text-[10px] px-1.5 py-0">{group.fissures.length}</Badge>
										</div>
										<div className="space-y-1">
											{group.fissures.map((fissure) => (
												<div
													key={
														fissure.id ??
														`${group.tier}-${fissure.node}-${fissure.missionType}`
													}
													className="flex items-center justify-between gap-1.5 px-2 py-1 border rounded-md"
												>
													<div className="flex-1 min-w-0">
														<p className="text-xs font-medium truncate">
															{resolveMissionType(
																fissure.missionTypeKey || fissure.missionType,
															)}
															<span className="text-muted-foreground">
																{" "}
																{resolveNodeLabel(
																	fissure.nodeKey || fissure.node,
																	fissure.node,
																	fissure.regionName,
																)}
															</span>
														</p>
													</div>
													<div className="flex items-center gap-1 shrink-0">
														{fissure.isStorm ? (
															<Badge className="gap-0.5 text-[10px] px-1.5 py-0" variant="secondary">
																<img
																	alt="Void Storm"
																	className="object-contain size-2.5"
																	src="/icons/icon_reactant.svg"
																/>
																Storm
															</Badge>
														) : null}
														{fissure.isHard ? (
															<Badge className="gap-0.5 text-[10px] px-1.5 py-0" variant="secondary">
																<img
																	alt="Steel Path"
																	className="object-contain size-2.5"
																	src="/icons/difficulty/icon_steel_path.svg"
																/>
																SP
															</Badge>
														) : null}
														<span className="text-[10px] text-muted-foreground">
															{formatCountdown(fissure.expiry ?? null, nowMs)}
														</span>
													</div>
												</div>
											))}
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="gap-2 py-3">
					<CardHeader className="px-4 py-0">
						<CardTitle className="text-sm">Reset Timers</CardTitle>
					</CardHeader>
					<CardContent className="px-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
						{[...weeklyTimers, ...dailyTimers].map((entry) => (
							<div
								key={entry.label}
								className="flex items-center justify-between gap-2 px-2.5 py-1.5 border rounded-md"
							>
								<p className="text-xs font-medium truncate">{entry.label}</p>
								<span className="text-xs text-muted-foreground shrink-0">{formatCountdown(entry.target, nowMs)}</span>
							</div>
						))}
					</CardContent>
				</Card>

				<div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
					<Card className="gap-2 py-3">
						<CardHeader className="px-4 py-0">
							<CardTitle className="text-sm">Circuit Rewards</CardTitle>
						</CardHeader>
						<CardContent className="px-4 space-y-2">
							{circuitChoices.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									No circuit data available.
								</p>
							) : (
								circuitChoices.map((choice) => (
									<div key={choice.category} className="p-2 border rounded-md">
										<div className="flex items-center justify-between mb-1.5">
											<p className="text-sm font-medium">
												{getCircuitCategoryLabel(choice.category)}
											</p>
											<Badge variant="outline" className="text-[10px] px-1.5 py-0">{choice.choices.length}</Badge>
										</div>
										<div className="grid grid-cols-2 gap-1">
											{choice.choices.map((item) => (
												<div
													key={item}
													className="flex items-center gap-1.5 px-1.5 py-0.5 border rounded-md bg-secondary/20"
												>
													{circuitChoiceIconByName.get(normalizeLookupName(item)) ? (
														<img
															alt={item}
															className="object-cover rounded-sm size-5"
															src={circuitChoiceIconByName.get(normalizeLookupName(item))}
														/>
													) : (
														<div className="border rounded-sm size-5 bg-muted" />
													)}
													<span className="text-xs truncate">{item}</span>
												</div>
											))}
										</div>
									</div>
								))
							)}
						</CardContent>
					</Card>

					<Card className="gap-2 py-3">
						<CardHeader className="px-4 py-0">
							<div className="flex items-center justify-between">
								<CardTitle className="text-sm">Prime Resurgence</CardTitle>
								<span className="text-xs text-muted-foreground">{formatCountdown(primeResurgenceTimer.target, nowMs)}</span>
							</div>
						</CardHeader>
						<CardContent className="px-4">
							{primeResurgenceSections.warframes.length === 0 &&
							primeResurgenceSections.weapons.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									No items available.
								</p>
							) : (
								<div className="space-y-2">
									{primeResurgenceSections.warframes.length > 0 && (
										<div>
											<div className="flex items-center justify-between mb-1">
												<p className="text-xs font-medium text-muted-foreground">Warframes</p>
												<Badge variant="outline" className="text-[10px] px-1.5 py-0">{primeResurgenceSections.warframes.length}</Badge>
											</div>
											<div className="grid grid-cols-2 gap-1">
												{primeResurgenceSections.warframes.map((item) => (
													<div
														key={item.uniqueName}
														className="flex items-center gap-1.5 px-1.5 py-0.5 border rounded-md"
													>
														<img
															alt={item.displayItem}
															className="object-contain rounded-sm size-5"
															src={getPrimeResurgenceIcon(item.displayItem, item.uniqueName)}
														/>
														<p className="text-xs font-medium truncate">{item.displayItem}</p>
													</div>
												))}
											</div>
										</div>
									)}
									{primeResurgenceSections.weapons.length > 0 && (
										<div>
											<div className="flex items-center justify-between mb-1">
												<p className="text-xs font-medium text-muted-foreground">Weapons</p>
												<Badge variant="outline" className="text-[10px] px-1.5 py-0">{primeResurgenceSections.weapons.length}</Badge>
											</div>
											<div className="grid grid-cols-2 gap-1">
												{primeResurgenceSections.weapons.map((item) => (
													<div
														key={item.uniqueName}
														className="flex items-center gap-1.5 px-1.5 py-0.5 border rounded-md"
													>
														<img
															alt={item.displayItem}
															className="object-contain rounded-sm size-5"
															src={getPrimeResurgenceIcon(item.displayItem, item.uniqueName)}
														/>
														<p className="text-xs font-medium truncate">{item.displayItem}</p>
													</div>
												))}
											</div>
										</div>
									)}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</ScrollArea>
	);
}
