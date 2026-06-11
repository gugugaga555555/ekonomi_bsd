import { world, system } from "@minecraft/server";
import { getPlayerRpgData, canUseActiveSkill, savePlayerRpgData } from "./rpg_system.js";
import { safeGetGachaEffect } from "./gacha_effects.js";
import { unlockAchievement } from "./achievement_system.js";

// Global cooldown map for Second Wind
export const secondWindCooldowns = new Map();

// Global cooldown map for Undying Will (v2.6)
export const undyingWillCooldowns = new Map();

// Combat log map used by teleport_system for combat logging
export const combatLogMap = new Map();

// Global cooldown map for weapon gacha effects (to prevent spam)
const weaponEffectCooldowns = new Map();

function canProcWeaponEffect(playerName, effectId, cooldownMs) {
    const key = `${playerName}_${effectId}`;
    const lastUsed = weaponEffectCooldowns.get(key) || 0;
    if (Date.now() - lastUsed > cooldownMs) {
        weaponEffectCooldowns.set(key, Date.now());
        return true;
    }
    return false;
}

world.afterEvents.entityHitEntity.subscribe((event) => {
    const attacker = event.damagingEntity;
    const target = event.hitEntity;

    if (!attacker || attacker.typeId !== "minecraft:player") return;
    if (!target) return;

    // Ensure target has health (is alive, not an armor stand, item frame, or minecart)
    const targetHealth = target.getComponent("minecraft:health") || target.getComponent("health");
    if (!targetHealth) return;

    const isMonster = !target.typeId.includes("player") && !target.typeId.includes("item");
    if (isMonster) {
        const rpgData = getPlayerRpgData(attacker);

        // Tool Requirement check for Slayer
        const invComponent = attacker.getComponent("inventory");
        let heldItem = "";
        if (invComponent && invComponent.container) {
            const item = invComponent.container.getItem(attacker.selectedSlotIndex);
            if (item) heldItem = item.typeId;
        }

        const isHoldingWeapon = heldItem.includes("sword") || (heldItem.includes("axe") && !heldItem.includes("pickaxe"));

        // RPG Slayer Skill: Cleave Strike (Sweep Attack)
        if (rpgData.equippedSkills.includes("cleave_strike") && isHoldingWeapon) {
            if (canUseActiveSkill(attacker.name, "cleave_strike", 3000)) {
                try {
                    const dimension = attacker.dimension;
                    dimension.runCommandAsync(`damage @e[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=3,rm=0.1,type=!player,type=!item] 6 entity_attack entity "${attacker.name}"`);
                    dimension.runCommandAsync(`particle minecraft:knockback_roar_particle ${target.location.x} ${target.location.y+1} ${target.location.z}`);
                    dimension.spawnParticle("minecraft:sweep_attack_emitter", target.location);
                    dimension.runCommandAsync(`playsound random.anvil_land @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=10] 1.0 2.0`);
                    dimension.runCommandAsync(`playsound random.bow @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=10] 1.0 0.5`);
                } catch(e) {}
            }
        }

        // Passive Skill: Executioner's Mark (instant kill mobs below 25% HP, 8s CD)
        if (rpgData.equippedSkills.includes("executioners_mark") && isHoldingWeapon) {
            const tHpComp = target.getComponent("health") || target.getComponent("minecraft:health");
            if (tHpComp) {
                const hpPercent = tHpComp.currentValue / tHpComp.effectiveMax;
                if (hpPercent <= 0.25 && hpPercent > 0) {
                    if (canUseActiveSkill(attacker.name, "executioners_mark", 8000)) {
                        target.kill();
                        attacker.sendMessage("§c[Slayer] §fExecutioner's Mark! Musuh yang sekarat tewas seketika!");
                        try {
                            target.dimension.spawnParticle("minecraft:largesmoke", target.location);
                            target.dimension.runCommandAsync(`playsound random.fizz @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=10]`);
                        } catch(e) {}
                    }
                }
            }
        }

        // ============================================================
        // v2.6 -- GACHA PASSIVE COMBAT TRIGGERS
        // ============================================================

        // --- Soul Harvest (Rare): Lifesteal on every hit ---
        const gachaPassives = rpgData.equippedGachaPassives || [];
        if (gachaPassives.includes("soul_harvest")) {
            const constell = rpgData.passiveConstellation || {};
            const t = constell["soul_harvest"] || 0;
            // Lifesteal: heal based on tier
            const lifestealChance = t >= 2 ? 0.40 : t >= 1 ? 0.30 : 0.20;
            if (Math.random() < lifestealChance) {
                try {
                    const healAmount = t >= 2 ? 2 : 1;
                    attacker.addEffect("instant_health", 1, { amplifier: healAmount - 1, showParticles: true });
                    attacker.dimension.spawnParticle("minecraft:heart_particle", attacker.location);
                } catch(e) {}
            }
        }

        // --- God Slayer (Legendary): Instant kill chance on mobs below HP threshold ---
        if (gachaPassives.includes("god_slayer")) {
            const constell = rpgData.passiveConstellation || {};
            const t = constell["god_slayer"] || 0;
            const tHpComp = target.getComponent("health") || target.getComponent("minecraft:health");
            if (tHpComp) {
                const hpPercent = tHpComp.currentValue / tHpComp.effectiveMax;
                const killThreshold = t >= 2 ? 0.70 : t >= 1 ? 0.60 : 0.50;
                const killChance = t >= 2 ? 0.18 : t >= 1 ? 0.12 : 0.08;

                if (hpPercent <= killThreshold && hpPercent > 0 && Math.random() < killChance) {
                    // Instant kill! (with 3s cooldown to prevent chain)
                    if (canUseActiveSkill(attacker.name, "god_slayer", 3000)) {
                        target.kill();
                        attacker.sendMessage("§4§l[GOD SLAYER] §r§fMusuh dihancurkan seketika oleh kekuatan dewa!");
                        try {
                            target.dimension.spawnParticle("minecraft:huge_explosion_emitter", target.location);
                            target.dimension.runCommandAsync(`playsound random.explode @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=10] 0.5 2.0`);
                        } catch(e) {}
                    }
                } else if (t >= 2 && hpPercent > killThreshold) {
                    // C2 bonus: extra damage even above threshold
                    if (Math.random() < 0.15) {
                        try { target.addEffect("instant_damage", 1, { amplifier: 0, showParticles: false }); } catch(e) {}
                    }
                }
            }
        }
    }

    // ============================================================
    // GACHA WEAPON EFFECTS -- All tiers
    // ============================================================
    const invComponent = attacker.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;
    const selectedSlot = attacker.selectedSlotIndex;
    const item = inv.getItem(selectedSlot);

    if (!item) return;

    import("./gacha_effects.js").then(mod => {
        const effect = mod.safeGetGachaEffect(item);
        if (!effect || typeof effect !== 'string' || effect === "none") return;

        executeWeaponEffect(effect, attacker, target);

        // Save item back in case dynamic property was recovered from lore
        inv.setItem(selectedSlot, item);
    }).catch(() => {});
});

function executeWeaponEffect(effect, attacker, target) {

    // ============================================================
    // COMMON WEAPON EFFECTS (Low proc chance, minor effects)
    // ============================================================
    if (effect === "serrated_edge") {
        if (Math.random() < 0.15) {
            // Small extra damage via wither 1 tick
            target.addEffect("wither", 20, { amplifier: 0, showParticles: false });
        }
    } else if (effect === "keen_edge") {
        if (Math.random() < 0.10) {
            // Instant damage 1 -- basically extra damage
            try { target.addEffect("instant_damage", 1, { amplifier: 0, showParticles: false }); } catch(e) {}
        }
    } else if (effect === "hunters_instinct") {
        if (Math.random() < 0.12) {
            attacker.addEffect("speed", 40, { amplifier: 0, showParticles: false }); // Speed 1 for 2s
        }
    }

    // ============================================================
    // UNCOMMON WEAPON EFFECTS (Moderate proc chance, useful effects)
    // ============================================================
    else if (effect === "chill_touch") {
        if (Math.random() < 0.20) {
            target.addEffect("slowness", 40, { amplifier: 0, showParticles: true }); // Slow for 2s
        }
    } else if (effect === "weak_strike") {
        if (Math.random() < 0.18) {
            target.addEffect("weakness", 40, { amplifier: 0, showParticles: true }); // Weakness for 2s
        }
    } else if (effect === "knockback_hit") {
        if (Math.random() < 0.25) {
            try {
                target.applyKnockback(
                    target.location.x - attacker.location.x,
                    target.location.z - attacker.location.z,
                    1.5, 0.3
                );
            } catch(e) {}
        }
    }

    // ============================================================
    // RARE WEAPON EFFECTS (Solid combat tools)
    // ============================================================
    else if (effect === "poison_1") {
        if (Math.random() < 0.20) {
            target.addEffect("poison", 60, { amplifier: 0, showParticles: true });
        }
    } else if (effect === "frostbite") {
        if (Math.random() < 0.20) {
            target.addEffect("slowness", 60, { amplifier: 1, showParticles: true });
            target.addEffect("weakness", 60, { amplifier: 0, showParticles: true });
        }
    } else if (effect === "sonic_boom") {
        if (Math.random() < 0.15) {
            try {
                target.applyKnockback(
                    target.location.x - attacker.location.x,
                    target.location.z - attacker.location.z,
                    3.0, 0.5
                );
                target.dimension.spawnParticle("minecraft:knockback_roar_particle", target.location);
            } catch(e) {}
        }
    }

    // ============================================================
    // EPIC WEAPON EFFECTS (Powerful abilities)
    // ============================================================
    else if (effect === "fire_aspect_x") {
        if (Math.random() < 0.15) {
            target.setOnFire(10, true);
        }
    } else if (effect === "abyssal_wither") {
        if (Math.random() < 0.10) {
            target.addEffect("wither", 60, { amplifier: 1, showParticles: true });
            try { target.dimension.spawnParticle("minecraft:crop_growth_area_emitter", target.location); } catch(e) {}
        }
    } else if (effect === "blindness_strike") {
        if (Math.random() < 0.15) {
            target.addEffect("blindness", 60, { amplifier: 0, showParticles: true });
        }
    } else if (effect === "levitation_hit") {
        if (Math.random() < 0.10) {
            target.addEffect("levitation", 40, { amplifier: 9, showParticles: true });
        }
    } else if (effect === "phantom_blade") {
        if (Math.random() < 0.10) {
            try {
                target.dimension.runCommandAsync(`damage @e[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=3,rm=0.1] 5 entity_attack entity "${attacker.name}"`);
                target.dimension.spawnParticle("minecraft:sweep_attack_emitter", target.location);
            } catch(e) {}
        }
    }

    // ============================================================
    // LEGENDARY WEAPON EFFECTS (Ultimate powers)
    // ============================================================
    else if (effect === "thunderous_smite") {
        if (Math.random() < 0.05) {
            try {
                target.dimension.spawnEntity("minecraft:lightning_bolt", target.location);
                target.addEffect("slowness", 40, { amplifier: 4, showParticles: false });
                attacker.sendMessage("§e§l[THUNDEROUS SMITE] §r§fKekuatan senjata Legendary menebas musuh!");
            } catch(e) {}
        }
    } else if (effect === "vampiric") {
        if (Math.random() < 0.10) {
            attacker.addEffect("instant_health", 1, { amplifier: 1, showParticles: true });
            try { attacker.dimension.spawnParticle("minecraft:heart_particle", attacker.location); } catch(e) {}
        }
    } else if (effect === "explosive_blow") {
        if (Math.random() < 0.05) {
            try {
                target.dimension.runCommandAsync(`particle minecraft:huge_explosion_emitter ${target.location.x} ${target.location.y} ${target.location.z}`);
                target.dimension.runCommandAsync(`playsound random.explode @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=10] 1.0 1.0`);
                target.addEffect("instant_damage", 1, { amplifier: 1, showParticles: false });
            } catch(e) {}
        }
    } else if (effect === "void_strike") {
        if (Math.random() < 0.05) {
            target.addEffect("fatal_poison", 100, { amplifier: 1, showParticles: true });
            attacker.sendMessage("§5§l[VOID STRIKE] §r§fEnergi kehidupan target terserap!");
        }
    }
}

// ============================================================
// SECOND WIND -- Revive from death (Gacha Passive)
// ============================================================
world.afterEvents.entityHurt.subscribe((event) => {
    const target = event.hurtEntity;
    if (!target || target.typeId !== "minecraft:player") return;

    // Tag player in combat to prevent teleport logging
    combatLogMap.set(target.name, Date.now());

    // v2.3: Berserker's Rage -- Set flag when player is hit
    const rpgData = getPlayerRpgData(target);
    const passives = rpgData.equippedGachaPassives || [];
    if (passives.includes("berserker_rage")) {
        try { target.setDynamicProperty("berserker_rage_active", Date.now()); } catch(e) {}
    }

    const hpComp = target.getComponent("health");
    if (!hpComp) return;

    // Check if the hit was lethal
    if (hpComp.currentValue <= 0) {
        if (passives.includes("second_wind")) {
            const constell = rpgData.passiveConstellation || {};
            const tier = constell["second_wind"] || 0;

            const lastProc = secondWindCooldowns.get(target.name) || 0;
            // v2.3: Cooldown scales with constellation (C0=10m, C1=8m, C2=6m)
            const cooldownMs = tier >= 2 ? 360000 : tier >= 1 ? 480000 : 600000;
            if (Date.now() - lastProc > cooldownMs) {
                secondWindCooldowns.set(target.name, Date.now());
                unlockAchievement(target, "survive_second_wind");

                // v2.3: Revive HP scales with constellation (C0=50%, C1=75%, C2=100%)
                const revivePercent = tier >= 2 ? 1.0 : tier >= 1 ? 0.75 : 0.5;
                hpComp.setCurrentValue(Math.max(1, Math.floor(hpComp.effectiveMax * revivePercent)));

                // Give clutch buffs
                target.addEffect("resistance", 100, { amplifier: 2, showParticles: true });
                target.addEffect("regeneration", 100, { amplifier: 2, showParticles: true });
                target.addEffect("absorption", 100, { amplifier: 1, showParticles: true });

                // VFX
                try {
                    target.dimension.spawnParticle("minecraft:totem_particle", target.location);
                    target.dimension.runCommandAsync(`playsound random.totem @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=15]`);
                } catch(e) {}

                target.sendMessage("§e§l[SECOND WIND] §r§fKekuatan Gacha menyelamatkan nyawa Anda dari kematian fatal!");
            }
        }

        // v2.6: Undying Will -- Auto-revive without totem (Mythic passive)
        if (hpComp.currentValue <= 0 && passives.includes("undying_will")) {
            const constell = rpgData.passiveConstellation || {};
            const tier = constell["undying_will"] || 0;

            const lastProc = undyingWillCooldowns.get(target.name) || 0;
            // Cooldown: C0=8m, C1=6m, C2=5m
            const cooldownMs = tier >= 2 ? 300000 : tier >= 1 ? 360000 : 480000;
            if (Date.now() - lastProc > cooldownMs) {
                undyingWillCooldowns.set(target.name, Date.now());

                // Revive HP: C0=40%, C1=60%, C2=80%
                const revivePercent = tier >= 2 ? 0.80 : tier >= 1 ? 0.60 : 0.40;
                hpComp.setCurrentValue(Math.max(1, Math.floor(hpComp.effectiveMax * revivePercent)));

                // Buffs after revive
                const buffTier = tier >= 2 ? 2 : tier >= 1 ? 1 : 0;
                target.addEffect("resistance", 100, { amplifier: buffTier + 1, showParticles: true });
                target.addEffect("regeneration", 100, { amplifier: buffTier + 1, showParticles: true });
                target.addEffect("absorption", 100, { amplifier: buffTier, showParticles: true });
                if (tier >= 1) {
                    target.addEffect("speed", 100, { amplifier: 1, showParticles: true });
                }
                if (tier >= 2) {
                    target.addEffect("strength", 100, { amplifier: 1, showParticles: true });
                }

                // VFX -- more dramatic than Second Wind
                try {
                    target.dimension.spawnParticle("minecraft:totem_particle", target.location);
                    system.runTimeout(() => {
                        try { target.dimension.spawnParticle("minecraft:totem_particle", target.location); } catch(e) {}
                    }, 5);
                    target.dimension.runCommandAsync(`playsound random.totem @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=20]`);
                    target.dimension.runCommandAsync(`camerashake add @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=10] 0.8 2 positional`);
                } catch(e) {}

                target.sendMessage("§d§l[UNDYING WILL] §r§fKehendakmu terlalu kuat untuk mati! Kamu bangkit kembali!");
                world.sendMessage(`§d§l[UNDYING WILL] §r§b${target.name} §fmenolak kematian dengan kekuatan tak terbendung!`);
            }
        }
    }
});
