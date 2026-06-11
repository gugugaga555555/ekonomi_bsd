import { world } from "@minecraft/server";
import { RANKS } from "./ranks_data.js";

export function formatRupiah(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return "Rp0";

    const abs = Math.abs(amount);
    let str = "";

    if (abs >= 1000000000) {
        str = (amount / 1000000000).toFixed(1).replace(/\.0$/, '') + " Miliar";
    } else if (abs >= 1000000) {
        str = (amount / 1000000).toFixed(1).replace(/\.0$/, '') + " Juta";
    } else if (abs >= 10000) {
        str = (amount / 1000).toFixed(1).replace(/\.0$/, '') + " Ribu";
    } else {
        str = amount.toLocaleString("id-ID");
    }

    // Replace JS decimal point with Indonesian comma
    return "Rp" + str.replace('.', ',');
}

// Fixed: RANKS sekarang diimpor dari ranks_data.js (sumber tunggal)
// Tidak lagi ada duplikasi data rank antara utils.js dan rank_system.js
export function getUiHeader(player) {
    const objDompet = world.scoreboard.getObjective("dompet");
    const objCore = world.scoreboard.getObjective("core");

    let rupiah = 0;
    let core = 0;
    try { if (objDompet) rupiah = objDompet.getScore(player) || 0; } catch(e) {}
    try { if (objCore) core = objCore.getScore(player) || 0; } catch(e) {}

    let rankBadge = "§7[Warga Biasa]";
    try {
        const rankId = player.getDynamicProperty("player_rank");
        if (typeof rankId === 'number' && rankId < RANKS.length) {
            rankBadge = RANKS[rankId].badge;
        }
    } catch(e) {}

    return `§fSaldo: §e${formatRupiah(rupiah)} §f| Core: §b${core} §f| Pangkat: ${rankBadge}\n§7----------------------------------§r\n`;
}

export function sendToInbox(targetName, senderName, amount, message, itemPayload = null) {
    try {
        const inboxDataStr = world.getDynamicProperty(`inbox_${targetName}`);
        let inbox = [];
        if (inboxDataStr && typeof inboxDataStr === 'string') {
            inbox = JSON.parse(inboxDataStr);
        }

        inbox.push({
            sender: senderName,
            amount: amount,
            message: message,
            timestamp: Date.now(),
            item: itemPayload // { typeId: "minecraft:apple", amount: 10 }
        });

        world.setDynamicProperty(`inbox_${targetName}`, JSON.stringify(inbox));
    } catch(e) {}
}

export function getInbox(playerName) {
    try {
        const inboxDataStr = world.getDynamicProperty(`inbox_${playerName}`);
        if (inboxDataStr && typeof inboxDataStr === 'string') {
            return JSON.parse(inboxDataStr);
        }
    } catch(e) {}
    return [];
}

export function clearInbox(playerName) {
    try {
        world.setDynamicProperty(`inbox_${playerName}`, JSON.stringify([]));
    } catch(e) {}
}

export function getScore(player, objectiveId) {
    const obj = world.scoreboard.getObjective(objectiveId);
    if (!obj) return 0;
    try {
        return obj.getScore(player.scoreboardIdentity) || 0;
    } catch {
        return 0;
    }
}

export function setScore(player, objectiveId, score) {
    const obj = world.scoreboard.getObjective(objectiveId);
    if (obj) {
        obj.setScore(player, score);
    }
}
