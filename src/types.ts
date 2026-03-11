// ============================================
// App-specific interfaces
// ============================================

export interface AssetEntry {
	filename: string;
	hash: string;
}

export interface WarframeConfig {
	Skins?: string[];
	Upgrades?: string[];
	attcol?: Record<string, number>;
	pricol?: Record<string, number>;
	sigcol?: Record<string, number>;
}

export interface WarframeSuit {
	ItemId: { $oid: string };
	ItemType: string;
	XP: number;
	Favorite: boolean;
	Configs: WarframeConfig[];
	ArchonCrystalUpgrades?: Array<{ Color: string; UpgradeType: string }>;
	Features?: number;
	FocusLens?: string;
	InfestationDate?: { $date: { $numberLong: string } };
	UpgradeVer?: number;
}

export interface ManifestEntry {
	uniqueName: string;
	textureLocation: string;
}

export interface RecipeIngredient {
	ItemType: string;
	ItemCount: number;
}

export interface RecipeData {
	uniqueName: string;
	resultType: string;
	buildTime?: number;
	primeSellingPrice?: number;
	ingredients: RecipeIngredient[];
}

// Raw export data from Warframe API
export interface ExportWarframeEntry {
	uniqueName: string;
	name: string;
	parentName?: string;
	description?: string;
	health?: number;
	shield?: number;
	armor?: number;
	stamina?: number;
	power?: number;
	masteryReq?: number;
	sprintSpeed?: number;
	abilities?: Array<{ abilityUniqueName: string; abilityName: string; description: string }>;
	productCategory?: string;
	releaseDate?: string;
}

export interface ExportWarframesWrapper {
	ExportWarframes: ExportWarframeEntry[];
}

export type ExportWeaponEntry = WeaponBase &
	Partial<
		Omit<GunWeapon, keyof WeaponBase> &
		Omit<MeleeWeapon, keyof WeaponBase>
	>;

export interface ExportWeaponsWrapper {
	ExportWeapons: ExportWeaponEntry[];
}

export interface ExportRecipeEntry {
	uniqueName: string;
	resultType: string;
	buildTime?: number;
	primeSellingPrice?: number;
	ingredients: RecipeIngredient[];
}

export interface ExportRecipesWrapper {
	ExportRecipes: ExportRecipeEntry[];
}

export interface WarframePart {
	name: string;
	itemType?: string;
	owned: boolean;
	imageUrl: string;
	count?: number;
	hasRecipe?: boolean;
	isCraftingRecipe?: boolean;
	requirements?: WeaponCraftRequirement[];
}

export interface Warframe {
	name: string;
	displayName: string;
	type: string;
	xp: number;
	maxLevel: number;
	imageUrl: string;
	favorite: boolean;
	owned: boolean;
	isSubsumed?: boolean;
	parts: WarframePart[];
}

export interface InventoryWeaponEntry {
	ItemType: string;
	XP?: number;
	Favorite?: boolean;
}

export interface OwnedWeapon extends ExportWeaponEntry {
	displayName: string;
	type: string;
	xp: number;
	favorite: boolean;
	owned: boolean;
	imageUrl: string;
	requirements: WeaponCraftRequirement[];
}

export interface WeaponCraftRequirement {
	name: string;
	itemType?: string;
	count: number;
	imageUrl: string;
	owned?: boolean;
	hasRecipe?: boolean;
	isCraftingRecipe?: boolean;
	requirements?: WeaponCraftRequirement[];
}

// ============================================
// Generic Entry Schema
// ============================================

export interface GenericEntry {
	uniqueName: string;
	name: string;
	description: string;
	codexSecret: boolean;
	parentName?: string;
	excludeFromCodex?: boolean;
}

// ============================================
// ExportWeapons - Weapons Schema
// ============================================

export type ProductCategory =
	| "Pistols"
	| "LongGuns"
	| "Melee"
	| "SentinelWeapons"
	| "SpaceGuns"
	| "SpaceMelee"
	| "OperatorAmps"
	| "SpecialItems"
	| "CrewShipWeapons";

export enum WeaponSlot {
	Secondary = 0,      // Secondaries
	Primary = 1,        // Primaries/Arch-guns
	Melee = 5,          // Melees/Arch-melees
	Exalted = 7,        // Exalted Weapons
	Railjack = 13,      // Railjack armaments
}

export type NoiseLevel = "ALARMING" | "SILENT";

export type TriggerType =
	| "SEMI"
	| "AUTO"
	| "BURST"
	| "HELD"
	| "CHARGE"
	| "DUPLEX"
	| "ACTIVE";

/**
 * 20-element array representing damage values for each damage type:
 * [Impact, Puncture, Slash, Heat, Cold, Electricity, Toxin, Blast, Radiation,
 *  Gas, Magnetic, Viral, Corrosive, Void, Tau, DT_CINEMATIC, DT_SHIELD_DRAIN,
 *  DT_HEALTH_DRAIN, DT_ENERGY_DRAIN, True]
 */
export type DamagePerShot = [
	number, number, number, number, number,
	number, number, number, number, number,
	number, number, number, number, number,
	number, number, number, number, number
];

export interface WeaponBase {
	name: string;
	uniqueName: string;
	codexSecret: boolean;
	damagePerShot: DamagePerShot;
	totalDamage: number;
	description: string;
	criticalChance: number;
	criticalMultiplier: number;
	procChance: number;
	fireRate: number;
	masteryReq: number;
	productCategory: ProductCategory;
	excludeFromCodex?: boolean;
	slot: WeaponSlot;
	omegaAttenuation: number;
	maxLevelCap?: number;
}

export interface GunWeapon extends WeaponBase {
	accuracy: number;
	noise: NoiseLevel;
	trigger: TriggerType;
	magazineSize: number;
	reloadTime: number;
	sentinel?: boolean;
	multishot: number;
}

export interface MeleeWeapon extends WeaponBase {
	blockingAngle: number;
	comboDuration: number;
	followThrough: number;
	range: number;
	slamAttack: number;
	slamRadialDamage: number;
	slamRadius: number;
	slideAttack: number;
	heavyAttackDamage: number;
	heavySlamAttack: number;
	heavySlamRadialDamage: number;
	heavySlamRadius: number;
	windUp: number;
}

export type Weapon = GunWeapon | MeleeWeapon;

// ============================================
// ExportWarframes - Avatars Schema
// ============================================

export type AvatarProductCategory = "Suits" | "SpaceSuits" | "MechSuits";

export interface WarframeAbility {
	abilityUniqueName: string;
	abilityName: string;
	description: string;
}

export interface WarframeAvatar {
	uniqueName: string;
	name: string;
	parentName: string;
	description: string;
	health: number;
	shield: number;
	armor: number;
	stamina: number;
	power: number;
	codexSecret: boolean;
	masteryReq: number;
	sprintSpeed: number;
	passiveDescription: string;
	exalted?: string[];
	abilities: WarframeAbility[];
	productCategory: AvatarProductCategory;
}

// ============================================
// ExportSentinels - Companions Schema
// ============================================

export type CompanionProductCategory = "Sentinels" | "KubrowPets" | "SpecialItems";

export interface Companion {
	uniqueName: string;
	name: string;
	parentName?: string;
	description: string;
	health: number;
	shield: number;
	armor: number;
	stamina: number;
	power: number;
	codexSecret: boolean;
	masteryReq?: number;
	productCategory: CompanionProductCategory;
	excludeFromCodex?: boolean;
}

export interface ExportCompanionsWrapper {
	ExportSentinels: Companion[];
}

export interface InventoryCompanionDetails {
	Name?: string;
}

export interface InventoryCompanionEntry {
	ItemType: string;
	XP?: number;
	Favorite?: boolean;
	Details?: InventoryCompanionDetails;
}

export interface OwnedCompanion extends Companion {
	displayName: string;
	type: string;
	xp: number;
	favorite: boolean;
	owned: boolean;
	imageUrl: string;
	customName?: string;
	requirements: WeaponCraftRequirement[];
}

// ============================================
// ExportSortieRewards
// ============================================

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY";

export interface SortieReward {
	rewardName: string;
	rarity: "COMMON";
	tier: 0;
	itemCount: number;
	probability: number;
}

// ============================================
// ExportNightWave
// ============================================

export interface NightWaveChallenge {
	uniqueName: string;
	name: string;
	description: string;
	standing: number;
	required: number;
}

export interface NightWaveReward {
	uniqueName: string;
	itemCount: number;
}

export interface NightWave {
	affiliationTag: string;
	challenges: NightWaveChallenge[];
	rewards: NightWaveReward[];
}

// ============================================
// ExportRailjack
// ============================================

export interface RailjackNode {
	uniqueName: string;
	name: string;
}

export interface ExportRailjack {
	nodes: RailjackNode[];
}

// ============================================
// ExportIntrinsics
// ============================================

export interface IntrinsicRank {
	name: string;
	description: string;
}

export interface Intrinsic {
	name: string;
	ranks: IntrinsicRank[];
}

// ============================================
// ExportOther
// ============================================

export interface OtherItem {
	uniqueName: string;
	name: string;
	description: string;
	excludeFromCodex?: boolean;
}

// ============================================
// ExportUpgrades - Upgrades Schema
// ============================================

export type Polarity =
	| "AP_DEFENSE"
	| "AP_ATTACK"
	| "AP_TACTIC"
	| "AP_POWER"
	| "AP_WARD"
	| "AP_PRECEPT"
	| "AP_UNIVERSAL"
	| "AP_UMBRA"
	| "AP_ANY";

export type UpgradeType =
	| "WARFRAME"
	| "PRIMARY"
	| "SECONDARY"
	| "MELEE"
	| "ARCHWING"
	| "ARCHGUN"
	| "ARCHMELEE"
	| "SENTINEL"
	| "COMPANION"
	| "NECRAMECH"
	| "STANCE"
	| "AURA"
	| "PARAZON";

export interface LevelStat {
	stats: string[];
}

export interface Upgrade {
	uniqueName: string;
	name: string;
	polarity: Polarity;
	rarity: Rarity;
	codexSecret: boolean;
	baseDrain: number;
	fusionLimit: number;
	excludeFromCodex?: boolean;
	isUtility?: boolean;
	compatName?: string;
	type: UpgradeType;
	description?: string[];
	subtype?: string;
	levelStats?: LevelStat[];
}

// Riven Mods

export interface RivenUpgradeValue {
	value: number;
	locTag: string;
}

export interface RivenUpgradeEntry {
	tag: string;
	prefixTag: string;
	suffixTag: string;
	upgradeValues: RivenUpgradeValue[];
}

export interface RivenChallengeComplication {
	fullName: string;
	description: string;
	overrideTag?: string;
}

export interface RivenChallenge {
	fullName: string;
	description: string;
	complications: RivenChallengeComplication[];
}

export interface RivenMod {
	uniqueName: string;
	name: string;
	polarity: Polarity;
	rarity: Rarity;
	codexSecret: boolean;
	baseDrain: number;
	fusionLimit: number;
	excludeFromCodex?: boolean;
	upgradeEntries: RivenUpgradeEntry[];
	availableChallenges: RivenChallenge[];
}

// Sets

export interface ModSet {
	uniqueName: string;
	numUpgradesInSet: number;
	stats: string[];
}

// ============================================
// ExportRecipes - Blueprints Schema
// ============================================

export interface RecipeIngredient {
	ItemType: string;
	ItemCount: number;
	ProductCategory: string;
}

export interface SecretIngredient {
	ItemType: string;
	ItemCount: number;
}

export interface Recipe {
	uniqueName: string;
	resultType: string;
	buildPrice: number;
	buildTime: number;
	skipBuildTimePrice: number;
	consumeOnUse: boolean;
	num: number;
	codexSecret: boolean;
	primeSellingPrice?: number;
	ingredients: RecipeIngredient[];
	secretIngredients: SecretIngredient[];
}

// ============================================
// ExportResources - Resources Schema
// ============================================

export interface Resource {
	uniqueName: string;
	name: string;
	description: string;
	codexSecret: boolean;
	primeSellingPrice?: number;
	parentName?: string;
	excludeFromCodex?: boolean;
	showInInventory?: boolean;
}

export interface ExportResourcesWrapper {
	ExportResources: Resource[];
}

export interface InventoryMiscItem {
	ItemType: string;
	ItemCount: number;
}

export interface InventoryPendingRecipeEntry {
	ItemType: string;
	CompletionDate?: {
		$date?: {
			$numberLong?: string;
		};
	};
}

export interface PendingRecipe {
	itemType: string;
	resultType: string;
	name: string;
	imageUrl: string;
	completionTimestamp: number;
	buildTime?: number;
}

// ============================================
// ExportRelicArcane - Void Relics Schema
// ============================================

export interface RelicReward {
	rewardName: string;
	rarity: "COMMON" | "UNCOMMON" | "RARE";
	tier: number;
	itemCount: number;
}

export interface VoidRelic {
	uniqueName: string;
	name: string;
	codexSecret: boolean;
	description: string;
	relicRewards: RelicReward[];
}

export interface ExportRelicArcaneWrapper {
	ExportRelicArcane: VoidRelic[];
}

export interface OwnedRelicReward extends RelicReward {
	imageUrl: string;
	ducats: number;
	platinum: number;
}

export interface OwnedRelic {
	uniqueName: string;
	name: string;
	description: string;
	count: number;
	imageUrl: string;
	refinement: "Unleveled" | "Exceptional" | "Flawless" | "Radiant";
	refinementLevel: 0 | 1 | 2 | 3;
	expectedDucats: number;
	expectedPlatinum: number;
	isPlatinumReady: boolean;
	relicRewards: OwnedRelicReward[];
}

export type RelicScanTriggerSource = "log" | "hotkey" | "manual" | "image-test";

export type RelicScanStatus =
	| "triggered"
	| "resolved"
	| "no-data"
	| "error";

export interface RelicScanRewardValue {
	rewardName: string;
	displayName: string;
	position?: 1 | 2 | 3 | 4;
	platinum: number;
	ducats: number;
	confidence: number;
	priceSource: "daily-snapshot" | "none";
	ducatSource: "recipe" | "none";
}

export interface RelicScanEntry {
	id: string;
	triggeredAt: number;
	source: RelicScanTriggerSource;
	status: RelicScanStatus;
	rewards: RelicScanRewardValue[];
	rawCandidates: string[];
	error?: string;
}

// ============================================
// ExportRelicArcane - Arcanes Schema
// ============================================

export interface Arcane {
	uniqueName: string;
	name: string;
	codexSecret: boolean;
	rarity: Rarity;
	excludeFromCodex?: boolean;
	levelStats: LevelStat[];
}

// ============================================
// ExportGear - Gears Schema
// ============================================

export interface Gear {
	uniqueName: string;
	name: string;
	description: string;
	codexSecret: boolean;
	parentName?: string;
}

// ============================================
// ExportRegions - Nodes Schema
// ============================================

export type SystemIndex =
	| 0  // Mercury
	| 1  // Venus
	| 2  // Earth
	| 3  // Mars
	| 4  // Jupiter
	| 5  // Saturn
	| 6  // Uranus
	| 7  // Neptune
	| 8  // Pluto
	| 9  // Ceres
	| 10 // Eris
	| 11 // Sedna
	| 12 // Europa
	| 13 // Clan Dojo
	| 14 // Void
	| 15 // Phobos
	| 16 // Deimos
	| 17 // Lua
	| 18 // Kuva Fortress
	| 19 // Sanctuary Onslaught
	| 20 // Veil Proxima
	| 21 // Zariman
	| 22 // Duviri
	| 23; // Höllvania

export type MissionIndex =
	| 0  // Assassination
	| 1  // Exterminate
	| 2  // Survival
	| 3  // Rescue
	| 4  // Sabotage
	| 5  // Capture
	| 6  // Unknown
	| 7  // Spy
	| 8  // Defense
	| 9  // Mobile Defense
	| 10 // Unknown
	| 11 // Unknown
	| 12 // Unknown
	| 13 // Interception
	| 14 // Hijack
	| 15 // Hive Sabotage
	| 16 // Unknown
	| 17 // Excavation
	| 18 // Unknown
	| 19 // Unknown
	| 20 // Unknown
	| 21 // Infested Salvage
	| 22 // Rathuum
	| 23 // Unknown
	| 24 // Pursuit
	| 25 // Rush
	| 26 // Assault
	| 27 // Defection
	| 28 // Landscape
	| 29 // Unknown
	| 30 // Unknown
	| 31 // The Circuit
	| 32 // Unknown
	| 33 // Disruption
	| 34 // Void Flood
	| 35 // Void Cascade
	| 36 // Void Armageddon
	| 37 // Unknown
	| 38 // Alchemy
	| 39 // Unknown
	| 40 // Legacyte Harvest
	| 41 // Shrine Defense
	| 42; // Faceoff

export type FactionIndex =
	| 0 // Grineer
	| 1 // Corpus
	| 2 // Infested
	| 3 // Corrupted
	| 7 // The Murmur
	| 8 // Scaldra
	| 9; // Techrot

export type NodeType = 0 | 4; // 4 for Dark Sector missions, otherwise 0

export interface RegionNode {
	uniqueName: string;
	name: string;
	systemIndex: SystemIndex;
	systemName: string;
	nodeType: NodeType;
	masteryReq: number;
	missionIndex: MissionIndex;
	factionIndex: FactionIndex;
	minEnemyLevel: number;
	maxEnemyLevel: number;
}

// ============================================
// ExportFlavour - Color Palette Schema
// ============================================

export interface HexColour {
	value: string;
}

export interface ColorPalette {
	uniqueName: string;
	name: string;
	description: string;
	codexSecret: boolean;
	excludeFromCodex?: boolean;
	hexColours: HexColour[];
}

// ============================================
// ExportDrones - Extractors Schema
// ============================================

/**
 * Capacity multiplier array: [common, uncommon, rare, research]
 */
export type CapacityMultiplier = [number, number, number, number];

export interface Extractor {
	uniqueName: string;
	name: string;
	description: string;
	binCount: number;
	binCapacity: number;
	fillRate: number;
	durability: number;
	repairRate: number;
	codexSecret: boolean;
	capacityMultiplier: CapacityMultiplier;
	specialities: string[];
}
