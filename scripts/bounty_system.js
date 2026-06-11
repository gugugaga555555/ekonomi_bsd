import { world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { formatRupiah, getScore, setScore } from "./utils.js";
import { trackStat } from "./stats_system.js";
import { unlockAchievement } from "./achievement_system.js";

function loadBounties() {
    try {
        const data = world.getDynamicProperty("active_bounties");
        if (data && typeof data === 'string') {
            return JSON.parse(data);
        }
    } catch(e) {}
    return {};
}

function saveBounties(bountiesObj) {
    world.setDynamicProperty("active_bounties", JSON.stringify(bountiesObj));
}

// Global variable to store active bounties loaded from persistent storage
// Structure: { "TargetPlayerName": { amount: number, setter: "SetterName" } }
let activeBounties = loadBounties();

function openBountyMenu(player) {
    const form = new ActionFormData();
    form.title("§cSistem Bounty");
    form.button("§ePasang Bounty Baru\n§7Taruh harga buronan");
    form.button("§aLihat Daftar Bounty\n§7Cek siapa saja yang diincar");

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === 0) {
            openSetBountyMenu(player);
        } else if (response.selection === 1) {
            openListBountyMenu(player);
        }
    });
}

function openSetBountyMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[System] Tidak ada pemain lain yang online untuk dijadikan buronan.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title("§cPasang Bounty");
    form.dropdown("Pilih Target Buronan:", playerNames);
    form.textField("Harga Bounty (Rupiah):", "Contoh: 500");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetIndex = response.formValues[0];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah Rupiah tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Saldo Rupiah Anda tidak mencukupi untuk memasang Bounty!");
            return;
        }

        const targetPlayerName = playerNames[targetIndex];

        // Deduct coins
        setScore(player, "dompet", currentCoins - amount);

        // Add to active bounties and save to world properties
        if (activeBounties[targetPlayerName]) {
            activeBounties[targetPlayerName].amount += amount;
        } else {
            activeBounties[targetPlayerName] = { amount: amount, setter: player.name };
        }
        saveBounties(activeBounties);
        trackStat(player, "bountiesSet", 1);
        unlockAchievement(player, "first_bounty_set");

        world.sendMessage(`§c§l[BOUNTY] §r§e${player.name} §ftelah memasang harga buronan sebesar §a${formatRupiah(amount)} §funtuk kepala §c${targetPlayerName}§f!`);
    });
}

function openListBountyMenu(player) {
    const form = new ActionFormData();
    form.title("§cDaftar Buronan");

    const targets = Object.keys(activeBounties);
    if (targets.length === 0) {
        form.body("§7Saat ini tidak ada pemain yang menjadi buronan.");
    } else {
        let bodyText = "Daftar pemain yang sedang diincar:\n\n";
        for (const target of targets) {
            bodyText += `§c- ${target} §f(Harga: §e${formatRupiah(activeBounties[target].amount)}§f)\n`;
        }
        form.body(bodyText);
    }

    form.button("§aKembali");
    form.show(player).then(res => {
        if (!res.canceled) {
            openBountyMenu(player);
        }
    });
}

function openTopKoinMenu(player) {
    const obj = world.scoreboard.getObjective("dompet");
    if (!obj) {
        player.sendMessage("§c[Sistem] Lembar catatan belum tersedia.");
        return;
    }

    try {
        const scores = obj.getScores();
        // Sort descending
        scores.sort((a, b) => b.score - a.score);

        const form = new ActionFormData();
        form.title("§6Papan Peringkat Konglomerat");

        let bodyText = "§eDaftar 10 Entitas Paling Makmur:\n\n";

        const maxDisplay = Math.min(10, scores.length);
        for (let i = 0; i < maxDisplay; i++) {
            const scoreInfo = scores[i];
            const identity = scoreInfo.participant;
            // Only show Player identities (optional, but good for filtering fake players if any)
            if (identity.type === "Player") {
                bodyText += `§f${i + 1}. §b${identity.displayName} §7- §e${formatRupiah(scoreInfo.score)}\n`;
            } else {
                bodyText += `§f${i + 1}. §b${identity.displayName} §7- §e${formatRupiah(scoreInfo.score)}\n`;
            }
        }

        form.body(bodyText);
        form.button("§cTutup");
        form.show(player);
    } catch (e) {
        player.sendMessage("§c[System] Gagal mengambil data scoreboard.");
    }
}

export { activeBounties, openBountyMenu, openTopKoinMenu, saveBounties };
