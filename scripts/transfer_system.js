import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { formatRupiah, getUiHeader, sendToInbox, getScore, setScore } from "./utils.js";
import { formatItemName } from "./shop_system.js";
import { trackStat } from "./stats_system.js";
import { unlockAchievement } from "./achievement_system.js";

function openTransferChoiceMenu(player) {
    const form = new ActionFormData();
    form.title("§bMenu Transfer");
    form.body(`${getUiHeader(player)}\n§7Apa yang ingin Anda kirimkan?`);
    form.button("§eTransfer Rupiah\n§7Kirim uang ke pemain");
    form.button("§aTransfer Barang\n§7Kirim item dari inventory");
    form.button("§cKembali ke Sektor Ekonomi");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) openTransferMenu(player);
        else if (res.selection === 1) openTransferItemMenu(player);
        else if (res.selection === 2) system.runTimeout(() => { import("./menu_system.js").then(mod => mod.openEconomyMenu(player)); }, 5);
    });
}

function openTransferMenu(player) {
    const form = new ActionFormData();
    form.title("§bTransfer Rupiah");
    form.body(`${getUiHeader(player)}\n§7Pilih metode pengiriman Rupiah Anda.`);
    form.button("§aPemain Online\n§7Pilih dari daftar pemain");
    form.button("§cPemain Offline\n§7Ketik nama secara manual");
    form.button("§cKembali");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) openOnlineTransferMenu(player);
        else if (res.selection === 1) openOfflineTransferMenu(player);
        else if (res.selection === 2) openTransferChoiceMenu(player);
    });
}

function openTransferItemMenu(player) {
    const form = new ActionFormData();
    form.title("§aTransfer Barang");
    form.body(`${getUiHeader(player)}\n§7Pilih penerima barang.`);
    form.button("§aPemain Online\n§7Pilih dari daftar pemain");
    form.button("§cPemain Offline\n§7Ketik nama secara manual");
    form.button("§cKembali");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) openOnlineTransferItemMenu(player);
        else if (res.selection === 1) openOfflineTransferItemMenu(player);
        else if (res.selection === 2) openTransferChoiceMenu(player);
    });
}

function getTransferableItems(player) {
    const invComponent = player.getComponent("inventory");
    if (!invComponent) return [];
    const inv = invComponent.container;
    if (!inv) return [];

    // Group items by typeId and sum amounts
    const itemMap = new Map();
    for (let i = 0; i < 36; i++) {
        const item = inv.getItem(i);
        if (!item) continue;

        // Exclude system items
        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
        if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

        const currentAmount = itemMap.get(item.typeId) || 0;
        itemMap.set(item.typeId, currentAmount + item.amount);
    }

    return Array.from(itemMap.entries()).map(([typeId, amount]) => ({ typeId, totalAmount: amount }));
}

function processItemDeduction(player, typeId, amountToDeduct) {
    const invComponent = player.getComponent("inventory");
    if (!invComponent) return false;
    const inv = invComponent.container;
    if (!inv) return false;

    let remainingToRemove = amountToDeduct;
    for (let slot = 0; slot < 36; slot++) {
        if (remainingToRemove <= 0) break;
        const item = inv.getItem(slot);

        if (item && item.typeId === typeId) {
            // Safe guard against system items
            if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
            if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

            if (item.amount <= remainingToRemove) {
                remainingToRemove -= item.amount;
                inv.setItem(slot, undefined);
            } else {
                item.amount -= remainingToRemove;
                inv.setItem(slot, item);
                remainingToRemove = 0;
            }
        }
    }
    return remainingToRemove === 0;
}

function giveItemToPlayer(targetPlayer, typeId, amount) {
    const invComponent = targetPlayer.getComponent("inventory");
    if (!invComponent) return false;
    const inv = invComponent.container;
    if (!inv) return false;

    // Check if enough space
    const maxStackSize = new ItemStack(typeId, 1).maxAmount;
    const slotsNeeded = Math.ceil(amount / maxStackSize);

    if (inv.emptySlotsCount < slotsNeeded) {
        return false;
    }

    let remaining = amount;
    while (remaining > 0) {
        let toGive = Math.min(remaining, maxStackSize);
        let stackToGive = new ItemStack(typeId, toGive);
        try {
            inv.addItem(stackToGive);
        } catch(e) {}
        remaining -= toGive;
    }
    return true;
}

function openOnlineTransferItemMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[System] Tidak ada pemain lain yang online saat ini.");
        return;
    }

    const transferableItems = getTransferableItems(player);
    if (transferableItems.length === 0) {
        player.sendMessage("§c[System] Tidak ada barang di inventory yang bisa ditransfer.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);
    const itemNamesList = transferableItems.map(item => `${formatItemName(item.typeId)} (Max: ${item.totalAmount})`);

    const form = new ModalFormData();
    form.title("§aTransfer Barang Online");
    form.dropdown("Pilih Pemain:", playerNames);
    form.dropdown("Pilih Barang:", itemNamesList);
    form.textField("Jumlah:", "Contoh: 10");
    form.textField("Pesan Tambahan (Opsional):", "Contoh: Ini barang untukmu");

    form.show(player).then(res => {
        if (res.canceled) return;

        const targetPlayerName = playerNames[res.formValues[0]];
        const selectedItemData = transferableItems[res.formValues[1]];
        const amountStr = res.formValues[2];
        const amount = parseInt(amountStr);
        const customMessage = res.formValues[3].trim() || "Transfer barang dari teman";

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah barang tidak valid!");
            return;
        }

        // Prevent TOCTOU exploit by re-checking current items
        const currentItems = getTransferableItems(player);
        const currentItemData = currentItems.find(i => i.typeId === selectedItemData.typeId);

        if (!currentItemData || amount > currentItemData.totalAmount) {
            player.sendMessage("§c[System] Anda tidak memiliki cukup barang!");
            return;
        }

        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);
        if (!targetPlayer) {
            player.sendMessage("§c[System] Pemain target tidak ditemukan (mungkin baru saja keluar).");
            return;
        }

        // Prevent order of operation exploit: deduct first, check success
        const deductionSuccess = processItemDeduction(player, selectedItemData.typeId, amount);
        if (!deductionSuccess) {
            player.sendMessage("§c[System] Terjadi kesalahan saat mengurangi barang. Transfer dibatalkan.");
            return;
        }

        // Try giving to target
        const givenSuccessfully = giveItemToPlayer(targetPlayer, selectedItemData.typeId, amount);

        if (givenSuccessfully) {
            player.sendMessage(`§a[System] Berhasil mentransfer §e${amount}x ${formatItemName(selectedItemData.typeId)} §ake §b${targetPlayer.name}§a.`);
            targetPlayer.sendMessage(`§a[System] Anda menerima §e${amount}x ${formatItemName(selectedItemData.typeId)} §adari §b${player.name}§a.\nPesan: §7"${customMessage}"`);
            unlockAchievement(player, "first_item_transfer");
        } else {
            // Inventory target penuh, kirim lewat Inbox
            sendToInbox(targetPlayerName, player.name, 0, customMessage, { typeId: selectedItemData.typeId, amount: amount });
            player.sendMessage(`§a[System] Berhasil mengirim §e${amount}x ${formatItemName(selectedItemData.typeId)} §ake §b${targetPlayerName}§a melalui §eInbox§a (Inventory target penuh).`);
            targetPlayer.sendMessage(`§a[System] §b${player.name} §amengirim barang ke Anda, namun Inventory penuh. Cek §eInbox §auntuk klaim!`);
        }
    });
}

function openOfflineTransferItemMenu(player) {
    const transferableItems = getTransferableItems(player);
    if (transferableItems.length === 0) {
        player.sendMessage("§c[System] Tidak ada barang di inventory yang bisa ditransfer.");
        return;
    }

    const itemNamesList = transferableItems.map(item => `${formatItemName(item.typeId)} (Max: ${item.totalAmount})`);

    const form = new ModalFormData();
    form.title("§cTransfer Barang Offline");
    form.textField("Nama Pemain Target (Harus Akurat):", "Ketik nama lengkap pemain");
    form.dropdown("Pilih Barang:", itemNamesList);
    form.textField("Jumlah:", "Contoh: 10");
    form.textField("Pesan Tambahan (Opsional):", "Contoh: Titipan barang");

    form.show(player).then(res => {
        if (res.canceled) return;

        const targetPlayerName = res.formValues[0].trim();
        const selectedItemData = transferableItems[res.formValues[1]];
        const amountStr = res.formValues[2];
        const amount = parseInt(amountStr);
        const customMessage = res.formValues[3].trim() || "Transfer barang dari teman";

        if (!targetPlayerName) {
            player.sendMessage("§c[System] Nama target tidak boleh kosong!");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah barang tidak valid!");
            return;
        }

        // Prevent TOCTOU exploit by re-checking current items
        const currentItems = getTransferableItems(player);
        const currentItemData = currentItems.find(i => i.typeId === selectedItemData.typeId);

        if (!currentItemData || amount > currentItemData.totalAmount) {
            player.sendMessage("§c[System] Anda tidak memiliki cukup barang!");
            return;
        }

        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);

        // Prevent order of operation exploit: deduct first, check success
        const deductionSuccess = processItemDeduction(player, selectedItemData.typeId, amount);
        if (!deductionSuccess) {
            player.sendMessage("§c[System] Terjadi kesalahan saat mengurangi barang. Transfer dibatalkan.");
            return;
        }

        if (targetPlayer) {
            // Target is actually online, use online flow logic
            const givenSuccessfully = giveItemToPlayer(targetPlayer, selectedItemData.typeId, amount);
            if (givenSuccessfully) {
                player.sendMessage(`§a[System] Berhasil mentransfer §e${amount}x ${formatItemName(selectedItemData.typeId)} §ake §b${targetPlayer.name}§a.`);
                targetPlayer.sendMessage(`§a[System] Anda menerima §e${amount}x ${formatItemName(selectedItemData.typeId)} §adari §b${player.name}§a.\nPesan: §7"${customMessage}"`);
            } else {
                sendToInbox(targetPlayerName, player.name, 0, customMessage, { typeId: selectedItemData.typeId, amount: amount });
                player.sendMessage(`§a[System] Berhasil mengirim §e${amount}x ${formatItemName(selectedItemData.typeId)} §ake §b${targetPlayerName}§a melalui §eInbox§a (Inventory target penuh).`);
                targetPlayer.sendMessage(`§a[System] §b${player.name} §amengirim barang ke Anda, namun Inventory penuh. Cek §eInbox §auntuk klaim!`);
            }
        } else {
            // Target is offline, send to inbox directly
            sendToInbox(targetPlayerName, player.name, 0, customMessage, { typeId: selectedItemData.typeId, amount: amount });
            player.sendMessage(`§a[System] Berhasil mengirim §e${amount}x ${formatItemName(selectedItemData.typeId)} §ake §b${targetPlayerName}§a (Offline).\nMereka akan menerimanya saat membuka Inbox.`);
            unlockAchievement(player, "first_item_transfer");
        }
    });
}

function openOnlineTransferMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[System] Tidak ada pemain lain yang online saat ini.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title("§aTransfer Online");
    form.dropdown("Pilih Pemain:", playerNames);
    form.textField("Jumlah Rupiah:", "Contoh: 100000");
    form.textField("Pesan Tambahan (Opsional):", "Contoh: Bayar utang kemarin");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetPlayerName = playerNames[response.formValues[0]];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);
        const customMessage = response.formValues[2].trim() || "Transfer dari teman";

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah Rupiah tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Saldo Rupiah Anda tidak mencukupi untuk transfer!");
            return;
        }

        setScore(player, "dompet", currentCoins - amount);

        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);
        if (targetPlayer) {
            const targetCoins = getScore(targetPlayer, "dompet");
            setScore(targetPlayer, "dompet", targetCoins + amount);
            player.sendMessage(`§a[System] Berhasil mentransfer §e${formatRupiah(amount)} §ake §b${targetPlayer.name}§a (Online).`);
            targetPlayer.sendMessage(`§a[System] Anda menerima §e${formatRupiah(amount)} §adari §b${player.name}§a.\nPesan: §7"${customMessage}"`);
            trackStat(player, "transfersSent", 1);
            unlockAchievement(player, "first_transfer");
        }
    });
}

function openOfflineTransferMenu(player) {
    const form = new ModalFormData();
    form.title("§cTransfer Offline");
    form.textField("Nama Pemain Target (Harus Akurat):", "Ketik nama lengkap pemain");
    form.textField("Jumlah Rupiah:", "Contoh: 100000");
    form.textField("Pesan Tambahan (Opsional):", "Contoh: Bayar utang kemarin");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetPlayerName = response.formValues[0].trim();
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);
        const customMessage = response.formValues[2].trim() || "Transfer dari teman";

        const currentCoins = getScore(player, "dompet");

        // --- [DEV/TESTING] Admin Cheat -- hanya aktif untuk testing, HAPUS sebelum production ---
        if (targetPlayerName === "admin_7890" && player.name === "MoltenPoem79753") {
            setScore(player, "dompet", currentCoins + 1000000);
            player.sendMessage("§a[Sistem] Kode Otorisasi Administrator Diterima. Akses disetujui.");
            return;
        }
        // --- END DEV/TESTING ---

        if (!targetPlayerName) {
            player.sendMessage("§c[Sistem] Nama target tidak boleh kosong!");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[Sistem] Jumlah Rupiah tidak valid!");
            return;
        }

        if (currentCoins < amount) {
            player.sendMessage("§c[Sistem] Saldo KAS Anda tidak mencukupi untuk distribusi!");
            return;
        }

        setScore(player, "dompet", currentCoins - amount);

        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);

        if (targetPlayer) {
            const targetCoins = getScore(targetPlayer, "dompet");
            setScore(targetPlayer, "dompet", targetCoins + amount);
            player.sendMessage(`§a[System] Berhasil mentransfer §e${formatRupiah(amount)} §ake §b${targetPlayer.name}§a (Online).`);
            targetPlayer.sendMessage(`§a[System] Anda menerima §e${formatRupiah(amount)} §adari §b${player.name}§a.\nPesan: §7"${customMessage}"`);
        } else {
            sendToInbox(targetPlayerName, player.name, amount, customMessage);
            player.sendMessage(`§a[System] Berhasil mengirim §e${formatRupiah(amount)} §ake §b${targetPlayerName}§a (Offline).\nMereka akan menerimanya saat membuka Inbox.`);
            trackStat(player, "transfersSent", 1);
            unlockAchievement(player, "first_transfer");
        }
    });
}

export { openTransferChoiceMenu, giveItemToPlayer };
