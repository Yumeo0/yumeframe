export interface RelicRewardLike {
    rarity: "COMMON" | "UNCOMMON" | "RARE";
    ducats: number;
}

export interface RelicRewardPlatinumLike {
    rarity: "COMMON" | "UNCOMMON" | "RARE";
    platinum: number;
    itemCount: number;
}

export function dropChance(refinementLevel: 0 | 1 | 2 | 3) {
    switch (refinementLevel) {
        case 0:
            return { common: 0.76, uncommon: 0.22, rare: 0.02 };
        case 1:
            return { common: 0.7, uncommon: 0.26, rare: 0.04 };
        case 2:
            return { common: 0.6, uncommon: 0.34, rare: 0.06 };
        case 3:
            return { common: 0.5, uncommon: 0.4, rare: 0.1 };
    }
}

export function calculateExpectedDucats(
    rewards: RelicRewardLike[],
    refinementLevel: 0 | 1 | 2 | 3,
): number {
    if (rewards.length === 0) {
        return 0;
    }

    const chance = dropChance(refinementLevel);
    const counts = {
        COMMON: rewards.filter((reward) => reward.rarity === "COMMON").length,
        UNCOMMON: rewards.filter((reward) => reward.rarity === "UNCOMMON").length,
        RARE: rewards.filter((reward) => reward.rarity === "RARE").length,
    };

    let expected = 0;
    for (const reward of rewards) {
        if (reward.rarity === "COMMON" && counts.COMMON > 0) {
            expected += (chance.common / counts.COMMON) * reward.ducats;
        } else if (reward.rarity === "UNCOMMON" && counts.UNCOMMON > 0) {
            expected += (chance.uncommon / counts.UNCOMMON) * reward.ducats;
        } else if (reward.rarity === "RARE" && counts.RARE > 0) {
            expected += (chance.rare / counts.RARE) * reward.ducats;
        }
    }

    return Math.round(expected * 100) / 100;
}

export function calculateExpectedPlatinum(
    rewards: RelicRewardPlatinumLike[],
    refinementLevel: 0 | 1 | 2 | 3,
): number {
    if (rewards.length === 0) {
        return 0;
    }

    const chance = dropChance(refinementLevel);
    const counts = {
        COMMON: rewards.filter((reward) => reward.rarity === "COMMON").length,
        UNCOMMON: rewards.filter((reward) => reward.rarity === "UNCOMMON").length,
        RARE: rewards.filter((reward) => reward.rarity === "RARE").length,
    };

    let expected = 0;
    for (const reward of rewards) {
        const totalRewardPlatinum = reward.platinum * reward.itemCount;
        if (reward.rarity === "COMMON" && counts.COMMON > 0) {
            expected += (chance.common / counts.COMMON) * totalRewardPlatinum;
        } else if (reward.rarity === "UNCOMMON" && counts.UNCOMMON > 0) {
            expected += (chance.uncommon / counts.UNCOMMON) * totalRewardPlatinum;
        } else if (reward.rarity === "RARE" && counts.RARE > 0) {
            expected += (chance.rare / counts.RARE) * totalRewardPlatinum;
        }
    }

    return Math.round(expected * 100) / 100;
}