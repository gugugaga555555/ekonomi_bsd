import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getScore, setScore } from "./utils.js";

// ============================================================
// SISTEM BONUS MASUK HARIAN -- Login Streak Reward (v2.1)
// ============================================================

// Streak reward definitions: Day 1-7, then cycles back
const STREAK_REWARDS = [
    { day: 1, rewardRp: 5000, rewardCore: 0, rewardItem: null, bonus: "Selamat datang kembali!" },
    { day: 2, rewardRp: 10000, rewardCore: 0, rewardItem: null, bonus: "Terus semangat!" },
    { day: 3, rewardRp: 15000, rewardCore: 0, rewardItem: "minecraft:golden_apple", bonus: "Apel Emas untukmu!" },
    { day: 4, rewardRp: 20000, rewardCore: 0, rewardItem: null, bonus: "Hampir setengah jalan!" },
    { day: 5, rewardRp: 30000, rewardCore: 0, rewardItem: "minecraft:experience_bottle", bonus: "Botol Pengalaman!" },
    { day: 6, rewardRp: 40000, rewardCore: 0, rewardItem: null, bonus: "Satu hari lagi!" },
    { day: 7, rewardRp: 75000, rewardCore: 1, rewardItem: "minecraft:totem_of_undying", bonus: "HADIAH BESAR! +1 Core & Totem!" },
];

// ============================================================
// DATA MANAGEMENT
// ============================================================

function getPlayerLoginData(player) {
    try {
        const str = player.getDynamicProperty("login_reward_data");
        if (str && typeof str === 'string') {
            return JSON.parse(str);
        }
    } catch(e) {}
    return null;
}

function savePlayerLoginData(player, data) {
    try {
        player.setDynamicProperty("login_reward_data", JSON.stringify(data));
    } catch(e) {}
}

// Check if two timestamps are on different days (same timezone)
function isDifferentDay(ts1, ts2) {
    const d1 = new Date(ts1);
    const d2 = new Date(ts2);
    return d1.getFullYear() !== d2.getFullYear() ||
           d1.getMonth() !== d2.getMonth() ||
           d1.getDate() !== d2.getDate();
}

// Check if more than 2 days have passed (streak breaks)
function isStreakBroken(lastLoginTs, nowTs) {
    const diff = nowTs - lastLoginTs;
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    return diff > twoDays;
}

// ============================================================
// LOGIN REWARD PROCESSING
// ============================================================

export function processLoginReward(player) {
    const now = Date.now();
    let data = getPlayerLoginData(player);

    if (!data) {
        // First time player
        data = {
            streak: 0,
            lastLogin: 0,
            todayClaimed: false,
            totalLogins: 0
        };
    }

    // Check if already claimed today
    if (data.lastLogin && !isDifferentDay(data.lastLogin, now)) {
        return; // Already logged in today
    }

    // Check if streak is broken
    if (data.lastLogin && isStreakBroken(data.lastLogin, now)) {
        data.streak = 0; // Reset streak
    }

    // Increment streak (max 7, then cycles)
    data.streak = Math.min(data.streak + 1, 7);
    data.lastLogin = now;
    data.todayClaimed = false;
    data.totalLogins = (data.totalLogins || 0) + 1;

    savePlayerLoginData(player, data);

    // Show login reward popup after a short delay
    system.runTimeout(() => {
        showLoginRewardPopup(player, data);
    }, 40); // 2 seconds delay after spawn
}

function showLoginRewardPopup(player, data) {
    const rewardDef = STREAK_REWARDS[data.streak - 1] || STREAK_REWARDS[0];

    const form = new ActionFormData();
    form.title("§e§lBonus Masuk Harian");

    let bodyText = `§fStreak Login: §e${data.streak} Hari Berturut!\n\n`;
    bodyText += `§eHadiah Hari Ke-${data.streak}:\n`;
    bodyText += `  §e+${formatRupiah(rewardDef.rewardRp)}\n`;
    if (rewardDef.rewardCore > 0) {
        bodyText += `  §b+${rewardDef.rewardCore} Core\n`;
    }
    if (rewardDef.rewardItem) {
        const itemName = rewardDef.rewardItem.replace("minecraft:", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        bodyText += `  §a+1 ${itemName}\n`;
    }
    bodyText += `\n§7"${rewardDef.bonus}"\n\n`;

    // Show streak progress
    bodyText += `§eStreak Progress:\n`;
    for (let i = 0; i < 7; i++) {
        const dayReward = STREAK_REWARDS[i];
        if (i + 1 <= data.streak) {
            bodyText += `  §aDay ${i + 1}: §f${formatRupiah(dayReward.rewardRp)}`;
            if (dayReward.rewardCore > 0) bodyText += ` §b+${dayReward.rewardCore}C`;
            bodyText += ` §a[Selesai]\n`;
        } else if (i + 1 === data.streak + 1) {
            bodyText += `  §eDay ${i + 1}: §f${formatRupiah(dayReward.rewardRp)}`;
            if (dayReward.rewardCore > 0) bodyText += ` §b+${dayReward.rewardCore}C`;
            bodyText += ` §e[Besok]\n`;
        } else {
            bodyText += `  §8Day ${i + 1}: §7???\n`;
        }
    }

    bodyText += `\n§7Login setiap hari untuk mempertahankan streak!`;
    bodyText += `\n§7Total login: §e${data.totalLogins || 0} hari`;

    form.body(bodyText);
    form.button("§aAmbil Hadiah!\n§7Klaim bonus hari ini");

    form.show(player).then(res => {
        if (res.canceled) {
            // Auto-claim even if they close the form
            claimLoginReward(player);
            return;
        }
        claimLoginReward(player);
    });
}

function claimLoginReward(player) {
    const data = getPlayerLoginData(player);
    if (!data || data.todayClaimed) return;

    const rewardDef = STREAK_REWARDS[data.streak - 1] || STREAK_REWARDS[0];

    // Give Rupiah
    if (rewardDef.rewardRp > 0) {
        const currentCoins = getScore(player, "dompet");
        setScore(player, "dompet", currentCoins + rewardDef.rewardRp);
    }

    // Give Core
    if (rewardDef.rewardCore > 0) {
        const objCore = world.scoreboard.getObjective("core");
        if (objCore) {
            let currentCore = 0;
            try { currentCore = objCore.getScore(player) || 0; } catch(e) {}
            objCore.setScore(player, currentCore + rewardDef.rewardCore);
        }
    }

    // Give Item
    if (rewardDef.rewardItem) {
        try {
            const { ItemStack } = require("@minecraft/server");
            const item = new ItemStack(rewardDef.rewardItem, 1);
            const invComponent = player.getComponent("inventory");
            if (invComponent && invComponent.container) {
                invComponent.container.addItem(item);
            }
        } catch(e) {}
    }

    data.todayClaimed = true;
    savePlayerLoginData(player, data);

    player.sendMessage(`§a[Bonus Harian] §fKlaim bonus login Day ${data.streak}: §e${formatRupiah(rewardDef.rewardRp)}${rewardDef.rewardCore > 0 ? ` §b+${rewardDef.rewardCore} Core` : ""}${rewardDef.rewardItem ? " §a+1 Item" : ""}`);
    player.runCommandAsync("playsound random.orb @s");
}

// ============================================================
// HELPER -- Get login data for display
// ============================================================

export function getPlayerStreakInfo(player) {
    const data = getPlayerLoginData(player);
    if (!data) return { streak: 0, totalLogins: 0, todayClaimed: false };
    return { streak: data.streak || 0, totalLogins: data.totalLogins || 0, todayClaimed: data.todayClaimed || false };
}
