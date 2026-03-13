export interface CollectionPart {
	name: string;
	imageUrl: string;
	itemType?: string;
	owned?: boolean;
	count?: number;
	hasRecipe?: boolean;
	isCraftingRecipe?: boolean;
	requirements?: CollectionPart[];
}

export interface CollectionItem {
	key: string;
	name: string;
	displayName: string;
	xp: number;
	isWeapon: boolean;
	isSubsumed?: boolean;
	maxLevel: number;
	imageUrl: string;
	favorite: boolean;
	owned: boolean;
	isCraftingRecipe?: boolean;
	parts: CollectionPart[];
}
