import { getMasteryLevelTotalXPRequired } from "@/lib/warframe.utils";
import type { OwnedCompanion, OwnedWeapon, Warframe } from "@/types";

const WEAPON_MASTERY_PER_LEVEL = 100;
const FRAME_MASTERY_PER_LEVEL = 200;
const INTRINSIC_MASTERY_PER_LEVEL = 1500;

interface MissionProgress {
	Completes?: number;
	Tag?: string;
	Tier?: number;
}

interface InventorySkillMap {
	[key: string]: number;
}

interface InventoryVehicleEntry {
	ItemType?: string;
	XP?: number;
}

interface InventoryEntityEntry {
	ItemType?: string;
	XP?: number;
}

interface InventoryData {
	Missions?: MissionProgress[];
	PlayerSkills?: InventorySkillMap;
	Motorcycles?: InventoryVehicleEntry[];
	CrewShipHarnesses?: InventoryVehicleEntry[];
	Sentinels?: InventoryEntityEntry[];
	KubrowPets?: InventoryEntityEntry[];
	MoaPets?: InventoryEntityEntry[];
	InfestedPets?: InventoryEntityEntry[];
	OperatorAmps?: InventoryEntityEntry[];
}

export interface EquipmentMasteryBreakdown {
	weapons: number;
	warframes: number;
	companions: number;
	kDrives: number;
	total: number;
}

export interface MissionMasteryBreakdown {
	total: number;
	normalMissionXp: number;
	steelPathMissionXp: number;
	normalNodesCompleted: number;
	steelPathNodes: number;
	steelPathJunctions: number;
	junctions: number;
	normalNodeMax: number;
	junctionMax: number;
	steelPathNodeMax: number;
	steelPathJunctionMax: number;
	missingNodeXpEntries: number;
}

export interface IntrinsicsMasteryBreakdown {
	total: number;
	railjack: number;
	drifter: number;
	rankCount: number;
}

export interface CategoryMasteryBreakdown {
	warframes: number;
	primaryWeapons: number;
	secondaryWeapons: number;
	meleeWeapons: number;
	missions: number;
	steelPathMissions: number;
	railjackIntrinsics: number;
	drifterIntrinsics: number;
	sentinels: number;
	sentinelWeapons: number;
	companions: number;
	archwing: number;
	archgun: number;
	archmelee: number;
	amps: number;
	necramechs: number;
}

interface InventoryEntityFallbackBreakdown {
	sentinels: number;
	companions: number;
	total: number;
	countedItemTypes: Set<string>;
}

export interface MasterySummary {
	totalMasteryPoints: number;
	equipment: EquipmentMasteryBreakdown;
	missions: MissionMasteryBreakdown;
	intrinsics: IntrinsicsMasteryBreakdown;
	categoryXp: CategoryMasteryBreakdown;
	masteryRank: number;
	pointsIntoCurrentRank: number;
	pointsRequiredForNextRank: number;
	pointsRemainingForNextRank: number;
}

function getRankFromAffinity(
	affinity: number,
	masteryPerLevel: number,
	maxRank: number,
): number {
	if (affinity <= 0) {
		return 0;
	}

	const affinityPerSquare =
		masteryPerLevel === WEAPON_MASTERY_PER_LEVEL ? 500 : 1000;
	const estimatedRank = Math.floor(Math.sqrt(affinity / affinityPerSquare));
	if (estimatedRank < 0) {
		return 0;
	}

	return Math.min(estimatedRank, maxRank);
}

function getWeaponMaxRank(weapon: OwnedWeapon): number {
	if ((weapon.maxLevelCap ?? 30) > 30) {
		return weapon.maxLevelCap ?? 30;
	}

	const uniqueName = weapon.uniqueName.toLowerCase();
	if (
		uniqueName.includes("kuva") ||
		uniqueName.includes("tenet") ||
		uniqueName.includes("coda") ||
		uniqueName.includes("paracesis")
	) {
		return 40;
	}

	return 30;
}

function isMasteryGrantingWeapon(weapon: OwnedWeapon): boolean {
	const uniqueName = weapon.uniqueName.toLowerCase();
	const slot = weapon.slot;
	const ampWeapon = isAmpWeapon(weapon);

	if (weapon.excludeFromCodex === true) {
		return false;
	}

	if (slot === 7 && !ampWeapon) {
		return false;
	}

	if (uniqueName.includes("garudatalons")) {
		return false;
	}

	if (
		uniqueName.includes("kubrow") ||
		uniqueName.includes("kavat") ||
		uniqueName.includes("predasite") ||
		uniqueName.includes("vulpaphyla")
	) {
		return false;
	}

	return true;
}

function calculateWeaponMasteryPoints(weapons: OwnedWeapon[]): number {
	let total = 0;

	for (const weapon of weapons) {
		if (!isMasteryGrantingWeapon(weapon)) {
			continue;
		}

		const maxRank = getWeaponMaxRank(weapon);
		const rank = getRankFromAffinity(
			weapon.xp,
			WEAPON_MASTERY_PER_LEVEL,
			maxRank,
		);
		total += rank * WEAPON_MASTERY_PER_LEVEL;
	}

	return total;
}

function isArchwingSuit(warframe: Warframe): boolean {
	return (
		warframe.displayName.startsWith("<ARCHWING>") ||
		warframe.type.includes("/Powersuits/Archwing/")
	);
}

function isNecramechSuit(warframe: Warframe): boolean {
	return warframe.type.includes("/Powersuits/EntratiMech/");
}

function isAmpWeapon(weapon: OwnedWeapon): boolean {
	if (weapon.productCategory === "OperatorAmps") {
		return true;
	}

	const uid = weapon.uniqueName.toLowerCase();
	return isAmpItemType(uid);
}

function isAmpItemType(itemType: string): boolean {
	const uid = itemType.toLowerCase();
	return (
		uid.includes("/operator/amplifiers/") ||
		uid.includes("/sentients/operatoramplifiers/") ||
		uid.includes("/amps/") ||
		uid.includes("operatoramp")
	);
}

function calculateCategoryXpBreakdown(params: {
	warframes: Warframe[];
	weapons: OwnedWeapon[];
	companions: OwnedCompanion[];
	missionNormalXp: number;
	missionSteelXp: number;
	railjackIntrinsicXp: number;
	drifterIntrinsicXp: number;
}): CategoryMasteryBreakdown {
	const categories: CategoryMasteryBreakdown = {
		warframes: 0,
		primaryWeapons: 0,
		secondaryWeapons: 0,
		meleeWeapons: 0,
		missions: params.missionNormalXp,
		steelPathMissions: params.missionSteelXp,
		railjackIntrinsics: params.railjackIntrinsicXp,
		drifterIntrinsics: params.drifterIntrinsicXp,
		sentinels: 0,
		sentinelWeapons: 0,
		companions: 0,
		archwing: 0,
		archgun: 0,
		archmelee: 0,
		amps: 0,
		necramechs: 0,
	};

	for (const warframe of params.warframes) {
		const maxRank = warframe.maxLevel > 30 ? 40 : 30;
		const xp =
			getRankFromAffinity(warframe.xp, FRAME_MASTERY_PER_LEVEL, maxRank) *
			FRAME_MASTERY_PER_LEVEL;

		if (isNecramechSuit(warframe)) {
			categories.necramechs += xp;
			continue;
		}

		if (isArchwingSuit(warframe)) {
			categories.archwing += xp;
			continue;
		}

		categories.warframes += xp;
	}

	for (const weapon of params.weapons) {
		if (!isMasteryGrantingWeapon(weapon)) {
			continue;
		}

		const xp =
			getRankFromAffinity(
				weapon.xp,
				WEAPON_MASTERY_PER_LEVEL,
				getWeaponMaxRank(weapon),
			) * WEAPON_MASTERY_PER_LEVEL;

		if (isAmpWeapon(weapon)) {
			categories.amps += xp;
			continue;
		}

		switch (weapon.productCategory) {
			case "LongGuns":
				categories.primaryWeapons += xp;
				break;
			case "Pistols":
				categories.secondaryWeapons += xp;
				break;
			case "Melee":
				categories.meleeWeapons += xp;
				break;
			case "SentinelWeapons":
				categories.sentinelWeapons += xp;
				break;
			case "SpaceGuns":
				categories.archgun += xp;
				break;
			case "SpaceMelee":
				categories.archmelee += xp;
				break;
			default:
				break;
		}
	}

	for (const companion of params.companions) {
		const xp =
			getRankFromAffinity(companion.xp, FRAME_MASTERY_PER_LEVEL, 30) *
			FRAME_MASTERY_PER_LEVEL;

		if (companion.productCategory === "Sentinels") {
			categories.sentinels += xp;
		} else {
			categories.companions += xp;
		}
	}

	return categories;
}

function calculateWarframeMasteryPoints(warframes: Warframe[]): number {
	let total = 0;

	for (const warframe of warframes) {
		const maxRank = warframe.maxLevel > 30 ? 40 : 30;
		const rank = getRankFromAffinity(
			warframe.xp,
			FRAME_MASTERY_PER_LEVEL,
			maxRank,
		);
		total += rank * FRAME_MASTERY_PER_LEVEL;
	}

	return total;
}

function calculateCompanionMasteryPoints(companions: OwnedCompanion[]): number {
	let total = 0;

	for (const companion of companions) {
		const rank = getRankFromAffinity(companion.xp, FRAME_MASTERY_PER_LEVEL, 30);
		total += rank * FRAME_MASTERY_PER_LEVEL;
	}

	return total;
}

function parseInventory(inventoryRaw: string): InventoryData {
	if (!inventoryRaw) {
		return {};
	}

	try {
		return JSON.parse(inventoryRaw) as InventoryData;
	} catch {
		return {};
	}
}

function calculateVehicleMastery(inventoryData: InventoryData): {
	kDrives: number;
	plexus: number;
	countedItemTypes: Set<string>;
} {
	let kDrives = 0;
	let plexus = 0;
	const countedItemTypes = new Set<string>();

	for (const drive of inventoryData.Motorcycles || []) {
		if (drive.ItemType) {
			countedItemTypes.add(drive.ItemType);
		}

		const rank = getRankFromAffinity(
			drive.XP ?? 0,
			FRAME_MASTERY_PER_LEVEL,
			30,
		);
		kDrives += rank * FRAME_MASTERY_PER_LEVEL;
	}

	for (const harness of inventoryData.CrewShipHarnesses || []) {
		if (harness.ItemType) {
			countedItemTypes.add(harness.ItemType);
		}

		const rank = getRankFromAffinity(
			harness.XP ?? 0,
			FRAME_MASTERY_PER_LEVEL,
			30,
		);
		plexus += rank * FRAME_MASTERY_PER_LEVEL;
	}

	return { kDrives, plexus, countedItemTypes };
}

function calculateMissionMastery(
	inventoryData: InventoryData,
	nodeXpByTag: Record<string, number>,
): MissionMasteryBreakdown {
	let normalNodeXp = 0;
	let steelNodeBonusXp = 0;
	let normalJunctionXp = 0;
	let steelJunctionBonusXp = 0;

	const allNodeTags = new Set<string>();
	const steelNodeTags = new Set<string>();
	const junctionTags = new Set<string>();
	const steelJunctionTags = new Set<string>();
	const junctionXpTags = new Set<string>();
	const steelJunctionXpTags = new Set<string>();

	let missingNodeXpEntries = 0;

	let normalNodeMax = 0;
	let junctionMax = 0;

	for (const [tag, xp] of Object.entries(nodeXpByTag)) {
		if (typeof xp !== "number" || xp <= 0) {
			continue;
		}

		const isJunction = tag.endsWith("Junction") && tag.includes("To");
		if (isJunction) {
			junctionMax += 1;
		} else {
			normalNodeMax += 1;
		}
	}

	for (const mission of inventoryData.Missions || []) {
		const tag = mission.Tag;
		if (!tag) {
			continue;
		}

		if ((mission.Completes ?? 0) <= 0) {
			continue;
		}

		const isJunction =
			tag.endsWith("Junction") && tag.includes("To");
		const isSteelPath = (mission.Tier ?? 0) > 0;

		if (isJunction) {
			junctionTags.add(tag);
			if (!junctionXpTags.has(tag)) {
				junctionXpTags.add(tag);
				normalJunctionXp += 1000;
			}

			if (
				(mission.Completes ?? 0) === 2 ||
				((mission.Completes ?? 0) >= 1 && isSteelPath)
			) {
				steelJunctionTags.add(tag);
				if (!steelJunctionXpTags.has(tag)) {
					steelJunctionXpTags.add(tag);
					steelJunctionBonusXp += 1000;
				}
			}

			continue;
		}

		const missionXp = nodeXpByTag[tag];
		if (typeof missionXp === "number") {
			allNodeTags.add(tag);

			if (isSteelPath) {
				steelNodeTags.add(tag);
			}

			normalNodeXp += missionXp;
			if (isSteelPath) {
				steelNodeBonusXp += missionXp;
			}
		} else {
			missingNodeXpEntries += 1;
		}
	}

	const total =
		normalNodeXp +
		steelNodeBonusXp +
		normalJunctionXp +
		steelJunctionBonusXp;

	return {
		total,
		normalMissionXp: normalNodeXp + normalJunctionXp,
		steelPathMissionXp: steelNodeBonusXp + steelJunctionBonusXp,
		normalNodesCompleted: allNodeTags.size,
		steelPathNodes: steelNodeTags.size,
		steelPathJunctions: steelJunctionTags.size,
		junctions: junctionTags.size,
		normalNodeMax,
		junctionMax,
		steelPathNodeMax: normalNodeMax,
		steelPathJunctionMax: junctionMax,
		missingNodeXpEntries,
	};
}

function calculateInventoryEntityFallbackMastery(params: {
	inventoryData: InventoryData;
	alreadyCountedItemTypes: Set<string>;
}): InventoryEntityFallbackBreakdown {
	let sentinels = 0;
	let companions = 0;
	const countedItemTypes = new Set<string>();

	const addEntityMastery = (
		entries: InventoryEntityEntry[] | undefined,
		target: "sentinels" | "companions",
	) => {
		const maxXpByItemType = new Map<string, number>();
		for (const entry of entries || []) {
			if (!entry.ItemType) {
				continue;
			}

			const currentMax = maxXpByItemType.get(entry.ItemType) ?? 0;
			const nextXp = entry.XP ?? 0;
			if (nextXp > currentMax) {
				maxXpByItemType.set(entry.ItemType, nextXp);
			}
		}

		for (const [itemType, itemXp] of maxXpByItemType) {
			if (
				params.alreadyCountedItemTypes.has(itemType) ||
				countedItemTypes.has(itemType)
			) {
				continue;
			}

			const rank = getRankFromAffinity(
				itemXp,
				FRAME_MASTERY_PER_LEVEL,
				30,
			);
			const xp = rank * FRAME_MASTERY_PER_LEVEL;

			if (target === "sentinels") {
				sentinels += xp;
			} else {
				companions += xp;
			}

			countedItemTypes.add(itemType);
		}
	};

	addEntityMastery(params.inventoryData.Sentinels, "sentinels");
	addEntityMastery(params.inventoryData.KubrowPets, "companions");
	addEntityMastery(params.inventoryData.MoaPets, "companions");
	addEntityMastery(params.inventoryData.InfestedPets, "companions");

	return {
		sentinels,
		companions,
		total: sentinels + companions,
		countedItemTypes,
	};
}

function calculateIntrinsicsMastery(
	inventoryData: InventoryData,
): IntrinsicsMasteryBreakdown {
	let railjackRanks = 0;
	let drifterRanks = 0;

	for (const [key, value] of Object.entries(inventoryData.PlayerSkills || {})) {
		if (!key.startsWith("LPS_")) {
			continue;
		}

		if (key.startsWith("LPS_DRIFT_")) {
			drifterRanks += value;
		} else {
			railjackRanks += value;
		}
	}

	const railjack = railjackRanks * INTRINSIC_MASTERY_PER_LEVEL;
	const drifter = drifterRanks * INTRINSIC_MASTERY_PER_LEVEL;

	return {
		total: railjack + drifter,
		railjack,
		drifter,
		rankCount: railjackRanks + drifterRanks,
	};
}

function calculateMasteryRankData(totalMasteryPoints: number): {
	masteryRank: number;
	pointsIntoCurrentRank: number;
	pointsRequiredForNextRank: number;
	pointsRemainingForNextRank: number;
} {
	let masteryRank = 0;

	while (
		masteryRank < 100 &&
		getMasteryLevelTotalXPRequired(masteryRank + 1) <= totalMasteryPoints
	) {
		masteryRank += 1;
	}

	const currentRankThreshold = getMasteryLevelTotalXPRequired(masteryRank);
	const nextRankThreshold = getMasteryLevelTotalXPRequired(masteryRank + 1);
	const pointsIntoCurrentRank = totalMasteryPoints - currentRankThreshold;
	const pointsRequiredForNextRank = Math.max(
		nextRankThreshold - currentRankThreshold,
		0,
	);
	const pointsRemainingForNextRank = Math.max(
		nextRankThreshold - totalMasteryPoints,
		0,
	);

	return {
		masteryRank,
		pointsIntoCurrentRank,
		pointsRequiredForNextRank,
		pointsRemainingForNextRank,
	};
}

export function calculateMasterySummary(params: {
	warframes: Warframe[];
	weapons: OwnedWeapon[];
	companions: OwnedCompanion[];
	inventoryRaw: string;
	nodeXpByTag: Record<string, number>;
}): MasterySummary {
	const inventoryData = parseInventory(params.inventoryRaw);

	const countedItemTypes = new Set<string>();
	for (const warframe of params.warframes) {
		countedItemTypes.add(warframe.type);
	}
	for (const weapon of params.weapons) {
		countedItemTypes.add(weapon.type);
	}
	for (const companion of params.companions) {
		countedItemTypes.add(companion.type);
	}

	const weaponPoints = calculateWeaponMasteryPoints(params.weapons);
	const warframePoints = calculateWarframeMasteryPoints(params.warframes);
	const companionPoints = calculateCompanionMasteryPoints(params.companions);
	const vehicleMastery = calculateVehicleMastery(inventoryData);
	const inventoryEntityFallback = calculateInventoryEntityFallbackMastery({
		inventoryData,
		alreadyCountedItemTypes: countedItemTypes,
	});
 
	for (const itemType of vehicleMastery.countedItemTypes) {
		countedItemTypes.add(itemType);
	}
	for (const itemType of inventoryEntityFallback.countedItemTypes) {
		countedItemTypes.add(itemType);
	}

	const equipmentTotal =
		weaponPoints +
		warframePoints +
		companionPoints +
		vehicleMastery.kDrives +
		vehicleMastery.plexus +
		inventoryEntityFallback.total;

	const missionBreakdown = calculateMissionMastery(
		inventoryData,
		params.nodeXpByTag,
	);
	const intrinsicsBreakdown = calculateIntrinsicsMastery(inventoryData);
	const categoryXp = calculateCategoryXpBreakdown({
		warframes: params.warframes,
		weapons: params.weapons,
		companions: params.companions,
		missionNormalXp: missionBreakdown.normalMissionXp,
		missionSteelXp: missionBreakdown.steelPathMissionXp,
		railjackIntrinsicXp: intrinsicsBreakdown.railjack,
		drifterIntrinsicXp: intrinsicsBreakdown.drifter,
	});
	categoryXp.sentinels += inventoryEntityFallback.sentinels;
	categoryXp.companions +=
		inventoryEntityFallback.companions + vehicleMastery.plexus;

	const totalMasteryPoints =
		equipmentTotal + missionBreakdown.total + intrinsicsBreakdown.total;
	const rankData = calculateMasteryRankData(totalMasteryPoints);
	const companionEquipmentPoints =
		companionPoints + inventoryEntityFallback.companions + vehicleMastery.plexus;

	return {
		totalMasteryPoints,
		equipment: {
			weapons: weaponPoints,
			warframes: warframePoints,
			companions: companionEquipmentPoints,
			kDrives: vehicleMastery.kDrives,
			total: equipmentTotal,
		},
		missions: missionBreakdown,
		intrinsics: intrinsicsBreakdown,
		categoryXp,
		...rankData,
	};
}
